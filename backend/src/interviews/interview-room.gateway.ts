import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  Logger,
  Injectable,
  Inject,
  forwardRef,
  OnModuleDestroy,
} from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { InterviewRoundStatus } from './entities/interview-round.entity';

export interface RoomParticipant {
  socketId: string;
  userId: string;
  userName: string;
  userRole: string; // 'INTERVIEWER' | 'CANDIDATE'
  hasVideo: boolean;
  hasAudio: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing?: boolean;
  joinedAt: Date;
}

@WebSocketGateway({
  cors: {
    origin: (process.env.URL_FRONTEND || 'http://localhost:5173')
      .split(',')
      .map((u) => u.trim()),
    credentials: true,
  },
  namespace: '/interview-room',
})
@Injectable()
export class InterviewRoomGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnGatewayInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(InterviewRoomGateway.name);
  // On-demand targeted timer per active room: roomId -> Timeout (Zero polling intervals!)
  private roomTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    @Inject(forwardRef(() => InterviewsService))
    private readonly interviewsService: InterviewsService,
  ) {}

  @WebSocketServer()
  server: Server;

  // Track room state: roomId -> Map<socketId, RoomParticipant>
  private rooms: Map<string, Map<string, RoomParticipant>> = new Map();
  // Reverse lookup: socketId -> roomId
  private socketToRoom: Map<string, string> = new Map();

  afterInit() {
    this.logger.log(
      '[InterviewRoom] Gateway initialized with event-driven on-demand room lifecycle (no polling interval).',
    );
  }

  onModuleDestroy() {
    // Clear all active timers on module shutdown
    for (const timer of this.roomTimers.values()) {
      clearTimeout(timer);
    }
    this.roomTimers.clear();
  }

  /**
   * Schedule exact auto-close timer only when a room is active.
   * If no rooms are open, 0 timers exist in memory and 0 CPU/DB cycles are consumed.
   */
  private scheduleRoomAutoClose(roomId: string, scheduledEndAt: Date | string) {
    if (this.roomTimers.has(roomId)) return;

    const remainingMs = new Date(scheduledEndAt).getTime() - Date.now();
    if (remainingMs <= 0) {
      // Past scheduled endTime: close room immediately
      this.closeRoomDueToEndTime(roomId);
      return;
    }

    // Node.js setTimeout maximum 32-bit signed integer is ~24.8 days
    const timeoutDuration = Math.min(remainingMs, 2147483647);

    this.logger.log(
      `[InterviewRoom] Scheduled auto-close for active room ${roomId} in ${Math.round(
        remainingMs / 1000,
      )}s (at ${new Date(scheduledEndAt).toLocaleTimeString()}).`,
    );

    const timer = setTimeout(() => {
      this.closeRoomDueToEndTime(roomId);
    }, timeoutDuration);

    this.roomTimers.set(roomId, timer);
  }

  /**
   * Cancel pending auto-close timer when room is ended by HR or becomes empty.
   */
  private cancelRoomAutoClose(roomId: string) {
    const timer = this.roomTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roomTimers.delete(roomId);
    }
  }

  /**
   * Executed exactly when scheduled endTime is reached for an active room.
   */
  private async closeRoomDueToEndTime(roomId: string) {
    this.cancelRoomAutoClose(roomId);

    if (!this.rooms.has(roomId)) return;

    this.server.to(`room:${roomId}`).emit('room-ended', {
      endedBy: 'Hệ thống TalentPulse',
      message:
        'Thời gian phỏng vấn theo lịch đã kết thúc. Phòng họp đã tự động đóng.',
    });

    this.rooms.delete(roomId);

    try {
      await this.interviewsService.internalCompleteRoundByRoomId(
        roomId,
        'Tự động kết thúc do quá giờ lịch hẹn (endTime)',
      );
      this.logger.log(
        `[InterviewRoom] Room ${roomId} was cleanly auto-closed at scheduled endTime.`,
      );
    } catch (err: any) {
      this.logger.error(
        `[InterviewRoom] Failed to complete round in DB for ${roomId}: ${err?.message}`,
      );
    }
  }

  handleConnection(client: Socket) {
    this.logger.log(`[InterviewRoom] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.handleLeave(client);
    this.logger.log(`[InterviewRoom] Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      roomId: string;
      userId: string;
      userName: string;
      userRole?: string;
      hasVideo?: boolean;
      hasAudio?: boolean;
    },
  ) {
    const { roomId, userId, userName, userRole, hasVideo, hasAudio } = payload;
    if (!roomId || !userId) {
      return { success: false, message: 'Thiếu roomId hoặc userId' };
    }

    // Check room validity & scheduled endTime
    const round = await this.interviewsService.findRawByRoomId(roomId);
    const now = new Date();
    const isPastEndTime =
      round?.scheduledEndAt && now > new Date(round.scheduledEndAt);

    if (
      !round ||
      isPastEndTime ||
      round.status === InterviewRoundStatus.COMPLETED ||
      round.status === InterviewRoundStatus.CANCELLED
    ) {
      if (
        round &&
        isPastEndTime &&
        round.status !== InterviewRoundStatus.COMPLETED
      ) {
        await this.interviewsService.internalCompleteRoundByRoomId(
          roomId,
          'Tự động kết thúc do quá giờ lịch hẹn (endTime)',
        );
      }
      client.emit('room-ended', {
        endedBy: 'Hệ thống TalentPulse',
        message:
          'Phòng phỏng vấn này đã kết thúc hoặc quá thời gian phỏng vấn theo lịch.',
      });
      return { success: false, message: 'Phòng phỏng vấn đã kết thúc' };
    }

    // Leave any previous room
    this.handleLeave(client);

    client.join(`room:${roomId}`);
    this.socketToRoom.set(client.id, roomId);

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
    }

    const participant: RoomParticipant = {
      socketId: client.id,
      userId,
      userName: userName || 'Người tham gia',
      userRole: userRole || 'CANDIDATE',
      hasVideo: hasVideo !== false,
      hasAudio: hasAudio !== false,
      isMuted: false,
      isCameraOff: !hasVideo,
      joinedAt: new Date(),
    };

    const roomParticipants = this.rooms.get(roomId)!;

    // Get list of other participants currently in room
    const existingParticipants = Array.from(roomParticipants.values());

    // Register this participant
    roomParticipants.set(client.id, participant);

    // Tell newcomer about all existing participants
    client.emit('room-users', {
      participants: existingParticipants,
      roomId,
    });

    // Notify all other participants in the room that a new user has joined
    client.to(`room:${roomId}`).emit('user-joined', {
      participant,
    });

    // Schedule exact on-demand auto-close timer if round has scheduledEndAt
    if (round?.scheduledEndAt) {
      this.scheduleRoomAutoClose(roomId, round.scheduledEndAt);
    }

    this.logger.log(
      `[InterviewRoom] ${userName} (${userId}) joined room ${roomId}. Total: ${roomParticipants.size}`,
    );

    return { success: true, participantCount: roomParticipants.size };
  }

  @SubscribeMessage('offer')
  handleOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      toSocketId: string;
      offer: any;
      fromUser: { userId: string; userName: string; userRole?: string };
    },
  ) {
    client.to(payload.toSocketId).emit('offer', {
      fromSocketId: client.id,
      offer: payload.offer,
      fromUser: payload.fromUser,
    });
  }

  @SubscribeMessage('answer')
  handleAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      toSocketId: string;
      answer: any;
    },
  ) {
    client.to(payload.toSocketId).emit('answer', {
      fromSocketId: client.id,
      answer: payload.answer,
    });
  }

  @SubscribeMessage('ice-candidate')
  handleIceCandidate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      toSocketId: string;
      candidate: any;
    },
  ) {
    client.to(payload.toSocketId).emit('ice-candidate', {
      fromSocketId: client.id,
      candidate: payload.candidate,
    });
  }

  @SubscribeMessage('toggle-media')
  handleToggleMedia(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      isMuted?: boolean;
      isCameraOff?: boolean;
      isScreenSharing?: boolean;
    },
  ) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId || !this.rooms.has(roomId)) return;

    const participant = this.rooms.get(roomId)!.get(client.id);
    if (participant) {
      if (payload.isMuted !== undefined) participant.isMuted = payload.isMuted;
      if (payload.isCameraOff !== undefined)
        participant.isCameraOff = payload.isCameraOff;
      if (payload.isScreenSharing !== undefined)
        participant.isScreenSharing = payload.isScreenSharing;

      client.to(`room:${roomId}`).emit('user-media-toggled', {
        socketId: client.id,
        isMuted: participant.isMuted,
        isCameraOff: participant.isCameraOff,
        isScreenSharing: participant.isScreenSharing,
      });
    }
  }

  @SubscribeMessage('chat-message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      roomId: string;
      message: string;
      senderName: string;
      senderRole: string;
    },
  ) {
    const { roomId, message, senderName, senderRole } = payload;
    if (!roomId || !message?.trim()) return;

    const chatPayload = {
      message: message.trim(),
      senderSocketId: client.id,
      senderName: senderName || 'Thành viên',
      senderRole: senderRole || 'CANDIDATE',
      timestamp: new Date().toISOString(),
    };

    // Broadcast message to everyone in the room (including sender)
    this.server.to(`room:${roomId}`).emit('chat-message', chatPayload);
  }

  @SubscribeMessage('end-room')
  async handleEndRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload?: { roomId?: string },
  ) {
    const roomId = payload?.roomId || this.socketToRoom.get(client.id);
    if (!roomId) return { success: false, message: 'Thiếu roomId' };

    const roomParticipants = this.rooms.get(roomId);
    const sender = roomParticipants?.get(client.id);
    const senderName = sender?.userName || 'Người phỏng vấn (HR)';

    // Broadcast room-ended event to ALL participants in the room
    this.server.to(`room:${roomId}`).emit('room-ended', {
      endedBy: senderName,
      message: 'Buổi phỏng vấn đã được người phỏng vấn kết thúc.',
    });

    this.logger.log(
      `[InterviewRoom] Room ${roomId} was ended by ${senderName} (${client.id}). Cleaned up.`,
    );

    // Clean up room memory and pending timer
    this.cancelRoomAutoClose(roomId);
    this.rooms.delete(roomId);

    // Update database status
    try {
      await this.interviewsService.internalCompleteRoundByRoomId(
        roomId,
        `Kết thúc bởi ${senderName}`,
      );
    } catch (err: any) {
      this.logger.error(
        `[InterviewRoom] Failed to complete round in DB for ${roomId}: ${err?.message}`,
      );
    }

    return { success: true };
  }

  @SubscribeMessage('leave-room')
  handleLeave(@ConnectedSocket() client: Socket) {
    const roomId = this.socketToRoom.get(client.id);
    if (!roomId) return;

    const roomParticipants = this.rooms.get(roomId);
    if (roomParticipants) {
      const participant = roomParticipants.get(client.id);
      roomParticipants.delete(client.id);

      if (participant) {
        client.to(`room:${roomId}`).emit('user-left', {
          socketId: client.id,
          userId: participant.userId,
          userName: participant.userName,
        });
        this.logger.log(
          `[InterviewRoom] ${participant.userName} left room ${roomId}. Remaining: ${roomParticipants.size}`,
        );
      }

      if (roomParticipants.size === 0) {
        this.rooms.delete(roomId);
        this.cancelRoomAutoClose(roomId);
        this.logger.log(`[InterviewRoom] Room ${roomId} cleaned up.`);
      }
    }

    client.leave(`room:${roomId}`);
    this.socketToRoom.delete(client.id);
  }
}
