import { ApplicationStateMachine } from './application-state-machine';
import { ApplicationStatus } from './entities/application.entity';
import { Role } from 'src/decorator/customize';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ApplicationStateMachine', () => {
  describe('Valid Transitions', () => {
    it('allows HR to move PENDING -> REVIEWING', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.PENDING,
          targetStatus: ApplicationStatus.REVIEWING,
          userRole: Role.HR,
          isOwner: false,
        }),
      ).not.toThrow();
    });

    it('allows Candidate to withdraw PENDING -> WITHDRAWN', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.PENDING,
          targetStatus: ApplicationStatus.WITHDRAWN,
          userRole: Role.USER,
          isOwner: true,
        }),
      ).not.toThrow();
    });

    it('allows HR to move REVIEWING -> CONSIDERING, INTERVIEWING, SUITABLE, REJECTED', () => {
      const allowed = [
        ApplicationStatus.CONSIDERING,
        ApplicationStatus.INTERVIEWING,
        ApplicationStatus.SUITABLE,
        ApplicationStatus.REJECTED,
      ];
      for (const target of allowed) {
        expect(() =>
          ApplicationStateMachine.validateTransition({
            currentStatus: ApplicationStatus.REVIEWING,
            targetStatus: target,
            userRole: Role.HR,
            isOwner: false,
          }),
        ).not.toThrow();
      }
    });

    it('allows HR to move INTERVIEWING -> SUITABLE, REJECTED', () => {
      const allowed = [ApplicationStatus.SUITABLE, ApplicationStatus.REJECTED];
      for (const target of allowed) {
        expect(() =>
          ApplicationStateMachine.validateTransition({
            currentStatus: ApplicationStatus.INTERVIEWING,
            targetStatus: target,
            userRole: Role.HR,
            isOwner: false,
          }),
        ).not.toThrow();
      }
    });
  });

  describe('Terminal States & Invalid Transitions', () => {
    it('prevents any transition out of SUITABLE', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.SUITABLE,
          targetStatus: ApplicationStatus.INTERVIEWING,
          userRole: Role.HR,
          isOwner: false,
        }),
      ).toThrow(BadRequestException);
    });

    it('prevents any transition out of REJECTED', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.REJECTED,
          targetStatus: ApplicationStatus.CONSIDERING,
          userRole: Role.HR,
          isOwner: false,
        }),
      ).toThrow(BadRequestException);
    });

    it('prevents any transition out of WITHDRAWN', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.WITHDRAWN,
          targetStatus: ApplicationStatus.PENDING,
          userRole: Role.USER,
          isOwner: true,
        }),
      ).toThrow(BadRequestException);
    });

    it('prevents Candidate from withdrawing when status is REVIEWING', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.REVIEWING,
          targetStatus: ApplicationStatus.WITHDRAWN,
          userRole: Role.USER,
          isOwner: true,
        }),
      ).toThrow(BadRequestException);
    });

    it('prevents non-owner candidate from withdrawing someone else application', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.PENDING,
          targetStatus: ApplicationStatus.WITHDRAWN,
          userRole: Role.USER,
          isOwner: false,
        }),
      ).toThrow(ForbiddenException);
    });

    it('prevents candidate from changing status to SUITABLE', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.PENDING,
          targetStatus: ApplicationStatus.SUITABLE,
          userRole: Role.USER,
          isOwner: true,
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects identical current and target status', () => {
      expect(() =>
        ApplicationStateMachine.validateTransition({
          currentStatus: ApplicationStatus.PENDING,
          targetStatus: ApplicationStatus.PENDING,
          userRole: Role.HR,
          isOwner: false,
        }),
      ).toThrow(BadRequestException);
    });
  });
});
