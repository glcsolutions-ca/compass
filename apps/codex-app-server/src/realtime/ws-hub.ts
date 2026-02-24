import type { WebSocket } from "ws";

export interface StreamEvent {
  type:
    | "thread.started"
    | "turn.started"
    | "item.started"
    | "item.delta"
    | "item.completed"
    | "turn.completed"
    | "approval.requested"
    | "approval.resolved"
    | "error";
  method?: string;
  requestId?: string;
  payload: unknown;
}

interface Subscription {
  socket: WebSocket;
  threadId: string | null;
}

export class WebSocketHub {
  private readonly subscriptions = new Set<Subscription>();

  subscribe(socket: WebSocket, threadId: string | null): void {
    const subscription: Subscription = { socket, threadId };
    this.subscriptions.add(subscription);

    socket.on("close", () => {
      this.subscriptions.delete(subscription);
    });

    socket.on("error", () => {
      this.subscriptions.delete(subscription);
    });
  }

  broadcast(threadId: string | null, event: StreamEvent): void {
    for (const subscription of this.subscriptions) {
      if (subscription.threadId && threadId && subscription.threadId !== threadId) {
        continue;
      }
      if (subscription.threadId && !threadId) {
        continue;
      }
      if (subscription.socket.readyState !== subscription.socket.OPEN) {
        continue;
      }
      subscription.socket.send(JSON.stringify(event));
    }
  }

  closeAll(): void {
    for (const subscription of this.subscriptions) {
      if (subscription.socket.readyState === subscription.socket.OPEN) {
        subscription.socket.close();
      }
    }
    this.subscriptions.clear();
  }
}
