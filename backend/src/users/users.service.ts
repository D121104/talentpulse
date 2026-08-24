import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { RegisterUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserPasswordDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import * as bcrypt from 'bcryptjs';
import aqp from 'api-query-params';
import { IUser } from './users.interface';
import { OtpsService } from 'src/otps/otps.service';
import { MailService } from 'src/mail/mail.service';
import { Role } from 'src/decorator/customize';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @Inject(forwardRef(() => OtpsService))
    private readonly otpService: OtpsService,
    private readonly mailService: MailService,
  ) {}

  hashPassword = (password: string) => {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    return hash;
  };

  checkPassword = (password: string, hash: string) => {
    return bcrypt.compareSync(password, hash);
  };

  generateOtp = (length: number) => {
    const digits = '0123456789';
    let OTP = '';
    for (let i = 0; i < length; i++) {
      OTP += digits[Math.floor(Math.random() * 10)];
    }
    return OTP;
  };

  async create(registerUserDto: RegisterUserDto) {
    const isExist = await this.userRepo.findOne({
      where: { email: registerUserDto.email },
    });
    if (isExist) {
      throw new BadRequestException('Email already exists');
    }
    const hashedPassword = this.hashPassword(registerUserDto.password);

    const user = this.userRepo.create({
      ...registerUserDto,
      password: hashedPassword,
      role: registerUserDto.role || Role.USER,
    });

    const savedUser = await this.userRepo.save(user);
    return {
      _id: savedUser._id,
      createdAt: savedUser.createdAt,
    };
  }

  async findAll(qs: any) {
    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
    const current = qs.current ? parseInt(qs.current) : 1;
    const skip = (current - 1) * limit;

    const queryBuilder = this.userRepo
      .createQueryBuilder('user')
      .where('user.isDeleted = :isDeleted', { isDeleted: false });

    if (filter.role) {
      queryBuilder.andWhere('user.role = :role', { role: filter.role });
    }
    if (filter.email) {
      queryBuilder.andWhere('user.email ILIKE :email', {
        email: `%${filter.email}%`,
      });
    }
    if (filter.name) {
      queryBuilder.andWhere('user.name ILIKE :name', {
        name: `%${filter.name}%`,
      });
    }

    if (sort) {
      for (const [key, value] of Object.entries(sort)) {
        queryBuilder.addOrderBy(
          `user.${key}`,
          (value as number) === 1 ? 'ASC' : 'DESC',
        );
      }
    } else {
      queryBuilder.orderBy('user.createdAt', 'DESC');
    }

    const [users, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    // Remove sensitive fields
    const sanitizedUsers = users.map((u) => {
      const { password, refreshToken, ...rest } = u;
      return rest;
    });

    return {
      meta: {
        current: current,
        pageSize: limit,
        pages: totalPage,
        total: totalRecord,
      },
      result: sanitizedUsers,
    };
  }

  async findOneByEmail(email: string) {
    return await this.userRepo.findOne({
      where: { email, isDeleted: false },
    });
  }

  async findByCompanyId(companyId: string) {
    return await this.userRepo
      .createQueryBuilder('user')
      .where("user.company->>'_id' = :companyId", { companyId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .getOne();
  }

  async findAllByCompanyId(companyId: string) {
    return await this.userRepo
      .createQueryBuilder('user')
      .where("user.company->>'_id' = :companyId", { companyId })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false })
      .getMany();
  }

  async findOne(id: string) {
    const user = await this.userRepo.findOne({
      where: { _id: id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { password, refreshToken, ...rest } = user;
    return rest;
  }

  async findUserByUsername(username: string) {
    return await this.userRepo.findOne({
      where: { email: username, isDeleted: false },
    });
  }

  async findUserByName(name: string) {
    return await this.userRepo.findOne({
      where: { name },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto, user: IUser) {
    const existing = await this.userRepo.findOne({ where: { _id: id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    return await this.userRepo.update(id, {
      ...updateUserDto,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });
  }

  async updateUserCompany(
    userId: string,
    company: { _id: string; name: string },
  ) {
    return await this.userRepo.update(userId, { company });
  }

  async updateUserRole(userId: string, role: Role) {
    return await this.userRepo.update(userId, { role });
  }

  async remove(id: string) {
    await this.userRepo.update(id, { isDeleted: true, deletedAt: new Date() });
    return await this.userRepo.softDelete(id);
  }

  updateUserToken = async (refreshToken: string, _id: string) => {
    await this.userRepo.update(_id, { refreshToken });
  };

  updatePassword = async (id: string, updateUserDto: UpdateUserPasswordDto) => {
    const user = await this.userRepo.findOne({ where: { _id: id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!this.checkPassword(updateUserDto.oldPassword, user.password)) {
      throw new BadRequestException('Current password is incorrect');
    }

    return await this.userRepo.update(id, {
      password: this.hashPassword(updateUserDto.newPassword),
    });
  };

  async forgotPassword(token: string) {
    const otpUser = await this.otpService.checkToken(token);

    if (!otpUser) {
      throw new BadRequestException('Token not found!');
    }

    await this.otpService.remove(token);

    return await this.userRepo.findOne({ where: { email: otpUser.email } });
  }

  async countUser() {
    return await this.userRepo.count({ where: { isDeleted: false } });
  }

  // Remove HR from company (only company creator or admin)
  async removeHrFromCompany(hrId: string, companyId: string, requester: IUser) {
    if (requester.role !== Role.ADMIN) {
      const company = await this.companyRepo.findOne({
        where: { _id: companyId },
      });
      if (!company) {
        throw new NotFoundException('Công ty không tồn tại');
      }
      if (company.createdBy?._id?.toString() !== requester._id.toString()) {
        throw new BadRequestException(
          'Chỉ người tạo công ty mới có quyền xóa HR khác',
        );
      }
    }

    const hr = await this.userRepo.findOne({
      where: { _id: hrId, role: Role.HR, isDeleted: false },
    });
    if (!hr) {
      throw new NotFoundException('HR not found');
    }

    if (!hr.company || hr.company._id.toString() !== companyId) {
      throw new BadRequestException('HR không thuộc công ty này');
    }

    await this.userRepo.update(hrId, { company: null as any });

    return { message: 'Xóa HR khỏi công ty thành công' };
  }

  // Leave company (for non-creator HRs)
  async leaveCompany(user: IUser) {
    const currentUser = await this.userRepo.findOne({
      where: { _id: user._id, isDeleted: false },
    });
    if (!currentUser) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    if (!currentUser.company) {
      throw new BadRequestException('Bạn hiện không thuộc công ty nào');
    }

    const companyId = currentUser.company._id.toString();
    const company = await this.companyRepo.findOne({
      where: { _id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Công ty không tồn tại');
    }

    if (company.createdBy?._id?.toString() === user._id.toString()) {
      throw new BadRequestException(
        'Người tạo công ty không thể rời công ty. Hãy chuyển quyền hoặc xóa công ty.',
      );
    }

    await this.userRepo.update(user._id, { company: null as any });

    return { message: 'Rời công ty thành công' };
  }

  // Lock user account (Admin only)
  async lockUser(userId: string, reason: string, adminUser: IUser) {
    const user = await this.userRepo.findOne({
      where: { _id: userId, isDeleted: false },
    });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    if (user.role === Role.ADMIN) {
      throw new BadRequestException('Không thể khóa tài khoản Admin');
    }

    if (user.isLocked) {
      throw new BadRequestException('Tài khoản này đã bị khóa');
    }

    await this.userRepo.update(userId, {
      isLocked: true,
      lockedAt: new Date(),
      lockedReason: reason || 'Vi phạm quy định của hệ thống',
      updatedBy: {
        _id: adminUser._id,
        email: adminUser.email,
      },
    });

    return { message: 'Khóa tài khoản thành công' };
  }

  // Unlock user account (Admin only)
  async unlockUser(userId: string, adminUser: IUser) {
    const user = await this.userRepo.findOne({
      where: { _id: userId, isDeleted: false },
    });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    if (!user.isLocked) {
      throw new BadRequestException('Tài khoản này chưa bị khóa');
    }

    await this.userRepo.update(userId, {
      isLocked: false,
      lockedAt: null as any,
      lockedReason: null as any,
      updatedBy: {
        _id: adminUser._id,
        email: adminUser.email,
      },
    });

    return { message: 'Mở khóa tài khoản thành công' };
  }

  // Approve HR account (Admin only)
  async approveHr(userId: string, adminUser: IUser) {
    const user = await this.userRepo.findOne({
      where: { _id: userId, isDeleted: false },
    });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    if (user.role !== Role.HR) {
      throw new BadRequestException('Người dùng không phải HR');
    }

    if (user.isApproved) {
      throw new BadRequestException('Tài khoản HR đã được duyệt');
    }

    await this.userRepo.update(userId, {
      isApproved: true,
      updatedBy: {
        _id: adminUser._id,
        email: adminUser.email,
      },
    });

    return { message: 'Duyệt tài khoản HR thành công' };
  }

  // Get all admin users
  async findAllAdmins() {
    return await this.userRepo.find({
      where: { role: Role.ADMIN, isDeleted: false },
    });
  }

  // Get pending HR accounts (Admin only)
  async findPendingHrs() {
    return await this.userRepo.find({
      where: { role: Role.HR, isApproved: false, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  // Get all candidates (USER role only) for Admin
  async findAllCandidates(qs: any) {
    const { filter, sort } = aqp(qs);
    delete filter.current;
    delete filter.pageSize;

    const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
    const current = qs.current ? parseInt(qs.current) : 1;
    const skip = (current - 1) * limit;

    const queryBuilder = this.userRepo
      .createQueryBuilder('user')
      .where('user.role = :role', { role: Role.USER })
      .andWhere('user.isDeleted = :isDeleted', { isDeleted: false });

    if (filter.email) {
      queryBuilder.andWhere('user.email ILIKE :email', {
        email: `%${filter.email}%`,
      });
    }
    if (filter.name) {
      queryBuilder.andWhere('user.name ILIKE :name', {
        name: `%${filter.name}%`,
      });
    }

    if (sort) {
      for (const [key, value] of Object.entries(sort)) {
        queryBuilder.addOrderBy(
          `user.${key}`,
          (value as number) === 1 ? 'ASC' : 'DESC',
        );
      }
    } else {
      queryBuilder.orderBy('user.createdAt', 'DESC');
    }

    const [users, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    const sanitizedUsers = users.map((u) => {
      const { password, refreshToken, ...rest } = u;
      return rest;
    });

    return {
      meta: {
        current: current,
        pageSize: limit,
        pages: totalPage,
        total: totalRecord,
      },
      result: sanitizedUsers,
    };
  }
}
