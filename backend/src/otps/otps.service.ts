import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateOtpDto } from './dto/create-otp.dto';
import { Otp } from './entities/otp.entity';
import { UsersService } from 'src/users/users.service';
import crypto from 'crypto';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class OtpsService {
  constructor(
    @InjectRepository(Otp)
    private readonly otpRepo: Repository<Otp>,
    @Inject(forwardRef(() => UsersService)) private userService: UsersService,
    private readonly mailService: MailService,
  ) {}

  async create(createOtpDto: CreateOtpDto) {
    const isExist = await this.userService.findUserByUsername(
      createOtpDto.email,
    );
    if (!isExist) {
      throw new BadRequestException('Không tìm thấy tài khoản với email này');
    }

    // Clean up any existing OTPs for this email to prevent blocking resends
    await this.otpRepo.delete({ email: createOtpDto.email });

    const otpToken = this.generateToken();
    const expiredAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const newOtp = this.otpRepo.create({
      token: otpToken,
      email: createOtpDto.email,
      expiredAt,
    });

    const result = await this.otpRepo.save(newOtp);
    await this.mailService.sendForgotPassword(createOtpDto.email, otpToken);
    return {
      message: 'Mã xác thực đã được gửi đến email của bạn',
      email: createOtpDto.email,
      expiredAt,
    };
  }

  generateToken() {
    const token = crypto.randomInt(100000, 1000000).toString();
    return token;
  }

  async checkToken(token: string) {
    const cleanToken = token?.trim();
    if (!cleanToken) {
      throw new BadRequestException('Vui lòng cung cấp mã xác thực');
    }

    const otp = await this.otpRepo.findOne({
      where: { token: cleanToken, isDeleted: false },
    });
    if (!otp) {
      throw new BadRequestException('Mã xác thực không đúng hoặc đã được sử dụng');
    }

    if (otp.expiredAt && new Date(otp.expiredAt) < new Date()) {
      await this.otpRepo.delete({ token: cleanToken });
      throw new BadRequestException('Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.');
    }

    return {
      message: 'Mã xác thực hợp lệ',
      email: otp.email,
      token: otp.token,
    };
  }

  async remove(token: string) {
    await this.otpRepo.delete({ token: token?.trim() });
  }
}
