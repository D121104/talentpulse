import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IUser } from 'src/users/users.interface';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/decorator/customize';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: IUser) {
    const user = await this.userRepo.findOne({ where: { _id: payload._id } });
    if (!user || user.isDeleted || user.deletedAt) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }
    if (user.isLocked) {
      throw new ForbiddenException(user.lockedReason || 'Tài khoản đã bị khóa');
    }
    if (user.role === Role.HR && user.isApproved !== true) {
      throw new ForbiddenException(
        'Tài khoản HR đang chờ quản trị viên phê duyệt',
      );
    }

    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      company: user.company,
      age: user.age,
      gender: user.gender,
      address: user.address,
      avatar: user.avatar,
      isApproved: user.isApproved,
      isPremium: user.isPremium || false,
      premiumPlan: user.premiumPlan || 'FREE',
      premiumExpiresAt: user.premiumExpiresAt || undefined,
      isVerified: user.isVerified || false,
      verifiedAt: user.verifiedAt || undefined,
      lastBoostedAt: user.lastBoostedAt || undefined,
      boostExpiresAt: user.boostExpiresAt || undefined,
      isJobSeeking: user.isJobSeeking ?? true,
      isJobRecommendation: user.isJobRecommendation ?? true,
      allowRecruiterSearch: user.allowRecruiterSearch ?? true,
    } as IUser;
  }
}
