import { io, Socket } from 'socket.io-client';

let paymentSocket: Socket | null = null;

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
