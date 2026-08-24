import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CookieOptions, Response } from 'express';
import ms from 'ms';
import crypto from 'crypto';
import { User } from 'src/users/entities/user.entity';
import { IUser } from 'src/users/users.interface';
import { UsersService } from 'src/users/users.service';
import { CreateUserDto } from 'src/users/dto/create-user.dto';
import { CreateHrDto } from 'src/users/dto/create-hr.dto';
import { Role } from 'src/decorator/customize';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  NotificationTargetType,
  NotificationType,
} from 'src/notifications/entities/notification.entity';
import { RedisService } from 'src/redis/redis.service';

interface GoogleProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
  ) {}

  async validateUser(email: string, password: string): Promise<IUser | null> {
    const user = await this.findUserByEmail(email);

    if (!user || !this.usersService.checkPassword(password, user.password)) {
      return null;
    }

    this.assertUserCanAuthenticate(user);
    return this.serializeUser(user);
  }

  async resetPassword(token: string, password: string) {
    const user = await this.usersService.forgotPassword(token);
    if (!user) {
      throw new BadRequestException('Invalid token');
    }

    await this.userRepo.update(user._id, {
      password: this.usersService.hashPassword(password),
      refreshToken: null as any,
    });

    return { message: 'Password reset successfully' };
  }

  async login(user: IUser, response: Response) {
    const currentUser = await this.userRepo.findOne({
      where: { _id: user._id },
    });

    if (!currentUser) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    return this.createSession(currentUser, response);
  }

  async register(createUserDto: CreateUserDto) {
    const email = this.normalizeEmail(createUserDto.email);
    await this.ensureEmailIsAvailable(email);

    const newUser = this.userRepo.create({
      ...createUserDto,
      email,
      password: this.usersService.hashPassword(createUserDto.password),
      role: Role.USER,
    });
    const savedUser = await this.userRepo.save(newUser);

    return { user: this.serializeUser(savedUser) };
  }

  async registerHr(createHrDto: CreateHrDto) {
    const { companyName, taxCode, companyScale, ...userDto } = createHrDto;
    const email = this.normalizeEmail(userDto.email);
    await this.ensureEmailIsAvailable(email);

    const registrationCompany =
      companyName || taxCode || companyScale
        ? {
            name: companyName || '',
            taxCode: taxCode || '',
            scale: companyScale || '',
          }
        : undefined;

    const newUser = this.userRepo.create({
      ...userDto,
      email,
      password: this.usersService.hashPassword(userDto.password),
      role: Role.HR,
      isApproved: false,
      ...(registrationCompany && { registrationCompany }),
    });
    const savedUser = await this.userRepo.save(newUser);

    const admins = await this.userRepo.find({
      where: { role: Role.ADMIN, isDeleted: false },
    });

    if (admins.length > 0) {
      await this.notificationsService.createBulk(
        admins.map((admin) => admin._id),
        'Đăng ký HR mới',
        `HR ${savedUser.name} (${savedUser.email}) đã đăng ký tài khoản. Vui lòng duyệt!`,
        NotificationType.SYSTEM,
        NotificationTargetType.USER,
        savedUser._id,
        { userId: savedUser._id, companyName, taxCode, companyScale },
      );
    }

    return { user: this.serializeUser(savedUser) };
  }

  async createGoogleExchangeCode(profile: GoogleProfile): Promise<string> {
    const email = this.normalizeEmail(profile.email);
    let user = await this.findUserByEmail(email);

    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({
          email,
          name: [profile.firstName, profile.lastName].filter(Boolean).join(' '),
          avatar: profile.picture,
          role: Role.USER,
          password: this.usersService.hashPassword(
            crypto.randomBytes(32).toString('hex'),
          ),
        }),
      );
    } else {
      this.assertUserCanAuthenticate(user);

      const updates: Partial<User> = {};
      if (!user.name && (profile.firstName || profile.lastName)) {
        updates.name = [profile.firstName, profile.lastName]
          .filter(Boolean)
          .join(' ');
      }
      if (!user.avatar && profile.picture) {
        updates.avatar = profile.picture;
      }
      if (Object.keys(updates).length > 0) {
        await this.userRepo.update(user._id, updates);
      }
    }

    const code = crypto.randomBytes(32).toString('hex');
    await this.redisService.setValue(`google-auth:${code}`, user._id, 60);
    return code;
  }

  async exchangeGoogleCode(code: string, response: Response) {
    const key = `google-auth:${code}`;
    const userId = await this.redisService.getValue<string>(key);

    if (!userId) {
      throw new BadRequestException('Mã đăng nhập Google đã hết hạn hoặc đã được sử dụng');
    }

    await this.redisService.deleteValue(key);
    const user = await this.userRepo.findOne({ where: { _id: userId } });
    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    return this.createSession(user, response);
  }

  async handleAccount(user: IUser) {
    const currentUser = await this.userRepo.findOne({
      where: { _id: user._id },
    });
    if (!currentUser) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    this.assertUserCanAuthenticate(currentUser);
    return { user: this.serializeUser(currentUser) };
  }

  async generateNewToken(refreshToken: string, response: Response) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.userRepo.findOne({
        where: { _id: payload._id, refreshToken },
      });

      if (!user) {
        throw new UnauthorizedException('Refresh token không hợp lệ');
      }

      return this.createSession(user, response);
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  async logout(user: IUser, response: Response) {
    await this.usersService.updateUserToken('', user._id);
    response.clearCookie('refresh_token', this.getRefreshCookieOptions());
    return { message: 'Đăng xuất thành công' };
  }

  private async createSession(user: User, response: Response) {
    this.assertUserCanAuthenticate(user);

    const payload = this.createTokenPayload(user);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.getRefreshTokenExpirationSeconds(),
    });
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: this.getAccessTokenExpirationSeconds(),
    });

    await this.usersService.updateUserToken(refreshToken, user._id);
    response.cookie('refresh_token', refreshToken, this.getRefreshCookieOptions());

    return {
      accessToken,
      user: this.serializeUser(user),
    };
  }

  private createTokenPayload(user: User) {
    return {
      sub: 'token login',
      iss: 'talentpulse-api',
      _id: user._id,
      email: user.email,
      role: user.role,
    };
  }

  private serializeUser(user: User): IUser {
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      age: user.age,
      gender: user.gender,
      address: user.address,
      avatar: user.avatar,
      company: user.company,
      isApproved: user.isApproved,
    };
  }

  private async ensureEmailIsAvailable(email: string) {
    if (await this.findUserByEmail(email)) {
      throw new BadRequestException('Email đã được sử dụng');
    }
  }

  private async findUserByEmail(email: string) {
    return this.userRepo.findOne({ where: { email: this.normalizeEmail(email) } });
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private assertUserCanAuthenticate(user: User) {
    if (user.isDeleted || user.deletedAt) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }
    if (user.isLocked) {
      throw new ForbiddenException(
        user.lockedReason || 'Tài khoản của bạn đã bị khóa',
      );
    }
  }

  private getAccessTokenExpirationSeconds() {
    return ms(this.configService.get<string>('JWT_EXPIRES_IN', '1d')) / 1000;
  }

  private getRefreshTokenExpirationSeconds() {
    return (
      ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d')) / 1000
    );
  }

  private getRefreshCookieOptions(): CookieOptions {
    const sameSite = this.configService.get<string>('COOKIE_SAME_SITE', 'lax');
    const domain = this.configService.get<string>('COOKIE_DOMAIN');
    const secure =
      this.configService.get<string>('COOKIE_SECURE') === 'true' ||
      this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure,
      sameSite: sameSite === 'none' ? 'none' : sameSite === 'strict' ? 'strict' : 'lax',
      maxAge: ms(
        this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      ),
      ...(domain ? { domain } : {}),
    };
  }
}
