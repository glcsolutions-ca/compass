import {
  AssistantRuntimeProvider,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type ExternalStoreAdapter
} from "@assistant-ui/react";
import { ThreadList } from "@assistant-ui/react-ui";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  EllipsisIcon,
  PencilIcon,
  Trash2Icon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "~/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "~/components/ui/dropdown-menu";
import {
  deleteAgentThreadClient,
  listAgentThreadsClient,
  patchAgentThreadClient
} from "~/features/chat/agent-client";
import type { AgentThread } from "~/features/chat/agent-types";
import { buildThreadHref, buildNewThreadHref } from "~/features/chat/new-thread-routing";

function readActiveThreadId(pathname: string): string | null {
  const match = /^\/w\/[^/]+\/chat\/([^/]+)$/u.exec(pathname);
  if (!match?.[1]) {
    return null;
  }

  const decoded = decodeURIComponent(match[1]).trim();
  return decoded.length > 0 ? decoded : null;
}

function readWorkspaceSlug(pathname: string): string | null {
  const match = /^\/w\/([^/]+)\/chat(?:\/|$)/u.exec(pathname);
  if (!match?.[1]) {
    return null;
  }

  const decoded = decodeURIComponent(match[1]).trim();
  return decoded.length > 0 ? decoded : null;
}

function resolveThreadTitle(thread: AgentThread): string {
  const title = thread.title?.trim();
  if (title) {
    return title;
  }

  return `Thread ${thread.threadId.slice(0, 8)}`;
}

function ThreadListItemActions() {
  const aui = useAui();
  const title = useAuiState((state) => state.threadListItem.title ?? "");
  const status = useAuiState((state) => state.threadListItem.status);

  const handleRename = useCallback(() => {
    const rawTitle = window.prompt("Rename thread", title);
    if (rawTitle === null) {
      return;
    }

    const nextTitle = rawTitle.trim();
    if (!nextTitle || nextTitle === title) {
      return;
    }

    aui.threadListItem().rename(nextTitle);
  }, [aui, title]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Thread actions"
          className="aui-thread-list-item-more-trigger"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          type="button"
        >
          <EllipsisIcon className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[11rem]" sideOffset={6}>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            handleRename();
          }}
        >
          <PencilIcon className="mr-2 h-3.5 w-3.5" />
          Rename
        </DropdownMenuItem>

        {status === "archived" ? (
          <>
            <ThreadListItemPrimitive.Unarchive asChild>
              <DropdownMenuItem onSelect={(event) => event.stopPropagation()}>
                <ArchiveRestoreIcon className="mr-2 h-3.5 w-3.5" />
                Unarchive
              </DropdownMenuItem>
            </ThreadListItemPrimitive.Unarchive>
            <DropdownMenuSeparator />
            <ThreadListItemPrimitive.Delete asChild>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(event) => event.stopPropagation()}
              >
                <Trash2Icon className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </ThreadListItemPrimitive.Delete>
          </>
        ) : (
          <ThreadListItemPrimitive.Archive asChild>
            <DropdownMenuItem onSelect={(event) => event.stopPropagation()}>
              <ArchiveIcon className="mr-2 h-3.5 w-3.5" />
              Archive
            </DropdownMenuItem>
          </ThreadListItemPrimitive.Archive>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root className="group aui-thread-list-item">
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger">
        <p className="aui-thread-list-item-title">
          <ThreadListItemPrimitive.Title fallback="Untitled thread" />
        </p>
      </ThreadListItemPrimitive.Trigger>
      <ThreadListItemActions />
    </ThreadListItemPrimitive.Root>
  );
}

