import { Client } from "pg";

type DatabaseClientFactory = (connectionString: string) => {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  end(): Promise<unknown>;
};

const DEFAULT_STARTUP_DATABASE_ERROR = "Database connectivity check failed";

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function redactDatabaseUrl(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password.length > 0) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
}

function extractStartupErrorReason(error: unknown): string {
  if (error instanceof AggregateError) {
    for (const nestedError of error.errors) {
      const nestedReason = extractStartupErrorReason(nestedError);
      if (nestedReason.length > 0 && nestedReason !== "[object Object]") {
        return nestedReason;
      }
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) {
      return message;
    }
  }

  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim().length > 0) {
      return code.trim();
    }
  }

  return DEFAULT_STARTUP_DATABASE_ERROR;
}

export function requireDatabaseUrl(databaseUrl: string | undefined): string {
  const normalized = normalize(databaseUrl);
  if (!normalized) {
    throw new Error("DATABASE_URL is required to start API.");
  }
  return normalized;
}

export async function verifyDatabaseReadiness({
  databaseUrl,
  clientFactory = (connectionString: string) => new Client({ connectionString })
}: {
  databaseUrl: string;
  clientFactory?: DatabaseClientFactory;
}): Promise<void> {
  const client = clientFactory(databaseUrl);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    await client.query("select 1");
  } catch (error) {
    const reason = extractStartupErrorReason(error);
    throw new Error(
      `API startup dependency check failed for ${redactDatabaseUrl(databaseUrl)}: ${reason}`,
      { cause: error }
    );
  } finally {
    if (connected) {
      await client.end().catch(() => {});
    }
  }
}
