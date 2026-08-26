import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as crypto from 'crypto';
import {
  PaymentOrder,
  PaymentStatus,
  PaymentBillingCycle,
} from './entities/payment-order.entity';
import { UsersService } from '../users/users.service';
import { RedisService } from '../redis/redis.service';
import { PaymentsGateway } from './payments.gateway';
import { PremiumPlan, User } from '../users/entities/user.entity';
import { Role } from '../decorator/customize';

export interface CreatePaymentOrderDto {
  planType: PremiumPlan;
  billingCycle: PaymentBillingCycle;
  vatInvoiceRequested?: boolean;
  vatCompanyName?: string;
  vatTaxCode?: string;
  vatAddress?: string;
}

export interface PricingPlanConfig {
  price: number;
  durationDays: number;
  title: string;
}

@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly FETCH_TIMEOUT_MS = 15000;

  // Standard pricing table configuration
  private readonly pricingPlans: Record<
    PremiumPlan,
    Record<PaymentBillingCycle, PricingPlanConfig>
  > = {
    [PremiumPlan.FREE]: {
      [PaymentBillingCycle.MONTHLY]: { price: 0, durationDays: 0, title: 'Miễn phí' },
      [PaymentBillingCycle.SEMI_ANNUAL]: { price: 0, durationDays: 0, title: 'Miễn phí' },
      [PaymentBillingCycle.ANNUAL]: { price: 0, durationDays: 0, title: 'Miễn phí' },
    },
    [PremiumPlan.CANDIDATE_PREMIUM]: {
      [PaymentBillingCycle.MONTHLY]: {
        price: 49000,
        durationDays: 30,
        title: 'Candidate Premium (1 Tháng)',
      },
      [PaymentBillingCycle.SEMI_ANNUAL]: {
        price: 249000,
        durationDays: 180,
        title: 'Candidate Premium (6 Tháng)',
      },
      [PaymentBillingCycle.ANNUAL]: {
        price: 399000,
        durationDays: 365,
        title: 'Candidate Premium (1 Năm)',
      },
    },
    [PremiumPlan.HR_PREMIUM]: {
      [PaymentBillingCycle.MONTHLY]: {
        price: 299000,
        durationDays: 30,
        title: 'HR Premium Enterprise (1 Tháng)',
      },
      [PaymentBillingCycle.SEMI_ANNUAL]: {
        price: 1490000,
        durationDays: 180,
        title: 'HR Premium Enterprise (6 Tháng)',
      },
      [PaymentBillingCycle.ANNUAL]: {
        price: 2390000,
        durationDays: 365,
        title: 'HR Premium Enterprise (1 Năm)',
      },
    },
  };

  constructor(
    @InjectRepository(PaymentOrder)
    private readonly paymentOrderRepo: Repository<PaymentOrder>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly usersService: UsersService,
    private readonly redisService: RedisService,
    private readonly paymentsGateway: PaymentsGateway,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectQueue('mail-queue')
    private readonly mailQueue: Queue,
  ) {}

  /**
   * Khởi động service: quét đơn hết hạn và lập lịch timeout chính xác cho các đơn đang PENDING
   */
  async onModuleInit() {
    try {
      await this.expirePendingOrders();

      const pendingOrders = await this.paymentOrderRepo.find({
        where: { status: PaymentStatus.PENDING },
      });

      const now = Date.now();
      for (const order of pendingOrders) {
        const remainingMs = Math.max(
          1000,
          new Date(order.expiresAt).getTime() - now + 1000,
        );
        setTimeout(() => {
          this.expireSpecificOrder(order.orderCode).catch((err) => {
            this.logger.warn(
              `Auto-expire timeout failed for #${order.orderCode}: ${err?.message || err}`,
            );
          });
        }, remainingMs);
      }
    } catch (err: any) {
      this.logger.warn(`onModuleInit pending orders schedule warning: ${err?.message || err}`);
    }
  }

  /**
   * Sinh mã đơn hàng 9 chữ số sử dụng crypto-safe random
   * Retry nếu trùng unique constraint trong DB
   */
  private async generateUniqueOrderCode(maxRetries = 5): Promise<number> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const code = crypto.randomInt(100_000_000, 999_999_999);
      const exists = await this.paymentOrderRepo.findOne({
        where: { orderCode: code },
        select: ['_id'],
      });
      if (!exists) return code;
    }
    throw new BadRequestException(
      'Không thể tạo mã đơn hàng duy nhất. Vui lòng thử lại.',
    );
  }

  /**
   * Tạo chữ ký HMAC-SHA256 cho yêu cầu PayOS
   */
  private createSignature(data: string): string {
    const checksumKey = this.configService.get<string>(
      'PAYOS_CHECKSUM_KEY',
      '',
    );
    return crypto.createHmac('sha256', checksumKey).update(data).digest('hex');
  }

  /**
   * Xác thực chữ ký webhook từ PayOS
   */
  private verifyWebhookSignature(
    data: Record<string, any>,
    signature: string,
  ): boolean {
    const checksumKey = this.configService.get<string>(
      'PAYOS_CHECKSUM_KEY',
      '',
    );
    if (!checksumKey || checksumKey === 'your_payos_checksum_key') {
      // Chỉ bypass trong dev mode khi chạy placeholder
      const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
      if (nodeEnv === 'production') {
        this.logger.error('PAYOS_CHECKSUM_KEY is missing in production! Rejecting webhook.');
        return false;
      }
      this.logger.warn('PAYOS_CHECKSUM_KEY is placeholder — bypassing webhook signature in dev mode.');
      return true;
    }

    const sortedKeys = Object.keys(data).sort();
    const dataStr = sortedKeys
      .filter((key) => data[key] !== undefined)
      .map((key) => {
        let value = data[key];
        if (
          value === null ||
          value === undefined ||
          value === 'undefined' ||
          value === 'null'
        ) {
          value = '';
        }
        if (Array.isArray(value)) {
          value = JSON.stringify(
            value.map((val: any) => {
              if (typeof val === 'object' && val !== null) {
                return Object.keys(val)
                  .sort()
                  .reduce((obj: Record<string, any>, k: string) => {
                    obj[k] = val[k];
                    return obj;
                  }, {});
              }
              return val;
            }),
          );
        }
        return `${key}=${value}`;
      })
      .join('&');

    const computedSignature = crypto
      .createHmac('sha256', checksumKey)
      .update(dataStr)
      .digest('hex');

    return computedSignature === signature;
  }

  /**
   * Gọi HTTP request có AbortController timeout
   */
  private fetchWithTimeout(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      PaymentsService.FETCH_TIMEOUT_MS,
    );

    return fetch(url, { ...options, signal: controller.signal }).finally(() =>
      clearTimeout(timeoutId),
    );
  }

  /**
   * Lấy chi tiết đơn hàng từ PayOS API
   */
  private async fetchPayosPaymentRequest(orderCode: number): Promise<any> {
    const payosUrl = this.configService.get<string>(
      'PAYOS_URL',
      'https://api-merchant.payos.vn',
    );
    const apiKey = this.configService.get<string>('PAYOS_API_KEY', '');
    const clientId = this.configService.get<string>('PAYOS_CLIENT_ID', '');

    if (!apiKey || apiKey === 'your_payos_api_key') {
      this.logger.warn('PayOS API Key is placeholder. Skipping PayOS remote fetch.');
      return null;
    }

    const res = await this.fetchWithTimeout(
      `${payosUrl}/v2/payment-requests/${orderCode}`,
      {
        headers: {
          'x-api-key': apiKey,
          'x-client-id': clientId,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      },
    );

    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'Unknown error');
      this.logger.warn(`PayOS fetch failed for order ${orderCode}: ${errorBody}`);
      return null;
    }

    const resp = await res.json();
    return resp.data;
  }

  /**
   * Gửi API hủy link thanh toán đơn hàng tới PayOS khi hết hạn hoặc người dùng hủy
   */
  async cancelPayosPaymentRequest(
    orderCode: number,
    cancellationReason: string = 'Đơn hàng hết hạn thanh toán theo TTL',
  ): Promise<boolean> {
    const payosUrl = this.configService.get<string>(
      'PAYOS_URL',
      'https://api-merchant.payos.vn',
    );
    const apiKey = this.configService.get<string>('PAYOS_API_KEY', '');
    const clientId = this.configService.get<string>('PAYOS_CLIENT_ID', '');

    if (
      !apiKey ||
      apiKey === 'your_payos_api_key' ||
      !clientId ||
      clientId === 'your_payos_client_id'
    ) {
      return false;
    }

    try {
      const res = await this.fetchWithTimeout(
        `${payosUrl}/v2/payment-requests/${orderCode}/cancel`,
        {
          headers: {
            'x-api-key': apiKey,
            'x-client-id': clientId,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          body: JSON.stringify({ cancellationReason }),
        },
      );

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'Unknown error');
        this.logger.warn(
          `PayOS cancel request failed for #${orderCode} (${res.status}): ${errorBody}`,
        );
        return false;
      }

      this.logger.log(
        `PayOS payment link for #${orderCode} cancelled successfully on PayOS gateway.`,
      );
      return true;
    } catch (err: any) {
      this.logger.warn(
        `PayOS cancel request error for #${orderCode}: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Tạo đơn thanh toán Premium Subscription và Payment Link từ PayOS
   */
  async createPaymentOrder(
    userId: string,
    dto: CreatePaymentOrderDto,
  ): Promise<{
    checkoutUrl: string;
    orderCode: number;
    amount: number;
    planType: PremiumPlan;
    billingCycle: PaymentBillingCycle;
    expiresAt: Date;
  }> {
    const user = await this.userRepo.findOne({ where: { _id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    // Role-based validation
    if (dto.planType === PremiumPlan.HR_PREMIUM && user.role !== Role.HR && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ tài khoản Nhà tuyển dụng (HR) mới được mua gói HR Premium');
    }
    if (dto.planType === PremiumPlan.CANDIDATE_PREMIUM && user.role === Role.HR) {
      throw new ForbiddenException('Tài khoản HR vui lòng chọn gói HR Premium Enterprise');
    }

    const planConfig = this.pricingPlans[dto.planType]?.[dto.billingCycle];
    if (!planConfig || planConfig.price <= 0) {
      throw new BadRequestException('Gói dịch vụ hoặc chu kỳ thanh toán không hợp lệ');
    }

    const amount = planConfig.price;
    const durationDays = planConfig.durationDays;
    const orderCode = await this.generateUniqueOrderCode();
    const description = `TP ${orderCode}`.slice(0, 25);

    const ttlSeconds = Number(
      this.configService.get<number>('PAYMENT_ORDER_TTL_SECONDS', 900),
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Cancel existing PENDING orders of this user to avoid multiple open bills
    const existingPendingOrders = await this.paymentOrderRepo.find({
      where: { userId, status: PaymentStatus.PENDING },
    });
    for (const pending of existingPendingOrders) {
      await this.cancelPayosPaymentRequest(
        pending.orderCode,
        'Tạo đơn hàng mới thay thế đơn cũ',
      );
      await this.paymentOrderRepo.update(pending._id, {
        status: PaymentStatus.CANCELLED,
      });
      await this.redisService.deleteValue(`payment:pending:${pending.orderCode}`);
    }

    const backendPort = this.configService.get<string>('PORT', '8000');
    const frontendUrl = this.configService.get<string>(
      'URL_FRONTEND',
      'http://localhost:5173',
    );

    // Callbacks
    const returnUrl = `http://localhost:${backendPort}/api/v1/payments/verify/${orderCode}`;
    const cancelUrl = `http://localhost:${backendPort}/api/v1/payments/verify/${orderCode}`;

    const payosUrl = this.configService.get<string>(
      'PAYOS_URL',
      'https://api-merchant.payos.vn',
    );
    const apiKey = this.configService.get<string>('PAYOS_API_KEY', '');
    const clientId = this.configService.get<string>('PAYOS_CLIENT_ID', '');

    let checkoutUrl = `${frontendUrl}/payment/verify/${orderCode}?mock=true`;
    let paymentLinkId: string | null = null;

    // Call PayOS API if credentials are provided
    if (apiKey && apiKey !== 'your_payos_api_key' && clientId && clientId !== 'your_payos_client_id') {
      const signatureData = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
      const signature = this.createSignature(signatureData);
      const expiredAt = Math.floor(expiresAt.getTime() / 1000);

      const body = JSON.stringify({
        orderCode,
        amount: +amount,
        description,
        cancelUrl,
        returnUrl,
        expiredAt,
        signature,
      });

      const res = await this.fetchWithTimeout(`${payosUrl}/v2/payment-requests`, {
        headers: {
          'x-api-key': apiKey,
          'x-client-id': clientId,
          'Content-Type': 'application/json',
        },
        method: 'POST',
        body,
      });

      if (!res.ok) {
        const errorBody = await res.text();
        this.logger.error(`PayOS API error: ${errorBody}`);
        throw new BadRequestException(`Tạo link thanh toán PayOS thất bại: ${errorBody}`);
      }

      const resp = await res.json();
      checkoutUrl = resp.data.checkoutUrl;
      paymentLinkId = resp.data.paymentLinkId;
    } else {
      this.logger.log(
        `PayOS placeholder mode: Order #${orderCode} created with local mock checkout URL.`,
      );
    }

    // Save order in database
    const paymentOrder = this.paymentOrderRepo.create({
      userId,
      orderCode,
      planType: dto.planType,
      billingCycle: dto.billingCycle,
      durationDays,
      amount,
      status: PaymentStatus.PENDING,
      checkoutUrl,
      paymentLinkId,
      description,
      expiresAt,
      vatInvoiceRequested: dto.vatInvoiceRequested || false,
      vatCompanyName: dto.vatCompanyName || null,
      vatTaxCode: dto.vatTaxCode || null,
      vatAddress: dto.vatAddress || null,
    });

    await this.paymentOrderRepo.save(paymentOrder);

    // Save to Redis with TTL for fast caching & tracking
    await this.redisService.setValue(
      `payment:pending:${orderCode}`,
      {
        userId,
        orderCode,
        amount,
        planType: dto.planType,
        billingCycle: dto.billingCycle,
        durationDays,
        expiresAt: expiresAt.toISOString(),
      },
      ttlSeconds,
    );

    // Track user active pending order
    await this.redisService.setValue(
      `payment:user_pending:${userId}`,
      orderCode,
      ttlSeconds,
    );

    // Schedule exact timeout to cancel & expire on PayOS the exact second TTL is reached
    const delayMs = Math.max(1000, (ttlSeconds + 1) * 1000);
    setTimeout(() => {
      this.expireSpecificOrder(orderCode).catch((err) => {
        this.logger.warn(
          `Failed to auto-expire order #${orderCode}: ${err?.message || err}`,
        );
      });
    }, delayMs);

    return {
      checkoutUrl,
      orderCode,
      amount,
      planType: dto.planType,
      billingCycle: dto.billingCycle,
      expiresAt,
    };
  }

  /**
   * Xử lý webhook từ PayOS với cơ chế Idempotent chặt chẽ
   */
  async handleWebhook(webhookData: any): Promise<void> {
    const { data, signature } = webhookData;
    if (!data || !data.orderCode) return;

    if (signature && !this.verifyWebhookSignature(data, signature)) {
      this.logger.warn(`Invalid webhook signature for orderCode=${data.orderCode}`);
      return;
    }

    const orderCode = Number(data.orderCode);
    const order = await this.paymentOrderRepo.findOne({
      where: { orderCode },
      relations: ['user'],
    });

    if (!order) {
      this.logger.warn(`PaymentOrder not found for webhook orderCode=${orderCode}`);
      return;
    }

    // Idempotency check: Nếu đơn đã hoàn thành thì bỏ qua
    if (order.status === PaymentStatus.PAID) {
      this.logger.log(`PaymentOrder ${orderCode} is already PAID. Webhook idempotency skip.`);
      return;
    }

    const webhookCode = String(webhookData?.code ?? data?.code ?? '');
    const webhookStatus = String(data?.status ?? '').toUpperCase();
    const isPaymentSuccess = webhookCode === '00' || webhookStatus === 'PAID';

    if (!isPaymentSuccess) {
      this.logger.log(
        `Webhook ignored for orderCode=${orderCode}: code=${webhookCode}, status=${webhookStatus}`,
      );
      if (webhookStatus === 'CANCELLED') {
        await this.paymentOrderRepo.update(order._id, {
          status: PaymentStatus.CANCELLED,
        });
        await this.redisService.deleteValue(`payment:pending:${orderCode}`);
        this.paymentsGateway.emitPaymentStatusChanged(order.userId, {
          orderCode,
          status: PaymentStatus.CANCELLED,
        });
      }
      return;
    }

    if (Number(data.amount) !== Number(order.amount)) {
      this.logger.error(
        `Webhook amount mismatch: webhook=${data.amount}, local=${order.amount}, orderCode=${orderCode}`,
      );
      return;
    }

    // Execute atomic transaction for upgrade & status update
    let wasUpdated = false;
    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PaymentOrder);
      const userRepo = manager.getRepository(User);

      // Atomic conditional update to guarantee idempotency
      const updateResult = await orderRepo
        .createQueryBuilder()
        .update(PaymentOrder)
        .set({
          status: PaymentStatus.PAID,
          paidAt: new Date(),
          transactionReference: data.reference || null,
          counterAccountBankName: data.counterAccountBankName || null,
          counterAccountName: data.counterAccountName || null,
          counterAccountNumber: data.counterAccountNumber || null,
        })
        .where('orderCode = :orderCode AND status = :status', {
          orderCode,
          status: PaymentStatus.PENDING,
        })
        .execute();

      if (!updateResult.affected || updateResult.affected === 0) {
        this.logger.warn(`Order ${orderCode} was already updated concurrently.`);
        return;
      }

      // Upgrade user's premium plan INSIDE the same transaction
      const user = await userRepo.findOne({ where: { _id: order.userId } });
      if (user) {
        const now = new Date();
        const currentExpiry =
          user.premiumExpiresAt && new Date(user.premiumExpiresAt) > now
            ? new Date(user.premiumExpiresAt)
            : now;
        const newExpiry = new Date(
          currentExpiry.getTime() + order.durationDays * 24 * 60 * 60 * 1000,
        );
        await userRepo.update(user._id, {
          isPremium: true,
          premiumPlan: order.planType,
          premiumExpiresAt: newExpiry,
        });
      }

      wasUpdated = true;
      this.logger.log(
        `Premium upgrade successful: User ${order.userId} -> ${order.planType} for ${order.durationDays} days.`,
      );
    });

    if (!wasUpdated) return;

    // Cleanup Redis pending order
    await this.redisService.deleteValue(`payment:pending:${orderCode}`);
    await this.redisService.deleteValue(`payment:user_pending:${order.userId}`);

    // Emit Realtime Socket.IO notification to client
    this.paymentsGateway.emitPaymentStatusChanged(order.userId, {
      orderCode,
      status: PaymentStatus.PAID,
      planType: order.planType,
      amount: order.amount,
      paidAt: new Date().toISOString(),
      message: 'Nâng cấp gói Premium thành công!',
    });

    // Push job to Bull Queue to send luxurious confirmation email
    const updatedUser = await this.userRepo.findOne({ where: { _id: order.userId } });
    if (updatedUser) {
      await this.mailQueue.add(
        'send-premium-success-email',
        {
          userEmail: updatedUser.email,
          userName: updatedUser.name || 'Quý khách hàng',
          orderCode,
          planType: order.planType,
          billingCycle: order.billingCycle,
          durationDays: order.durationDays,
          amount: order.amount,
          expiryDate: updatedUser.premiumExpiresAt
            ? new Date(updatedUser.premiumExpiresAt).toLocaleDateString('vi-VN')
            : 'Vĩnh viễn',
          transactionReference: data.reference,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: true,
        },
      );
    }
  }

  /**
   * Đồng bộ trạng thái đơn hàng từ PayOS API và nâng cấp nếu cần
   */
  async syncOrderFromPayos(order: PaymentOrder): Promise<PaymentStatus> {
    if (
      order.status === PaymentStatus.PAID ||
      order.status === PaymentStatus.CANCELLED ||
      order.status === PaymentStatus.EXPIRED
    ) {
      return order.status;
    }

    // Check expiration based on TTL
    if (new Date() > new Date(order.expiresAt)) {
      // Send cancel to PayOS gateway immediately
      await this.cancelPayosPaymentRequest(
        order.orderCode,
        'Đơn hàng hết hạn thanh toán theo TTL',
      );
      await this.paymentOrderRepo.update(order._id, {
        status: PaymentStatus.EXPIRED,
      });
      await this.redisService.deleteValue(`payment:pending:${order.orderCode}`);
      this.paymentsGateway.emitPaymentStatusChanged(order.userId, {
        orderCode: order.orderCode,
        status: PaymentStatus.EXPIRED,
      });
      return PaymentStatus.EXPIRED;
    }

    const payosData = await this.fetchPayosPaymentRequest(order.orderCode);
    if (!payosData) return order.status;

    const payosStatus = String(payosData.status || '').toUpperCase();

    if (payosStatus === 'PAID') {
      const transaction = payosData.transactions?.[0];
      await this.handleWebhook({
        data: {
          orderCode: order.orderCode,
          amount: payosData.amount,
          status: 'PAID',
          code: '00',
          reference: transaction?.reference,
          counterAccountBankName: transaction?.counterAccountBankName,
          counterAccountName: transaction?.counterAccountName,
          counterAccountNumber: transaction?.counterAccountNumber,
          transactionDateTime: transaction?.transactionDateTime,
        },
      });
      return PaymentStatus.PAID;
    }

    if (payosStatus === 'CANCELLED') {
      await this.paymentOrderRepo.update(order._id, {
        status: PaymentStatus.CANCELLED,
      });
      await this.redisService.deleteValue(`payment:pending:${order.orderCode}`);
      this.paymentsGateway.emitPaymentStatusChanged(order.userId, {
        orderCode: order.orderCode,
        status: PaymentStatus.CANCELLED,
      });
      return PaymentStatus.CANCELLED;
    }

    if (payosStatus === 'EXPIRED') {
      await this.paymentOrderRepo.update(order._id, {
        status: PaymentStatus.EXPIRED,
      });
      await this.redisService.deleteValue(`payment:pending:${order.orderCode}`);
      this.paymentsGateway.emitPaymentStatusChanged(order.userId, {
        orderCode: order.orderCode,
        status: PaymentStatus.EXPIRED,
      });
      return PaymentStatus.EXPIRED;
    }

    return PaymentStatus.PENDING;
  }

  /**
   * Endpoint xác nhận sau khi user redirect về từ PayOS
   */
  async verifyPaymentOrder(orderCode: number): Promise<{
    order: PaymentOrder;
    redirectUrl: string;
  }> {
    const order = await this.paymentOrderRepo.findOne({
      where: { orderCode },
      relations: ['user'],
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn thanh toán');
    }

    const finalStatus = await this.syncOrderFromPayos(order);
    const frontendUrl = this.configService.get<string>(
      'URL_FRONTEND',
      'http://localhost:5173',
    );

    const redirectUrl = `${frontendUrl}/payment-history?orderCode=${orderCode}&status=${finalStatus.toLowerCase()}`;
    return { order, redirectUrl };
  }

  /**
   * Lấy lịch sử giao dịch thanh toán của người dùng (tự động đồng bộ các đơn đang chờ)
   */
  async getPaymentHistory(userId: string): Promise<PaymentOrder[]> {
    const orders = await this.paymentOrderRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const pendingOrders = orders.filter((o) => o.status === PaymentStatus.PENDING);
    if (pendingOrders.length === 0) return orders;

    // Sync pending orders concurrently with a 10s per-request timeout via Promise.allSettled
    const syncResults = await Promise.allSettled(
      pendingOrders.map((pending) => this.syncOrderFromPayos(pending)),
    );

    const hasChanged = syncResults.some(
      (r) => r.status === 'fulfilled' && r.value !== PaymentStatus.PENDING,
    );

    // Log any sync failures
    syncResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.logger.warn(
          `Failed to sync order ${pendingOrders[i].orderCode}: ${r.reason?.message || r.reason}`,
        );
      }
    });

    if (!hasChanged) return orders;

    return this.paymentOrderRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Hủy đơn hàng đang chờ thanh toán
   */
  async cancelPaymentOrder(orderCode: number, userId: string): Promise<void> {
    const order = await this.paymentOrderRepo.findOne({
      where: { orderCode, userId },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng');
    }

    if (order.status !== PaymentStatus.PENDING) {
      throw new BadRequestException('Chỉ có thể hủy đơn hàng đang chờ thanh toán');
    }

    // Call PayOS cancel API
    await this.cancelPayosPaymentRequest(orderCode, 'Người dùng hủy đơn');

    await this.paymentOrderRepo.update(order._id, {
      status: PaymentStatus.CANCELLED,
    });

    await this.redisService.deleteValue(`payment:pending:${orderCode}`);
    await this.redisService.deleteValue(`payment:user_pending:${userId}`);

    this.paymentsGateway.emitPaymentStatusChanged(userId, {
      orderCode,
      status: PaymentStatus.CANCELLED,
    });
  }

  /**
   * Hủy và đánh dấu hết hạn ngay lập tức một đơn hàng cụ thể trên PayOS và hệ thống
   */
  async expireSpecificOrder(
    orderCode: number,
    userId?: string,
  ): Promise<{ message: string; status: PaymentStatus }> {
    const where: any = { orderCode };
    if (userId) where.userId = userId;

    const order = await this.paymentOrderRepo.findOne({ where });
    if (!order) {
      return { message: 'Không tìm thấy đơn hàng', status: PaymentStatus.EXPIRED };
    }

    if (order.status !== PaymentStatus.PENDING) {
      return { message: `Đơn hàng đã ở trạng thái ${order.status}`, status: order.status };
    }

    this.logger.log(
      `Immediately expiring pending order #${orderCode} and sending cancel request to PayOS...`,
    );

    // 1. Send cancel request to PayOS gateway immediately
    await this.cancelPayosPaymentRequest(
      orderCode,
      'Đơn hàng hết hạn thanh toán theo TTL',
    );

    // 2. Update status to EXPIRED in database
    await this.paymentOrderRepo.update(order._id, {
      status: PaymentStatus.EXPIRED,
    });

    // 3. Cleanup Redis cache
    await this.redisService.deleteValue(`payment:pending:${orderCode}`);
    await this.redisService.deleteValue(`payment:user_pending:${order.userId}`);

    // 4. Emit Realtime Socket.IO notification to client
    this.paymentsGateway.emitPaymentStatusChanged(order.userId, {
      orderCode,
      status: PaymentStatus.EXPIRED,
      message: `Đơn hàng #${orderCode} đã hết hạn thanh toán`,
    });

    return { message: 'Đã hủy đơn hàng hết hạn thành công', status: PaymentStatus.EXPIRED };
  }

  /**
   * Cron Job chạy mỗi 1 phút: Tự động quét, gọi API hủy tới PayOS và đánh dấu EXPIRED các đơn quá hạn TTL
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expirePendingOrders(): Promise<void> {
    const now = new Date();
    const expiredOrders = await this.paymentOrderRepo
      .createQueryBuilder('order')
      .where('order.status = :status AND order.expiresAt < :now', {
        status: PaymentStatus.PENDING,
        now,
      })
      .getMany();

    if (expiredOrders.length === 0) return;

    this.logger.log(
      `Found ${expiredOrders.length} expired pending payment orders. Cancelling on PayOS and marking EXPIRED...`,
    );

    // Batch update all expired orders in a single query
    const expiredIds = expiredOrders.map((o) => o._id);
    await this.paymentOrderRepo
      .createQueryBuilder()
      .update(PaymentOrder)
      .set({ status: PaymentStatus.EXPIRED })
      .where('_id IN (:...ids)', { ids: expiredIds })
      .execute();

    // Call PayOS cancel API, cleanup Redis and emit socket notifications
    const cleanupPromises = expiredOrders.map(async (order) => {
      await this.cancelPayosPaymentRequest(
        order.orderCode,
        'Đơn hàng hết hạn thanh toán theo TTL',
      );
      await this.redisService.deleteValue(`payment:pending:${order.orderCode}`);
      await this.redisService.deleteValue(`payment:user_pending:${order.userId}`);

      this.paymentsGateway.emitPaymentStatusChanged(order.userId, {
        orderCode: order.orderCode,
        status: PaymentStatus.EXPIRED,
      });
    });
    await Promise.allSettled(cleanupPromises);
  }
}
