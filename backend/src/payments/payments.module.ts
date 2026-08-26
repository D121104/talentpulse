import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentOrder } from './entities/payment-order.entity';
import { User } from '../users/entities/user.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentsGateway } from './payments.gateway';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../redis/redis.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentOrder, User]),
    UsersModule,
    RedisModule,
    MailModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentsGateway],
  exports: [PaymentsService, PaymentsGateway],
})
export class PaymentsModule {}
