import { Controller, Post, Body } from '@nestjs/common';
import { OtpsService } from './otps.service';
import { CreateOtpDto } from './dto/create-otp.dto';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/decorator/customize';

@Controller('otps')
@ApiTags('OTPs Controller')
export class OtpsController {
  constructor(private readonly otpsService: OtpsService) {}

  @Public()
  @ApiOperation({ summary: 'Send an OTP for password reset' })
  @Post()
  create(@Body() createOtpDto: CreateOtpDto) {
    return this.otpsService.create(createOtpDto);
  }

  @Public()
  @ApiOperation({ summary: 'Verify an OTP token' })
  @Post('verify-otp')
  checkToken(@Body() body: { otp: string }) {
    return this.otpsService.checkToken(body.otp);
  }
}
