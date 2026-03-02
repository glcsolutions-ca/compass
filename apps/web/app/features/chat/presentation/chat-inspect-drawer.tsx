import { useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "~/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { AgentEvent } from "~/features/chat/agent-types";
import type {
  ChatInspectState,
  ChatInspectTab
} from "~/features/chat/presentation/chat-runtime-store";
import { eventRendersInline } from "~/features/chat/runtime-part-parser";
import { cn } from "~/lib/utils/cn";

const INSPECT_CURSOR_QUERY_PARAM = "inspect";
const INSPECT_TAB_QUERY_PARAM = "inspectTab";
const DEFAULT_INSPECT_TAB: ChatInspectTab = "activity";

function isChatInspectTab(value: string | null): value is ChatInspectTab {
  return (
    value === "activity" ||
    value === "terminal" ||
    value === "files" ||
    value === "diff" ||
    value === "raw"
  );
}

function readPayloadObject(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

function readMaybeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseTerminalChunk(event: AgentEvent): string | null {
  if (event.method === "item.delta") {
    const payload = readPayloadObject(event.payload);
    const text = readMaybeText(payload?.text);
    if (text) {
      return text;
    }
  }

  const payload = readPayloadObject(event.payload);
  const stdout = readMaybeText(payload?.stdout);
  if (stdout) {
    return stdout;
  }

  const stderr = readMaybeText(payload?.stderr);
  if (stderr) {
    return stderr;
  }

  return null;
}

function parseDiffChunk(payload: unknown): string | null {
  const data = readPayloadObject(payload);
  const diff =
    readMaybeText(data?.diff) ?? readMaybeText(data?.patch) ?? readMaybeText(data?.unifiedDiff);
  return diff;
}

function parseFilePath(payload: unknown): string | null {
  const data = readPayloadObject(payload);
  const singlePath =
    readMaybeText(data?.path) ?? readMaybeText(data?.filePath) ?? readMaybeText(data?.filename);
  if (singlePath) {
    return singlePath;
  }

  const files = data?.files;
  if (!Array.isArray(files)) {
    return null;
  }

  for (const file of files) {
    if (!file || typeof file !== "object") {
      continue;
    }

    const candidate = readMaybeText((file as { path?: unknown }).path);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function parseChatInspectState(searchParams: URLSearchParams): ChatInspectState {
  const rawCursor = searchParams.get(INSPECT_CURSOR_QUERY_PARAM);
  const numericCursor = rawCursor !== null ? Number.parseInt(rawCursor, 10) : Number.NaN;
  const cursor = Number.isFinite(numericCursor) && numericCursor >= 0 ? numericCursor : null;

  const requestedTab = searchParams.get(INSPECT_TAB_QUERY_PARAM);

  return {
    cursor,
    tab: isChatInspectTab(requestedTab) ? requestedTab : DEFAULT_INSPECT_TAB
  };
}

export function buildChatInspectSearchParams(
  currentSearchParams: URLSearchParams,
  state: ChatInspectState
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(currentSearchParams);

  if (state.cursor === null) {
    nextSearchParams.delete(INSPECT_CURSOR_QUERY_PARAM);
    nextSearchParams.delete(INSPECT_TAB_QUERY_PARAM);
    return nextSearchParams;
  }

  nextSearchParams.set(INSPECT_CURSOR_QUERY_PARAM, state.cursor.toString());
  nextSearchParams.set(INSPECT_TAB_QUERY_PARAM, state.tab);
  return nextSearchParams;
}

interface ChatInspectDrawerProps {
  events: AgentEvent[];
  inspectState: ChatInspectState;
  onInspectStateChange: (nextState: ChatInspectState, options?: { replace?: boolean }) => void;
}

export function ChatInspectDrawer({
  events,
  inspectState,
  onInspectStateChange
}: ChatInspectDrawerProps) {
  const open = inspectState.cursor !== null;
  const selectedEvent = useMemo(
    () =>
      inspectState.cursor === null
        ? null
        : (events.find((event) => event.cursor === inspectState.cursor) ?? null),
    [events, inspectState.cursor]
  );

  const scopedEvents = useMemo(
    () =>
      events.filter((event) => inspectState.cursor === null || event.cursor <= inspectState.cursor),
    [events, inspectState.cursor]
  );

  const terminalOutput = useMemo(() => {
    return scopedEvents
      .map((event) => parseTerminalChunk(event))
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }, [scopedEvents]);

  const filePaths = useMemo(() => {
    const entries = scopedEvents
      .map((event) => parseFilePath(event.payload))
      .filter((value): value is string => Boolean(value));
    return [...new Set(entries)];
  }, [scopedEvents]);

  const diffContent = useMemo(() => {
    for (let index = scopedEvents.length - 1; index >= 0; index -= 1) {
      const diff = parseDiffChunk(scopedEvents[index]?.payload);
      if (diff) {
        return diff;
      }
    }
    return "";
  }, [scopedEvents]);

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          return;
        }

        onInspectStateChange(
          {
            cursor: null,
            tab: inspectState.tab
          },
          { replace: false }
        );
      }}
      open={open}
    >
      <SheetContent className="w-[92vw] sm:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>Execution Details</SheetTitle>
          <SheetDescription>
            {selectedEvent
              ? `${selectedEvent.method} · cursor ${selectedEvent.cursor.toString()}`
              : "Select a timeline event to inspect runtime details."}
          </SheetDescription>
        </SheetHeader>

        <Tabs
          className="mt-4 flex h-[calc(100%-4rem)] min-h-0 flex-col"
          onValueChange={(value) => {
            if (!isChatInspectTab(value)) {
              return;
            }

            onInspectStateChange(
              {
                cursor: inspectState.cursor,
                tab: value
              },
              { replace: true }
            );
          }}
          value={inspectState.tab}
        >
          <div className="border-b border-border/70 pb-2">
            <TabsList className="grid h-9 grid-cols-5">
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="terminal">Terminal</TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="diff">Diff</TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-auto pt-3" value="activity">
            <ul className="space-y-2">
              {events.length === 0 ? (
                <li className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                  Runtime events will appear here once a turn starts.
                </li>
              ) : (
                events.map((event) => {
                  const renderedInline = eventRendersInline(event);

                  return (
                    <li key={event.cursor}>
                      <button
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                          inspectState.cursor === event.cursor
                            ? "border-primary/40 bg-primary/10"
                            : "border-border/70 bg-card/70 hover:bg-accent"
                        )}
                        onClick={() =>
                          onInspectStateChange(
                            {
                              cursor: event.cursor,
                              tab: inspectState.tab
                            },
                            { replace: true }
                          )
                        }
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-foreground">{event.method}</p>
                          {renderedInline ? (
                            <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              Inline
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          cursor {event.cursor} · {new Date(event.createdAt).toLocaleTimeString()}
                        </p>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-auto pt-3" value="terminal">
            {terminalOutput ? (
              <pre className="rounded-lg border border-border/70 bg-card/70 p-3 text-xs leading-relaxed">
                {terminalOutput}
              </pre>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                No terminal output for this selection yet.
              </div>
            )}
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-auto pt-3" value="files">
            {filePaths.length > 0 ? (
              <ul className="space-y-2">
                {filePaths.map((filePath) => (
                  <li
                    key={filePath}
                    className="rounded-lg border border-border/70 bg-card/70 px-3 py-2 text-xs text-foreground"
                  >
                    {filePath}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                No file artifacts for this selection.
              </div>
            )}
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-auto pt-3" value="diff">
            {diffContent ? (
              <pre className="overflow-x-auto rounded-lg border border-border/70 bg-card/70 p-3 text-xs leading-relaxed">
                {diffContent}
              </pre>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                No diff payload available for this selection.
              </div>
            )}
          </TabsContent>

          <TabsContent className="m-0 min-h-0 flex-1 overflow-auto pt-3" value="raw">
            <pre className="overflow-x-auto rounded-lg border border-border/70 bg-card/70 p-3 text-xs leading-relaxed">
              {selectedEvent ? JSON.stringify(selectedEvent.payload, null, 2) : "{}"}
            </pre>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
