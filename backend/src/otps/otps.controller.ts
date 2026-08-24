import { Controller, Post, Body } from '@nestjs/common';
import { OtpsService } from './otps.service';
import { CreateOtpDto } from './dto/create-otp.dto';
import { ApiTags } from '@nestjs/swagger';

@Controller('otps')
@ApiTags('OTPs Controller')
export class OtpsController {
  constructor(private readonly otpsService: OtpsService) {}

  @Post()
  create(@Body() createOtpDto: CreateOtpDto) {
    return this.otpsService.create(createOtpDto);
  }

  @Post('verify-otp')
  checkToken(@Body() body: { otp: string }) {
    return this.otpsService.checkToken(body.otp);
  }
}
