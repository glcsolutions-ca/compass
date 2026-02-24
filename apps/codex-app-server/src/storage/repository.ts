import { Pool } from "pg";

export interface ThreadRecord {
  threadId: string;
  title: string | null;
  status: string;
  model: string | null;
  cwd: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  metadata: unknown;
}

export interface TurnRecord {
  turnId: string;
  threadId: string;
  status: string;
  input: unknown;
  output: unknown;
  error: unknown;
  startedAt: string;
  completedAt: string | null;
}

export interface ThreadDetails {
  thread: ThreadRecord;
  turns: TurnRecord[];
  items: unknown[];
  approvals: unknown[];
  events: unknown[];
}

export interface PersistenceRepository {
  upsertThread(thread: unknown): Promise<void>;
  upsertTurn(threadId: string, turn: unknown, input?: unknown): Promise<void>;
  upsertItem(threadId: string, turnId: string, item: unknown, lifecycle: string): Promise<void>;
  insertEvent(
    threadId: string | null,
    turnId: string | null,
    method: string,
    payload: unknown
  ): Promise<void>;
  listThreads(limit: number): Promise<ThreadRecord[]>;
  readThread(threadId: string): Promise<ThreadDetails | null>;
  insertApproval(requestId: string, method: string, params: unknown): Promise<void>;
  resolveApproval(requestId: string, decision: "accept" | "decline"): Promise<void>;
  upsertAuthState(authMode: string | null, account: unknown): Promise<void>;
  close(): Promise<void>;
}

export class PostgresRepository implements PersistenceRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async upsertThread(thread: unknown): Promise<void> {
    const threadRecord = asRecord(thread);
    const threadId = readString(threadRecord, "id") ?? readString(threadRecord, "threadId");
    if (!threadId) {
      return;
    }

    const status = readStatus(threadRecord.status);
    const title =
      readString(threadRecord, "name") ??
      readString(threadRecord, "preview") ??
      readString(threadRecord, "title");
    const model = readString(threadRecord, "model");
    const cwd = readString(threadRecord, "cwd");
    const archived = Boolean(threadRecord.archived);

