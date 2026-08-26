import { io, Socket } from 'socket.io-client';

let paymentSocket: Socket | null = null;
let notificationSocket: Socket | null = null;

export function getPaymentSocket(): Socket {
  if (!paymentSocket) {
    const wsUrl = (
      import.meta.env.VITE_WS_URL ||
      import.meta.env.VITE_API_URL ||
      'http://localhost:8000'
    )
      .replace(/\/api\/v1\/?$/, '')
      .replace(/\/$/, '');

    paymentSocket = io(`${wsUrl}/payments`, {
      transports: ['websocket', 'polling'],
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
  const wsUrl = (
    import.meta.env.VITE_WS_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:8000'
  )
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '');

  if (!notificationSocket) {
    notificationSocket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      query: userId ? { userId } : undefined,
    });
  } else if (userId && notificationSocket.io.opts.query && (notificationSocket.io.opts.query as any).userId !== userId) {
    notificationSocket.disconnect();
    notificationSocket = io(wsUrl, {
      transports: ['websocket', 'polling'],
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
