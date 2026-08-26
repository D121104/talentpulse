import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Res,
  Delete,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User as UserDec, ResponseMessage, Public } from '../decorator/customize';
import { IUser } from '../users/users.interface';
import { PaymentsService, CreatePaymentOrderDto } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

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
}