    await this.pool.query(
      `
        insert into codex_threads (
          thread_id,
          title,
          status,
          model,
          cwd,
          archived,
          metadata,
          created_at,
          updated_at
        ) values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7::jsonb,
          now(),
          now()
        )
        on conflict (thread_id)
        do update set
          title = excluded.title,
          status = excluded.status,
          model = excluded.model,
          cwd = excluded.cwd,
          archived = excluded.archived,
          metadata = excluded.metadata,
          updated_at = now()
      `,
      [
        threadId,
        title ?? null,
        status,
        model ?? null,
        cwd ?? null,
        archived,
        JSON.stringify(thread)
      ]
    );
  }

  async upsertTurn(threadId: string, turn: unknown, input?: unknown): Promise<void> {
    const turnRecord = asRecord(turn);
    const turnId = readString(turnRecord, "id") ?? readString(turnRecord, "turnId");
    if (!turnId) {
      return;
    }

    const status = readString(turnRecord, "status") ?? "inProgress";
    const error = turnRecord.error ?? null;
    const output = turnRecord.items ?? turnRecord.output ?? null;
    const completedAt = status === "inProgress" ? null : new Date().toISOString();

    await this.pool.query(
      `
        insert into codex_turns (
          turn_id,
          thread_id,
          status,
          input,
          output,
          error,
          started_at,
          completed_at
        ) values (
          $1,
          $2,
          $3,
          $4::jsonb,
          $5::jsonb,
          $6::jsonb,
          now(),
          $7::timestamptz
        )
        on conflict (turn_id)
        do update set
          status = excluded.status,
          input = excluded.input,
          output = excluded.output,
          error = excluded.error,
          completed_at = excluded.completed_at
      `,
      [
        turnId,
        threadId,
        status,
        JSON.stringify(input ?? []),
        JSON.stringify(output),
        JSON.stringify(error),
        completedAt
      ]
    );
  }

  async upsertItem(
    threadId: string,
    turnId: string,
    item: unknown,
    lifecycle: string
  ): Promise<void> {
    const itemRecord = asRecord(item);
    const itemId = readString(itemRecord, "id");
    if (!itemId) {
      return;
    }

    const itemType = readString(itemRecord, "type") ?? "unknown";
    const status =
      readString(itemRecord, "status") ?? (lifecycle === "completed" ? "completed" : "inProgress");

    await this.pool.query(
      `
        insert into codex_items (
          item_id,
          thread_id,
          turn_id,
          item_type,
          status,
          payload,
          created_at,
          updated_at
        ) values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          now(),
          now()
        )
        on conflict (item_id)
        do update set
          status = excluded.status,
          payload = excluded.payload,
          updated_at = now()
      `,
      [itemId, threadId, turnId, itemType, status, JSON.stringify(item)]
    );
  }

  async insertEvent(
    threadId: string | null,
    turnId: string | null,
    method: string,
    payload: unknown
  ): Promise<void> {
    await this.pool.query(
      `
        insert into codex_events (
          thread_id,
          turn_id,
          method,
          payload,
          created_at
        ) values ($1, $2, $3, $4::jsonb, now())
      `,
      [threadId, turnId, method, JSON.stringify(payload)]
    );
  }

  async listThreads(limit: number): Promise<ThreadRecord[]> {
    const result = await this.pool.query(
      `
        select
          thread_id as "threadId",
          title,
          status,
          model,
          cwd,
          archived,
          created_at as "createdAt",
          updated_at as "updatedAt",
          metadata
        from codex_threads
        order by updated_at desc
        limit $1
      `,
      [limit]
    );

    return result.rows as ThreadRecord[];
  }

  async readThread(threadId: string): Promise<ThreadDetails | null> {
    const threadResult = await this.pool.query(
      `
        select
          thread_id as "threadId",
          title,
          status,
          model,
          cwd,
          archived,
          created_at as "createdAt",
          updated_at as "updatedAt",
          metadata
        from codex_threads
        where thread_id = $1
      `,
      [threadId]
    );

    const thread = threadResult.rows.at(0) as ThreadRecord | undefined;
    if (!thread) {
      return null;
    }

    const [turns, items, approvals, events] = await Promise.all([
      this.pool.query(
        `
          select
            turn_id as "turnId",
            thread_id as "threadId",
            status,
            input,
            output,
            error,
            started_at as "startedAt",
            completed_at as "completedAt"
          from codex_turns
          where thread_id = $1
          order by started_at asc
        `,
        [threadId]
      ),
      this.pool.query(
        `
          select
            item_id as "itemId",
            turn_id as "turnId",
            item_type as "itemType",
            status,
            payload,
            created_at as "createdAt",
            updated_at as "updatedAt"
          from codex_items
          where thread_id = $1
          order by updated_at asc
        `,
        [threadId]
      ),
      this.pool.query(
        `
          select
            request_id as "requestId",
            thread_id as "threadId",
            turn_id as "turnId",
            item_id as "itemId",
            approval_type as "approvalType",
            status,
            decision,
            reason,
            payload,
            created_at as "createdAt",
            resolved_at as "resolvedAt"
          from codex_approvals
          where thread_id = $1
          order by created_at asc
        `,
        [threadId]
      ),
      this.pool.query(
        `
          select
            id,
            thread_id as "threadId",
            turn_id as "turnId",
            method,
            payload,
            created_at as "createdAt"
          from codex_events
          where thread_id = $1
          order by created_at asc
        `,
        [threadId]
      )
    ]);

    return {
      thread,
      turns: turns.rows as TurnRecord[],
      items: items.rows,
      approvals: approvals.rows,
      events: events.rows
    };
  }

  async insertApproval(requestId: string, method: string, params: unknown): Promise<void> {
    const paramRecord = asRecord(params);
    const threadId = readString(paramRecord, "threadId");
    const turnId = readString(paramRecord, "turnId");
    const itemId = readString(paramRecord, "itemId");
    const reason = readString(paramRecord, "reason") ?? null;
    const approvalType = method.includes("commandExecution") ? "commandExecution" : "fileChange";

    await this.pool.query(
      `
        insert into codex_approvals (
          request_id,
          thread_id,
          turn_id,
          item_id,
          approval_type,
          status,
          reason,
          payload,
          created_at
        ) values (
          $1,
          $2,
          $3,
          $4,
          $5,
          'pending',
          $6,
          $7::jsonb,
          now()
        )
        on conflict (request_id)
        do update set
          status = 'pending',
          reason = excluded.reason,
          payload = excluded.payload
      `,
      [requestId, threadId, turnId, itemId, approvalType, reason, JSON.stringify(params)]
    );
  }

  async resolveApproval(requestId: string, decision: "accept" | "decline"): Promise<void> {
    await this.pool.query(
      `
        update codex_approvals
        set status = 'resolved',
            decision = $2,
            resolved_at = now()
        where request_id = $1
      `,
      [requestId, decision]
    );
  }

  async upsertAuthState(authMode: string | null, account: unknown): Promise<void> {
    await this.pool.query(
      `
        insert into codex_auth_state (
          auth_state_id,
          auth_mode,
          account,
          updated_at
        ) values ('global', $1, $2::jsonb, now())
        on conflict (auth_state_id)
        do update set
          auth_mode = excluded.auth_mode,
          account = excluded.account,
          updated_at = now()
      `,
      [authMode, JSON.stringify(account)]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export class InMemoryRepository implements PersistenceRepository {
  private readonly threads = new Map<string, ThreadRecord>();
  private readonly turns = new Map<string, TurnRecord>();
  private readonly items = new Map<string, unknown>();
  private readonly approvals = new Map<string, unknown>();
  private readonly events: unknown[] = [];
  private authState: unknown = null;

  async upsertThread(thread: unknown): Promise<void> {
    const threadRecord = asRecord(thread);
    const threadId = readString(threadRecord, "id") ?? readString(threadRecord, "threadId");
    if (!threadId) {
      return;
    }

    const now = new Date().toISOString();
    const existing = this.threads.get(threadId);
    this.threads.set(threadId, {
      threadId,
      title: readString(threadRecord, "name") ?? readString(threadRecord, "preview") ?? null,
      status: readStatus(threadRecord.status),
      model: readString(threadRecord, "model") ?? null,
      cwd: readString(threadRecord, "cwd") ?? null,
      archived: Boolean(threadRecord.archived),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      metadata: thread
    });
  }

  async upsertTurn(threadId: string, turn: unknown, input?: unknown): Promise<void> {
    const turnRecord = asRecord(turn);
    const turnId = readString(turnRecord, "id") ?? readString(turnRecord, "turnId");
    if (!turnId) {
      return;
    }

    const now = new Date().toISOString();
    this.turns.set(turnId, {
      turnId,
      threadId,
      status: readString(turnRecord, "status") ?? "inProgress",
      input: input ?? [],
      output: turnRecord.items ?? turnRecord.output ?? null,
      error: turnRecord.error ?? null,
      startedAt: this.turns.get(turnId)?.startedAt ?? now,
      completedAt: (readString(turnRecord, "status") ?? "inProgress") === "inProgress" ? null : now
    });
  }

  async upsertItem(
    threadId: string,
    turnId: string,
    item: unknown,
    lifecycle: string
  ): Promise<void> {
    const itemRecord = asRecord(item);
    const itemId = readString(itemRecord, "id");
    if (!itemId) {
      return;
    }

    this.items.set(itemId, {
      itemId,
      threadId,
      turnId,
      lifecycle,
      item
    });
  }

  async insertEvent(
    threadId: string | null,
    turnId: string | null,
    method: string,
    payload: unknown
  ): Promise<void> {
    this.events.push({
      threadId,
      turnId,
      method,
      payload,
      createdAt: new Date().toISOString()
    });
  }

  async listThreads(limit: number): Promise<ThreadRecord[]> {
    return [...this.threads.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async readThread(threadId: string): Promise<ThreadDetails | null> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      return null;
    }

    return {
      thread,
      turns: [...this.turns.values()].filter((turn) => turn.threadId === threadId),
      items: [...this.items.values()].filter((item) => {
        const record = asRecord(item);
        return readString(record, "threadId") === threadId;
      }),
      approvals: [...this.approvals.values()].filter((approval) => {
        const record = asRecord(approval);
        return readString(record, "threadId") === threadId;
      }),
      events: this.events.filter((event) => {
        const record = asRecord(event);
        return readString(record, "threadId") === threadId;
      })
    };
  }

  async insertApproval(requestId: string, method: string, params: unknown): Promise<void> {
    this.approvals.set(requestId, {
      requestId,
      method,
      threadId: readString(asRecord(params), "threadId") ?? null,
      params,
      status: "pending"
    });
  }

  async resolveApproval(requestId: string, decision: "accept" | "decline"): Promise<void> {
    const existing = asRecord(this.approvals.get(requestId));
    this.approvals.set(requestId, {
      ...existing,
      status: "resolved",
      decision,
      resolvedAt: new Date().toISOString()
    });
  }

  async upsertAuthState(authMode: string | null, account: unknown): Promise<void> {
    this.authState = {
      authMode,
      account,
      updatedAt: new Date().toISOString()
    };
  }

  async close(): Promise<void> {
    return;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStatus(value: unknown): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    const nested = (value as Record<string, unknown>).type;
    if (typeof nested === "string" && nested.length > 0) {
      return nested;
    }
  }

  return "unknown";
}