export function ChatThreadRail({
  pathname,
  defaultWorkspaceSlug
}: {
  pathname: string;
  defaultWorkspaceSlug: string;
}) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const activeThreadId = readActiveThreadId(pathname);
  const activeWorkspaceSlug = readWorkspaceSlug(pathname) ?? defaultWorkspaceSlug;

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refreshThreads = useCallback(async () => {
    if (!activeWorkspaceSlug) {
      if (isMountedRef.current) {
        setThreads([]);
        setLoadError(null);
      }
      return;
    }

    if (isMountedRef.current) {
      setIsLoading(true);
    }
    try {
      const nextThreads = await listAgentThreadsClient({
        workspaceSlug: activeWorkspaceSlug,
        state: "all",
        limit: 60
      });
      if (!isMountedRef.current) {
        return;
      }

      setThreads(nextThreads);
      setLoadError(null);
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const message = error instanceof Error ? error.message : "Unable to load threads.";
      setLoadError(message);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [activeWorkspaceSlug]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  const regularThreadItems = useMemo(
    () =>
      threads
        .filter((thread) => !thread.archived)
        .map((thread) => ({
          status: "regular" as const,
          id: thread.threadId,
          title: resolveThreadTitle(thread)
        })),
    [threads]
  );
  const archivedThreadItems = useMemo(
    () =>
      threads
        .filter((thread) => thread.archived)
        .map((thread) => ({
          status: "archived" as const,
          id: thread.threadId,
          title: resolveThreadTitle(thread)
        })),
    [threads]
  );

  const threadWorkspaceById = useMemo(
    () => new Map(threads.map((thread) => [thread.threadId, thread.workspaceSlug])),
    [threads]
  );

  const threadListStore = useMemo<ExternalStoreAdapter>(
    () => ({
      isRunning: false,
      messages: [],
      onNew: async (_message) => undefined,
      adapters: {
        threadList: {
          threadId:
            activeThreadId ?? regularThreadItems[0]?.id ?? archivedThreadItems[0]?.id ?? undefined,
          threads: regularThreadItems,
          archivedThreads: archivedThreadItems,
          onSwitchToNewThread: async () => {
            void navigate(buildNewThreadHref({ workspaceSlug: activeWorkspaceSlug }));
          },
          onSwitchToThread: async (threadId: string) => {
            const targetWorkspaceSlug =
              threadWorkspaceById.get(threadId) || activeWorkspaceSlug || defaultWorkspaceSlug;
            void navigate(buildThreadHref(targetWorkspaceSlug, threadId));
          },
          onRename: async (threadId: string, newTitle: string) => {
            const title = newTitle.trim();
            if (!title) {
              return;
            }

            await patchAgentThreadClient({
              threadId,
              title
            });
            await refreshThreads();
          },
          onArchive: async (threadId: string) => {
            await patchAgentThreadClient({
              threadId,
              archived: true
            });
            await refreshThreads();
          },
          onUnarchive: async (threadId: string) => {
            await patchAgentThreadClient({
              threadId,
              archived: false
            });
            await refreshThreads();
          },
          onDelete: async (threadId: string) => {
            await deleteAgentThreadClient({ threadId });

            if (threadId === activeThreadId) {
              void navigate(buildNewThreadHref({ workspaceSlug: activeWorkspaceSlug }), {
                replace: true
              });
            }

            await refreshThreads();
          }
        }
      }
    }),
    [
      activeThreadId,
      activeWorkspaceSlug,
      archivedThreadItems,
      defaultWorkspaceSlug,
      navigate,
      refreshThreads,
      regularThreadItems,
      threadWorkspaceById
    ]
  );

  const threadListRuntime = useExternalStoreRuntime(threadListStore);

  const hasAnyThreads = regularThreadItems.length > 0 || archivedThreadItems.length > 0;

  return (
    <SidebarGroup className="px-0 pt-0">
      <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
        Threads
      </SidebarGroupLabel>
      <SidebarGroupContent className="px-1">
        {isLoading && !hasAnyThreads ? (
          <p className="px-2 py-1.5 text-xs text-sidebar-foreground/60">Loading threads...</p>
        ) : !hasAnyThreads ? (
          <p className="px-2 py-1.5 text-xs text-sidebar-foreground/60">No threads yet.</p>
        ) : (
          <AssistantRuntimeProvider runtime={threadListRuntime}>
            <ThreadList.Root className="aui-thread-list-root">
              <ThreadList.New />
              <ThreadList.Items
                components={{
                  ThreadListItem: SidebarThreadListItem
                }}
              />
              {archivedThreadItems.length > 0 ? (
                <>
                  <p className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/55">
                    Archived
                  </p>
                  <ThreadListPrimitive.Items
                    archived
                    components={{
                      ThreadListItem: SidebarThreadListItem
                    }}
                  />
                </>
              ) : null}
            </ThreadList.Root>
          </AssistantRuntimeProvider>
        )}
        {loadError ? <p className="px-2 pt-1 text-[11px] text-destructive">{loadError}</p> : null}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
