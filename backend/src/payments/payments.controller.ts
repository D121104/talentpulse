import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  Delete,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import {
  User as UserDec,
  ResponseMessage,
  Public,
  Roles,
  Role,
} from '../decorator/customize';
import { IUser } from '../users/users.interface';
import { PaymentsService, CreatePaymentOrderDto } from './payments.service';
import {
  CreatePremiumPackageDto,
  UpdatePremiumPackageDto,
} from './dto/premium-package.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Public API: Lấy danh sách các gói dịch vụ Premium đang kích hoạt cho Bảng giá
   */
  @Public()
  @Get('packages')
  @ResponseMessage('Lấy danh sách gói Premium thành công')
  getPublicPackages() {
    return this.paymentsService.getPublicPackages();
  }

  @UseGuards(JwtAuthGuard)
  @Post('create-order')
  @ResponseMessage('Tạo đơn hàng thanh toán thành công')
  createPaymentOrder(
    @UserDec() user: IUser,
    @Body() dto: CreatePaymentOrderDto,
  ) {
    return this.paymentsService.createPaymentOrder(user._id, dto);
  }

  @Public()
  @Get('verify/:orderCode')
  async verifyPaymentOrder(
    @Param('orderCode', ParseIntPipe) orderCode: number,
    @Res() res: Response,
  ) {
    try {
      const { redirectUrl } =
        await this.paymentsService.verifyPaymentOrder(orderCode);
      return res.redirect(redirectUrl);
    } catch {
      const frontendUrl = process.env.URL_FRONTEND || 'http://localhost:5173';
      return res.redirect(
        `${frontendUrl}/payment-history?orderCode=${orderCode}&status=failed`,
      );
    }
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any) {
    await this.paymentsService.handleWebhook(body);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  @ResponseMessage('Lấy danh sách lịch sử thanh toán thành công')
  getPaymentHistory(@UserDec() user: IUser) {
    return this.paymentsService.getPaymentHistory(user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':orderCode')
  @ResponseMessage('Hủy đơn hàng thành công')
  async cancelPaymentOrder(
    @UserDec() user: IUser,
    @Param('orderCode', ParseIntPipe) orderCode: number,
  ) {
    await this.paymentsService.cancelPaymentOrder(orderCode, user._id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':orderCode/expire')
  @ResponseMessage('Đã hủy và cập nhật hết hạn đơn hàng')
  async expirePaymentOrder(
    @UserDec() user: IUser,
    @Param('orderCode', ParseIntPipe) orderCode: number,
  ) {
    return this.paymentsService.expireSpecificOrder(orderCode, user._id);
  }

  // ============================================================
  // ADMIN ONLY ENDPOINTS
  // ============================================================

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/packages')
  @ResponseMessage('Lấy toàn bộ gói Premium cho Admin thành công')
  getAllPackagesForAdmin() {
    return this.paymentsService.getAllPackagesForAdmin();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/packages')
  @ResponseMessage('Tạo gói Premium mới thành công')
  createPackage(
    @Body() dto: CreatePremiumPackageDto,
    @UserDec() admin: IUser,
  ) {
    return this.paymentsService.createPackage(dto, admin);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/packages/:id')
  @ResponseMessage('Cập nhật gói Premium thành công')
  updatePackage(
    @Param('id') id: string,
    @Body() dto: UpdatePremiumPackageDto,
    @UserDec() admin: IUser,
  ) {
    return this.paymentsService.updatePackage(id, dto, admin);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/packages/:id/toggle')
  @ResponseMessage('Thay đổi trạng thái gói Premium thành công')
  togglePackageActive(
    @Param('id') id: string,
    @UserDec() admin: IUser,
  ) {
    return this.paymentsService.togglePackageActive(id, admin);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/packages/:id')
  @ResponseMessage('Xóa gói Premium thành công')
  deletePackage(
    @Param('id') id: string,
    @UserDec() admin: IUser,
  ) {
    return this.paymentsService.deletePackage(id, admin);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/transactions')
  @ResponseMessage('Lấy danh sách giao dịch toàn sàn thành công')
  getAdminTransactions(@Query() qs: any) {
    return this.paymentsService.getAdminTransactions(qs);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/subscriptions')
  @ResponseMessage('Lấy danh sách thuê bao người dùng thành công')
  getAdminSubscriptions(@Query() qs: any) {
    return this.paymentsService.getAdminSubscriptions(qs);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/subscriptions/:userId/extend')
  @ResponseMessage('Gia hạn thuê bao thành công')
  manualExtendSubscription(
    @Param('userId') userId: string,
    @Body() body: { days: number },
    @UserDec() admin: IUser,
  ) {
    return this.paymentsService.manualExtendSubscription(
      userId,
      body.days || 30,
      admin,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/subscriptions/:userId/cancel')
  @ResponseMessage('Hủy thuê bao thành công')
  manualCancelSubscription(
    @Param('userId') userId: string,
    @UserDec() admin: IUser,
  ) {
    return this.paymentsService.manualCancelSubscription(userId, admin);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/stats')
  @ResponseMessage('Lấy thống kê doanh thu Admin thành công')
  getAdminRevenueStats() {
    return this.paymentsService.getAdminRevenueStats();
  }
}

