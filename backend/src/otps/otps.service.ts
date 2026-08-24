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
      throw new BadRequestException('User not found');
    }

    const existOtp = await this.otpRepo.findOne({
      where: { email: createOtpDto.email, isDeleted: false },
    });

    if (existOtp) {
      throw new BadRequestException('OTP already exists');
    }

    const otpToken = this.generateToken();
    const expiredAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const newOtp = this.otpRepo.create({
      token: otpToken.toString(),
      email: createOtpDto.email,
      expiredAt,
    });

    const result = await this.otpRepo.save(newOtp);
    this.mailService.sendOtp(createOtpDto.email, otpToken.toString());
    return result;
  }

  generateToken() {
    const token = crypto.randomInt(0, Math.pow(2, 32));
    return token;
  }

  async checkToken(token: string) {
    const otp = await this.otpRepo.findOne({
      where: { token, isDeleted: false },
    });
    if (!otp) {
      throw new BadRequestException('Token not found');
    }
    return otp;
  }

  async remove(token: string) {
    await this.otpRepo.delete({ token });
  }
}
