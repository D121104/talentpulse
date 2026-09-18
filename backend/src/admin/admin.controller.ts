import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles, Role, ResponseMessage } from '../decorator/customize';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  @ResponseMessage('Lấy thông tin thống kê Dashboard Admin thành công')
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Patch('jobs/:id/toggle-active')
  @ResponseMessage('Thay đổi trạng thái hiển thị tin tuyển dụng thành công')
  toggleJobActive(@Param('id') id: string) {
    return this.adminService.toggleJobActive(id);
  }

  @Patch('companies/:id/toggle-active')
  @ResponseMessage('Thay đổi trạng thái doanh nghiệp thành công')
  toggleCompanyActive(@Param('id') id: string) {
    return this.adminService.toggleCompanyActive(id);
  }
}
