import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApplicationStatus } from './entities/application.entity';
import { Role } from 'src/decorator/customize';

export interface TransitionContext {
  currentStatus: ApplicationStatus;
  targetStatus: ApplicationStatus;
  userRole: string;
  isOwner: boolean;
  reason?: string;
}

export class ApplicationStateMachine {
  /**
   * Terminal statuses that cannot be transitioned out of.
   */
  public static readonly TERMINAL_STATUSES: ReadonlySet<ApplicationStatus> =
    new Set([
      ApplicationStatus.SUITABLE,
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
    ]);

  /**
   * Allowed state transitions map.
   */
  public static readonly ALLOWED_TRANSITIONS: ReadonlyMap<
    ApplicationStatus,
    ReadonlySet<ApplicationStatus>
  > = new Map([
    [
      ApplicationStatus.PENDING,
      new Set([
        ApplicationStatus.REVIEWING,
        ApplicationStatus.WITHDRAWN,
        ApplicationStatus.REJECTED,
      ]),
    ],
    [
      ApplicationStatus.REVIEWING,
      new Set([
        ApplicationStatus.CONSIDERING,
        ApplicationStatus.INTERVIEWING,
        ApplicationStatus.SUITABLE,
        ApplicationStatus.REJECTED,
      ]),
    ],
    [
      ApplicationStatus.CONSIDERING,
      new Set([
        ApplicationStatus.INTERVIEWING,
        ApplicationStatus.SUITABLE,
        ApplicationStatus.REJECTED,
      ]),
    ],
    [
      ApplicationStatus.INTERVIEWING,
      new Set([ApplicationStatus.SUITABLE, ApplicationStatus.REJECTED]),
    ],
    [ApplicationStatus.SUITABLE, new Set()],
    [ApplicationStatus.REJECTED, new Set()],
    [ApplicationStatus.WITHDRAWN, new Set()],
  ]);

  /**
   * Check if a status is terminal.
   */
  public static isTerminal(status: ApplicationStatus): boolean {
    return this.TERMINAL_STATUSES.has(status);
  }

  /**
   * Validate state transition and permissions.
   */
  public static validateTransition(context: TransitionContext): void {
    const { currentStatus, targetStatus, userRole, isOwner } = context;

    // 1. Same status is a no-op
    if (currentStatus === targetStatus) {
      throw new BadRequestException(
        `Đơn ứng tuyển hiện đã ở trạng thái ${currentStatus}`,
      );
    }

    // 2. Terminal state check
    if (this.isTerminal(currentStatus)) {
      throw new BadRequestException(
        `Đơn ứng tuyển đã ở trạng thái kết thúc (${currentStatus}), không thể chuyển đổi tiếp.`,
      );
    }

    // 3. Allowed transition graph check
    const allowedTargets = this.ALLOWED_TRANSITIONS.get(currentStatus);
    if (!allowedTargets || !allowedTargets.has(targetStatus)) {
      throw new BadRequestException(
        `Không thể chuyển trạng thái từ ${currentStatus} sang ${targetStatus}.`,
      );
    }

    // 4. Role & ownership validation
    if (targetStatus === ApplicationStatus.WITHDRAWN) {
      if (!isOwner && userRole !== Role.ADMIN) {
        throw new ForbiddenException(
          'Chỉ ứng viên sở hữu hồ sơ mới có quyền rút đơn ứng tuyển.',
        );
      }
      if (currentStatus !== ApplicationStatus.PENDING) {
        throw new BadRequestException(
          'Chỉ có thể rút đơn ứng tuyển khi hồ sơ còn ở trạng thái Chờ xử lý (PENDING).',
        );
      }
      return;
    }

    // Candidate cannot perform any status changes other than WITHDRAWN
    if (userRole === Role.USER) {
      throw new ForbiddenException(
        'Ứng viên chỉ có quyền rút đơn khi ở trạng thái Chờ xử lý.',
      );
    }

    // HR and ADMIN can perform allowed HR transitions
    if (userRole !== Role.HR && userRole !== Role.ADMIN) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật trạng thái đơn ứng tuyển.',
      );
    }
  }

  /**
   * Helper to get Vietnamese label for statuses.
   */
  public static getStatusLabel(status: ApplicationStatus): string {
    switch (status) {
      case ApplicationStatus.PENDING:
        return 'Chờ xử lý';
      case ApplicationStatus.REVIEWING:
        return 'Đã xem CV';
      case ApplicationStatus.CONSIDERING:
        return 'Cân nhắc';
      case ApplicationStatus.INTERVIEWING:
        return 'Phỏng vấn';
      case ApplicationStatus.SUITABLE:
        return 'Phù hợp';
      case ApplicationStatus.REJECTED:
        return 'Chưa phù hợp';
      case ApplicationStatus.WITHDRAWN:
        return 'Đã rút đơn';
      default:
        return status;
    }
  }
}
