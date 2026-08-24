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
@WebSocketGateway({ cors: true })
@Injectable()
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private logger = new Logger('NotificationsGateway');
  // Map userId to socketId(s)
  private userSockets: Map<string, Set<string>> = new Map();

  // Handle client connection: store userId -> socketId mapping
  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      if (!this.userSockets.has(userId))
        this.userSockets.set(userId, new Set());
      this.userSockets.get(userId)!.add(client.id);
      this.logger.log(`User ${userId} connected with socket ${client.id}`);
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

  // Send event to all sockets of a user (supports multi-device)
  sendToUser(userId: string, event: string, data: any) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit(event, data);
      });
    }
  }
}
