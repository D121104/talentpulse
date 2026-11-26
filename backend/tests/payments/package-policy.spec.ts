import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePremiumPackageDto } from 'src/payments/dto/premium-package.dto';
import { PaymentsService } from 'src/payments/payments.service';
import { PremiumPlan, User } from 'src/users/entities/user.entity';
import { PremiumPackage } from 'src/payments/entities/premium-package.entity';
import {
  PaymentOrder,
  PaymentStatus,
} from 'src/payments/entities/payment-order.entity';

describe('chatbot package policy DTO', () => {
  it.each([null, 0, 10])(
    'accepts daily limit %s',
    async (chatbotDailyLimit) => {
      expect(
        await validate(
          plainToInstance(UpdatePremiumPackageDto, { chatbotDailyLimit }),
        ),
      ).toHaveLength(0);
    },
  );
  it.each([-1, 1.5, 'invalid', false])(
    'rejects daily limit %s',
    async (chatbotDailyLimit) => {
      expect(
        await validate(
          plainToInstance(UpdatePremiumPackageDto, { chatbotDailyLimit }),
        ),
      ).not.toHaveLength(0);
    },
  );
});

describe('subscription business invariants', () => {
  const admin = { _id: 'admin', email: 'admin@example.test' } as any;

  it.each([0, 3, null])(
    'persists Free daily quota %s without changing its identity',
    async (limit) => {
      const pkg = {
        _id: 'free',
        code: 'FREE_DEFAULT',
        planType: PremiumPlan.FREE,
        isActive: true,
        chatbotDailyLimit: 10,
      };
      const repo = { findOne: async () => pkg, save: async (value) => value };
      const service = new PaymentsService(
        null,
        null,
        repo as any,
        null,
        null,
        null,
        null,
        null,
        null,
      );
      await expect(
        service.updatePackage('free', { chatbotDailyLimit: limit }, admin),
      ).resolves.toMatchObject({ ...pkg, chatbotDailyLimit: limit });
    },
  );

  it.each(['update', 'toggle', 'delete', 'create'])(
    'protects Free policy from %s',
    async (operation) => {
      const pkg = {
        _id: 'free',
        code: 'FREE_DEFAULT',
        isActive: true,
        isDeleted: false,
        price: 0,
      };
      const repo = { findOne: async () => pkg, save: jest.fn() };
      const service = new PaymentsService(
        null,
        null,
        repo as any,
        null,
        null,
        null,
        null,
        null,
        null,
      );
      const result =
        operation === 'update'
          ? service.updatePackage('free', { price: 1 }, admin)
          : operation === 'toggle'
          ? service.togglePackageActive('free', admin)
          : operation === 'delete'
          ? service.deletePackage('free', admin)
          : service.createPackage({ planType: PremiumPlan.FREE } as any, admin);
      await expect(result).rejects.toMatchObject({ status: 400 });
      expect(pkg).toMatchObject({ isActive: true, isDeleted: false, price: 0 });
      expect(repo.save).not.toHaveBeenCalled();
    },
  );

  it.each(['linked', 'missing', 'wrong-plan'])(
    'settles payment only with its exact package (%s)',
    async (scenario) => {
      const order = {
        _id: 'order',
        orderCode: 123,
        userId: 'user',
        amount: 49000,
        status: PaymentStatus.PENDING,
        durationDays: 30,
        planType: PremiumPlan.CANDIDATE_PREMIUM,
        packageId: scenario === 'missing' ? null : 'purchased',
      };
      const user = { _id: 'user', isPremium: false, premiumPackageId: null };
      const packages = [
        {
          _id: 'purchased',
          planType: PremiumPlan.CANDIDATE_PREMIUM,
          isDeleted: true,
        },
        { _id: 'other', planType: PremiumPlan.CANDIDATE_PREMIUM },
      ];
      if (scenario === 'wrong-plan')
        packages[0].planType = PremiumPlan.HR_PREMIUM;
      const builder = {
        update: () => builder,
        set: () => builder,
        where: () => builder,
        execute: async () => ({ affected: 1 }),
      };
      const manager = {
        getRepository: (entity) => {
          if (entity === PaymentOrder)
            return { createQueryBuilder: () => builder };
          if (entity === User)
            return {
              findOne: async () => user,
              update: async (_id, values) => Object.assign(user, values),
            };
          if (entity === PremiumPackage)
            return {
              find: async ({ where }) =>
                packages.filter(
                  (pkg) =>
                    pkg._id === where._id && pkg.planType === where.planType,
                ),
            };
          throw new Error('Unexpected repository');
        },
      };
      const service = new PaymentsService(
        { findOne: async () => order } as any,
        { findOne: async () => null } as any,
        null,
        null,
        { deleteValue: async () => undefined } as any,
        { emitPaymentStatusChanged: () => undefined } as any,
        null,
        { transaction: async (fn) => fn(manager) } as any,
        null,
      );
      const result = service.handleWebhook({
        code: '00',
        data: { orderCode: 123, amount: 49000 },
      });
      if (scenario === 'linked') {
        await result;
        expect(user).toMatchObject({
          isPremium: true,
          premiumPackageId: 'purchased',
          premiumPlan: PremiumPlan.CANDIDATE_PREMIUM,
        });
        expect(user).not.toHaveProperty('aiQuotaRemaining');
      } else {
        await expect(result).rejects.toMatchObject({
          status: 400,
          message: 'PAYMENT_PACKAGE_REPAIR_REQUIRED',
        });
        expect(user).toMatchObject({
          isPremium: false,
          premiumPackageId: null,
        });
      }
    },
  );
});
