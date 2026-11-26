import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: (process.env.URL_FRONTEND || 'http://localhost:5173')
      .split(',')
      .map((u) => u.trim()),
    credentials: true,
  },
  namespace: '/chat',
})
@Injectable()
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  // Track connected sockets per user
  private userSockets: Map<string, Set<string>> = new Map();

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.join(`user:${userId}`);
      this.logger.log(`[Chat] User ${userId} connected on socket ${client.id}`);
    } else {
      this.logger.log(`[Chat] Anonymous socket connected: ${client.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, sockets] of this.userSockets.entries()) {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
        this.logger.log(
          `[Chat] User ${userId} disconnected socket ${client.id}`,
        );
        break;
      }
    }
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, payload: { userId: string } | string) {
    const userId = typeof payload === 'string' ? payload : payload?.userId;
    if (userId) {
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      client.join(`user:${userId}`);
      this.logger.log(
        `[Chat] Socket ${client.id} explicitly joined user:${userId}`,
      );
      return { event: 'joined', room: `user:${userId}` };
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(client: Socket, payload: { conversationId: string }) {
    if (payload?.conversationId) {
      const room = `conversation:${payload.conversationId}`;
      client.join(room);
      this.logger.log(`[Chat] Socket ${client.id} joined ${room}`);
      return { event: 'conversation_joined', room };
    }
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(client: Socket, payload: { conversationId: string }) {
    if (payload?.conversationId) {
      const room = `conversation:${payload.conversationId}`;
      client.leave(room);
      this.logger.log(`[Chat] Socket ${client.id} left ${room}`);
      return { event: 'conversation_left', room };
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    client: Socket,
    payload: {
      conversationId: string;
      isTyping: boolean;
      userName?: string;
      userId?: string;
    },
  ) {
    if (payload?.conversationId) {
      const room = `conversation:${payload.conversationId}`;
      client.to(room).emit('chat:typing', payload);
    }
  }

  // --- Broadcasting Methods called by ChatService ---

  emitNewMessage(
    conversationId: string,
    message: any,
    participantUserIds?: string[],
  ) {
    let broadcaster = this.server.to(`conversation:${conversationId}`);
    if (Array.isArray(participantUserIds)) {
      for (const uid of participantUserIds) {
        if (uid) {
          broadcaster = broadcaster.to(`user:${uid}`);
        }
      }
    }
    broadcaster.emit('chat:new_message', message);
  }

  emitNotification(userId: string, data: any) {
    const room = `user:${userId}`;
    this.server.to(room).emit('chat:notification', data);
  }

  emitConversationRead(
    conversationId: string,
    data: { conversationId: string; readByRole: string; readAt: string },
    participantUserIds?: string[],
  ) {
    let broadcaster = this.server.to(`conversation:${conversationId}`);
    if (Array.isArray(participantUserIds)) {
      for (const uid of participantUserIds) {
        if (uid) {
          broadcaster = broadcaster.to(`user:${uid}`);
        }
      }
    }
    broadcaster.emit('chat:read', data);
  }

  emitReaction(
    conversationId: string,
    data: any,
    participantUserIds?: string[],
  ) {
    let broadcaster = this.server.to(`conversation:${conversationId}`);
    if (Array.isArray(participantUserIds)) {
      for (const uid of participantUserIds) {
        if (uid) {
          broadcaster = broadcaster.to(`user:${uid}`);
        }
      }
    }
    broadcaster.emit('chat:reaction', data);
  }

  emitUnreadCountUpdated(userId: string, count: number) {
    const room = `user:${userId}`;
    this.server.to(room).emit('chat:unread_count', { count });
  }
}
