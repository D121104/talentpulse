import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import ms from 'ms';
import { User } from 'src/users/entities/user.entity';
import { IUser } from 'src/users/users.interface';
import { UsersService } from 'src/users/users.service';
import { CreateUserDto, RegisterUserDto } from 'src/users/dto/create-user.dto';
import crypto from 'crypto';
import { Role } from 'src/decorator/customize';
import { CreateHrDto } from 'src/users/dto/create-hr.dto';
import { CompaniesService } from 'src/companies/companies.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import {
  NotificationTargetType,
  NotificationType,
} from 'src/notifications/entities/notification.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private configService: ConfigService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private companiesService: CompaniesService,
    private notificationsService: NotificationsService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findUserByUsername(username);
    if (user) {
      if (user.isLocked) {
        return { isLocked: true, lockedReason: user.lockedReason };
      }
      const isValid = this.usersService.checkPassword(pass, user.password);
      if (isValid) {
        const { password, ...rest } = user;
        return rest;
      }
    }
    return null;
  }

  async resetPassword(token: string, password: string) {
    const user = await this.usersService.forgotPassword(token);
    if (!user) {
      throw new BadRequestException('Invalid token');
    }

    const hashedPassword = this.usersService.hashPassword(password);

    await this.userRepo.update(user._id, { password: hashedPassword });

    return { message: 'Password reset successfully' };
  }

  generateRefreshToken = (payload: any) => {
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn:
        ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) / 1000,
    });

    return refreshToken;
  };

  async login(user: IUser, res: Response) {
    const { _id, name, email, role, age, gender, address, avatar } = user;

    const payload = {
      sub: 'token login',
      iss: 'from server',
      email,
      _id,
      role,
      name,
      age,
      gender,
      address,
      avatar,
    };

    const refreshToken = this.generateRefreshToken(payload);
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_EXPIRES_IN')) / 1000,
    });

    await this.usersService.updateUserToken(refreshToken, _id);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      maxAge:
        ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) * 1000,
      sameSite: 'none',
      secure: true,
    });

    const userData: any = {
      _id,
      email,
      name,
      role,
      age: user.age,
      gender: user.gender,
      address: user.address,
      avatar: user.avatar,
    };

    if (user.role === Role.HR) {
      if (user.company) {
        userData.company = user.company;
      }
      userData.isApproved = user.isApproved !== false;
    }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: userData,
    };
  }

  async register(createUserDto: CreateUserDto) {
    const isExistEmail = await this.userRepo.findOne({
      where: { email: createUserDto.email },
    });

    if (isExistEmail) {
      throw new BadRequestException('Email already exists');
    }

    const hashedPassword = this.usersService.hashPassword(
      createUserDto.password,
    );

    const newUser = this.userRepo.create({
      ...createUserDto,
      password: hashedPassword,
      role: Role.USER,
    });

    const savedUser = await this.userRepo.save(newUser);

    return {
      _id: savedUser._id,
      createdAt: savedUser.createdAt,
    };
  }

  async googleLogin(req: any, res: Response) {
    const { user } = req;

    const isExistEmail = await this.userRepo.findOne({
      where: { email: user.email },
    });

    let currentUser: User;

    const newPassword = crypto.randomBytes(20).toString('hex');
    const hashedPassword = this.usersService.hashPassword(newPassword);

    if (!isExistEmail) {
      const created = this.userRepo.create({
        email: user.email,
        name: user.firstName + ' ' + user.lastName,
        role: Role.USER,
        password: hashedPassword,
      });
      currentUser = await this.userRepo.save(created);
    } else {
      await this.userRepo.update(
        { email: user.email },
        { name: user.firstName + ' ' + user.lastName },
      );

      currentUser = (await this.userRepo.findOne({
        where: { email: user.email },
      })) as User;
    }

    const payload = {
      sub: 'token login',
      iss: 'from server',
      email: currentUser.email,
      _id: currentUser._id,
      role: currentUser.role,
      name: currentUser.name,
    };

    const refreshToken = this.generateRefreshToken(payload);
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: ms(this.configService.get<string>('JWT_EXPIRES_IN')) / 1000,
    });

    await this.usersService.updateUserToken(refreshToken, currentUser._id);

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      maxAge:
        ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) * 1000,
      sameSite: 'none',
      secure: true,
    });

    return {
      access_token: accessToken,
    };
  }

  async handleAccount(user: IUser) {
    const currUser = await this.userRepo.findOne({ where: { _id: user._id } });

    if (!currUser) {
      throw new BadRequestException('User not found');
    }

    const userData: any = {
      _id: currUser._id,
      email: currUser.email,
      name: currUser.name,
      role: currUser.role,
      company: currUser.company,
      age: currUser.age,
      address: currUser.address,
      gender: currUser.gender,
      avatar: currUser.avatar,
    };

    if (currUser.role === Role.HR) {
      userData.isApproved = currUser.isApproved !== false;
    }

    return { user: userData };
  }

  generateNewToken = async (refreshToken: string, res: Response) => {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      if (!payload) {
        throw new BadRequestException('Invalid refresh token');
      }

      const user = await this.userRepo.findOne({ where: { refreshToken } });

      if (user) {
        const { _id, name, email, role } = user;
        const newPayload = {
          sub: 'token login',
          iss: 'from server',
          email,
          _id,
          role,
          name,
        };

        const newRefreshToken = this.generateRefreshToken(newPayload);
        await this.usersService.updateUserToken(
          newRefreshToken,
          _id.toString(),
        );

        res.cookie('refresh_token', newRefreshToken, {
          httpOnly: true,
          maxAge:
            ms(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')) * 1000,
          sameSite: 'none',
          secure: true,
        });

        return {
          access_token: this.jwtService.sign(newPayload, {
            secret: this.configService.get<string>('JWT_SECRET'),
            expiresIn:
              ms(this.configService.get<string>('JWT_EXPIRES_IN')) / 1000,
          }),
          user: {
            _id,
            email,
            name,
            role,
            avatar: user.avatar,
          },
        };
      }
    } catch (err) {
      throw new BadRequestException('Invalid refresh token');
    }
  };

  async registerHr(createHrDto: CreateHrDto) {
    const { companyName, taxCode, companyScale, ...userDto } = createHrDto;

    const isExistEmail = await this.userRepo.findOne({
      where: { email: createHrDto.email },
    });
    if (isExistEmail) {
      throw new BadRequestException('Email already exists');
    }

    const hashedPassword = this.usersService.hashPassword(userDto.password);
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
      password: hashedPassword,
      role: Role.HR,
      isApproved: false,
      ...(registrationCompany && { registrationCompany }),
    });

    const savedUser = await this.userRepo.save(newUser);

    // Notify all admins about new HR registration
    const admins = await this.userRepo.find({
      where: {
        role: Role.ADMIN,
        isDeleted: false,
      },
    });

    if (admins && admins.length > 0) {
      const adminIds = admins.map((a) => a._id);
      const companyInfo = companyName ? ` - Công ty: ${companyName}` : '';
      const taxInfo = taxCode ? ` - MST: ${taxCode}` : '';
      const scaleInfo = companyScale ? ` - Quy mô: ${companyScale}` : '';
      const content = `HR ${createHrDto.name} (${createHrDto.email}) đã đăng ký tài khoản${companyInfo}${taxInfo}${scaleInfo}. Vui lòng duyệt!`;
      await this.notificationsService.createBulk(
        adminIds,
        'Đăng ký HR mới',
        content,
        NotificationType.SYSTEM,
        NotificationTargetType.USER,
        savedUser._id,
        { userId: savedUser._id, companyName, taxCode, companyScale },
      );
    }

    return {
      _id: savedUser._id,
      createdAt: savedUser.createdAt,
    };
  }

  logout = async (user: IUser, res: Response) => {
    await this.usersService.updateUserToken('', user._id);
    res.clearCookie('refresh_token');
    res.clearCookie('userId');
    return 'Logout success!';
  };
}
