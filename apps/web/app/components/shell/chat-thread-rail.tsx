import {
  AssistantRuntimeProvider,
  type ExternalStoreAdapter,
  ThreadListItemPrimitive,
  useExternalStoreRuntime
} from "@assistant-ui/react";
import { ThreadList } from "@assistant-ui/react-ui";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from "~/components/ui/sidebar";
import { buildThreadHref, buildNewThreadHref } from "~/features/chat/new-thread-routing";
import {
  readChatThreadHistory,
  type ChatThreadHistoryItem
} from "~/features/chat/chat-thread-history";
import { buildAssistantThreadListItems } from "~/features/chat/presentation/chat-runtime-store";

function readActiveThreadId(pathname: string): string | null {
  const match = /^\/chat\/([^/]+)$/u.exec(pathname);
  if (!match?.[1]) {
    return null;
  }

  const decoded = decodeURIComponent(match[1]).trim();
  return decoded.length > 0 ? decoded : null;
}

function SidebarThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root className="aui-thread-list-item">
      <ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger">
        <p className="aui-thread-list-item-title">
          <ThreadListItemPrimitive.Title fallback="Untitled thread" />
        </p>
      </ThreadListItemPrimitive.Trigger>
    </ThreadListItemPrimitive.Root>
  );
}

export function ChatThreadRail({ pathname }: { pathname: string }) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<ChatThreadHistoryItem[]>([]);

  useEffect(() => {
    setThreads(readChatThreadHistory());
  }, [pathname]);

  const visibleThreads = useMemo(() => threads.slice(0, 12), [threads]);
  const activeThreadId = readActiveThreadId(pathname);
  const threadListItems = useMemo(
    () => buildAssistantThreadListItems(visibleThreads),
    [visibleThreads]
  );

  const threadListStore = useMemo<ExternalStoreAdapter>(
    () => ({
      isRunning: false,
      messages: [],
      onNew: async (_message) => undefined,
      adapters: {
        threadList: {
          threadId: activeThreadId ?? threadListItems[0]?.id ?? undefined,
          threads: threadListItems,
          onSwitchToNewThread: async () => {
            void navigate(buildNewThreadHref());
          },
          onSwitchToThread: async (threadId: string) => {
            void navigate(buildThreadHref(threadId));
          }
        }
      }
    }),
    [activeThreadId, navigate, threadListItems]
  );

  const threadListRuntime = useExternalStoreRuntime(threadListStore);

  return (
    <SidebarGroup className="px-0 pt-0">
      <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/60">
        Threads
      </SidebarGroupLabel>
      <SidebarGroupContent className="px-1">
        {visibleThreads.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-sidebar-foreground/60">No recent threads.</p>
        ) : (
          <AssistantRuntimeProvider runtime={threadListRuntime}>
            <ThreadList.Root className="aui-thread-list-root">
              <ThreadList.Items
                components={{
                  ThreadListItem: SidebarThreadListItem
                }}
              />
            </ThreadList.Root>
          </AssistantRuntimeProvider>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
