import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

// WebSocket Gateway for realtime notifications via Socket.IO
@WebSocketGateway({
  cors: {
    origin: (process.env.URL_FRONTEND || 'http://localhost:5173')
      .split(',')
      .map((u) => u.trim()),
    credentials: true,
  },
})
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  // Map userId to socketId(s)
  private userSockets: Map<string, Set<string>> = new Map();

  // Handle client connection: store userId -> socketId mapping & join user room
  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.join(`user:${userId}`);
      this.logger.log(`User ${userId} connected with socket ${client.id}`);
    } else {
      this.logger.log(`Socket client ${client.id} connected without initial userId`);
    }
  }

  // Handle client disconnect: remove socketId from mapping
  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.userSockets.delete(userId);
        this.logger.log(`User ${userId} disconnected socket ${client.id}`);
        break;
      }
    }
  }

  // Client emits 'join' with userId after connection or when auth is established
  @SubscribeMessage('join')
  handleJoin(client: Socket, payload: { userId: string } | string) {
    const userId = typeof payload === 'string' ? payload : payload?.userId;
    if (userId) {
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      const room = `user:${userId}`;
      client.join(room);
      this.logger.log(`User ${userId} explicitly joined room ${room} on socket ${client.id}`);
      return { event: 'joined', room };
    }
  }

  // Send event to all sockets and room of a user (supports multi-device)
  sendToUser(userId: string, event: string, data: any) {
    const room = `user:${userId}`;
    this.logger.log(`Emitting event "${event}" to user ${userId} (room: ${room})`);

    // Emit to user room (reaches all sockets/tabs joined for this user)
    this.server.to(room).emit(event, data);
  }
}
