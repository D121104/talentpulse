import { io, Socket } from "socket.io-client";

let paymentSocket: Socket | null = null;
let notificationSocket: Socket | null = null;
let chatSocket: Socket | null = null;

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
      reconnectionAttempts: 20,
      reconnectionDelay: 1500,
      query: userId ? { userId } : undefined,
    });
  }

  // If userId is provided, ensure socket is joined to user room
  if (userId && notificationSocket) {
    const currentQuery = (notificationSocket.io.opts.query as any) || {};
    if (currentQuery.userId !== userId) {
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

    const joinRoom = () => {
      notificationSocket?.emit('join', { userId });
    };

    if (notificationSocket.connected) {
      joinRoom();
    } else {
      notificationSocket.off('connect', joinRoom);
      notificationSocket.on('connect', joinRoom);
    }
  }

  return notificationSocket;
}

export function getChatSocket(userId?: string): Socket {
  const wsUrl = (
    import.meta.env.VITE_WS_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:8000'
  )
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '');

  if (!chatSocket) {
    chatSocket = io(`${wsUrl}/chat`, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1500,
      query: userId ? { userId } : undefined,
    });
  }

  if (userId && chatSocket) {
    const currentQuery = (chatSocket.io.opts.query as any) || {};
    if (currentQuery.userId !== userId) {
      currentQuery.userId = userId;
      chatSocket.io.opts.query = currentQuery;
      if (chatSocket.connected) {
        chatSocket.disconnect().connect();
      }
    }

    const joinRoom = () => {
      chatSocket?.emit('join', { userId });
    };

    if (chatSocket.connected) {
      joinRoom();
    } else {
      chatSocket.off('connect', joinRoom);
      chatSocket.on('connect', joinRoom);
    }
  }

  return chatSocket;
}
