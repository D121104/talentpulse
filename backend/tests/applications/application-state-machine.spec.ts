import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApplicationStateMachine } from 'src/applications/application-state-machine';
import { ApplicationStatus } from 'src/applications/entities/application.entity';
import { Role } from 'src/decorator/customize';

describe('ApplicationStateMachine', () => {
  it('allows valid HR transitions including both SUITABLE and legacy APPROVED', () => {
    expect(() =>
      ApplicationStateMachine.validateTransition({
        currentStatus: ApplicationStatus.PENDING,
        targetStatus: ApplicationStatus.REVIEWING,
        userRole: Role.HR,
        isOwner: false,
      }),
    ).not.toThrow();

    expect(() =>
      ApplicationStateMachine.validateTransition({
        currentStatus: ApplicationStatus.INTERVIEWING,
        targetStatus: ApplicationStatus.SUITABLE,
        userRole: Role.HR,
        isOwner: false,
      }),
    ).not.toThrow();

    expect(() =>
      ApplicationStateMachine.validateTransition({
        currentStatus: ApplicationStatus.INTERVIEWING,
        targetStatus: ApplicationStatus.APPROVED,
        userRole: Role.HR,
        isOwner: false,
      }),
    ).not.toThrow();
  });

  it('allows owner to withdraw PENDING application and blocks non-owner', () => {
    expect(() =>
      ApplicationStateMachine.validateTransition({
        currentStatus: ApplicationStatus.PENDING,
        targetStatus: ApplicationStatus.WITHDRAWN,
        userRole: Role.USER,
        isOwner: true,
      }),
    ).not.toThrow();

    expect(() =>
      ApplicationStateMachine.validateTransition({
        currentStatus: ApplicationStatus.PENDING,
        targetStatus: ApplicationStatus.WITHDRAWN,
        userRole: Role.USER,
        isOwner: false,
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects transitions out of terminal statuses including APPROVED and SUITABLE', () => {
    for (const terminalStatus of [
      ApplicationStatus.SUITABLE,
      ApplicationStatus.APPROVED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.WITHDRAWN,
    ]) {
      expect(ApplicationStateMachine.isTerminal(terminalStatus)).toBe(true);
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: terminalStatus,
          targetStatus: ApplicationStatus.REVIEWING,
          userRole: Role.ADMIN,
          isOwner: false,
        }),
      ).toThrow(BadRequestException);
    }
  });
});
