import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: (process.env.URL_FRONTEND || 'http://localhost:5173')
      .split(',')
      .map((u) => u.trim()),
    credentials: true,
  },
  namespace: '/payments',
})
export class PaymentsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(PaymentsGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Payment WS client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Payment WS client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoinRoom(client: Socket, payload: { userId: string } | string) {
    const userId = typeof payload === 'string' ? payload : payload?.userId;
    if (userId) {
      const room = `user:${userId}`;
      client.join(room);
      this.logger.log(`Client ${client.id} joined payment room: ${room}`);
      return { event: 'joined', room };
    }
  }

  emitPaymentStatusChanged(
    userId: string,
    data: {
      orderCode: number;
      status: string;
      planType?: string;
      amount?: number;
      paidAt?: string;
      message?: string;
    },
  ) {
    const room = `user:${userId}`;
    this.logger.log(
      `Emitting payment:status-changed to ${room} - orderCode: ${data.orderCode}, status: ${data.status}`,
    );
    this.server.to(room).emit('payment:status-changed', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }
}
