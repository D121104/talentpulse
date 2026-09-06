import { io, Socket } from "socket.io-client";

let paymentSocket: Socket | null = null;
let notificationSocket: Socket | null = null;

function getSocketBaseUrl(): string {
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  if (!isLocal && typeof window !== "undefined") return window.location.origin;
  if (typeof window === "undefined") return "http://localhost:8000";

  return (
    import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_WS_URL ||
    import.meta.env.VITE_API_URL ||
    "http://localhost:8000"
  )
    .replace(/\/api\/v1\/?$/, "")
    .replace(/\/$/, "");
}

export function getPaymentSocket(): Socket {
  if (!paymentSocket) {
    const wsUrl = getSocketBaseUrl();

    paymentSocket = io(`${wsUrl}/payments`, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
  }

  return paymentSocket;
}

export function getNotificationSocket(userId?: string): Socket {
  const wsUrl = getSocketBaseUrl();

  if (!notificationSocket) {
    notificationSocket = io(wsUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      query: userId ? { userId } : undefined,
    });
  } else if (
    userId &&
    notificationSocket.io.opts.query &&
    (notificationSocket.io.opts.query as Record<string, string | undefined>)
      .userId !== userId
  ) {
    notificationSocket.disconnect();
    notificationSocket = io(wsUrl, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      query: { userId },
    });
  }

  return notificationSocket;
}
