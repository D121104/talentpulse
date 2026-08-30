import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisterUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UpdateUserPasswordDto } from './dto/update-user.dto';
import { User, PremiumPlan } from './entities/user.entity';
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

  private assertUserReadAccess(userId: string, actor?: IUser) {
    // Calls without an actor are trusted internal lookups used by other services.
    if (!actor || actor.role === Role.ADMIN) {
      return;
    }

    if (actor._id?.toString() !== userId?.toString()) {
      throw new ForbiddenException('You can only view your own user profile');
    }
  }

  private assertAdminActor(actor?: IUser) {
    // Existing internal callers do not have an HTTP actor; controller routes always pass one.
    if (actor && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only admins can access this user list');
    }
  }

  private sanitizeCompany(company: User['company']) {
    if (!company) {
      return company;
    }

    return {
      _id: company._id,
      name: company.name,
      isActive: company.isActive,
    };
  }

  private sanitizeUser(user: User, includeAdminFields = false) {
    const safeUser = {
      _id: user._id,
      email: user.email,
      name: user.name,
      gender: user.gender,
      age: user.age,
      address: user.address,
      avatar: user.avatar,
      role: user.role,
      isPremium: user.isPremium || false,
      premiumPlan: user.premiumPlan || PremiumPlan.FREE,
      premiumExpiresAt: user.premiumExpiresAt || undefined,
      isVerified: user.isVerified || false,
      verifiedAt: user.verifiedAt || undefined,
      company: this.sanitizeCompany(user.company),
      isApproved: user.isApproved,
      lastBoostedAt: user.lastBoostedAt || undefined,
      boostExpiresAt: user.boostExpiresAt || undefined,
      isJobSeeking: user.isJobSeeking ?? true,
      isJobRecommendation: user.isJobRecommendation ?? true,
      allowRecruiterSearch: user.allowRecruiterSearch ?? true,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    if (!includeAdminFields) {
      return safeUser;
    }

    return {
      ...safeUser,
      isLocked: user.isLocked,
      lockedAt: user.lockedAt,
      lockedReason: user.lockedReason,
      registrationCompany: user.registrationCompany
        ? {
            name: user.registrationCompany.name,
            taxCode: user.registrationCompany.taxCode,
            scale: user.registrationCompany.scale,
          }
        : user.registrationCompany,
    };
  }

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

  async findAll(qs: any, actor?: IUser) {
    this.assertAdminActor(actor);
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

    const sanitizedUsers = users.map((u) => this.sanitizeUser(u, true));

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
    const rows = await this.userRepo.query(
      `SELECT * FROM users WHERE company->>'_id' = $1 AND "isDeleted" = false LIMIT 1`,
      [companyId],
    );
    return rows && rows.length > 0 ? this.sanitizeUser(rows[0]) : null;
  }

  async findAllByCompanyId(companyId: string) {
    const rows = await this.userRepo.query(
      `SELECT * FROM users WHERE company->>'_id' = $1 AND "isDeleted" = false ORDER BY "createdAt" ASC`,
      [companyId],
    );
    return rows.map((user) => this.sanitizeUser(user));
  }

  async findOne(id: string, actor?: IUser) {
    this.assertUserReadAccess(id, actor);
    const user = await this.userRepo.findOne({
      where: { _id: id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user, actor?.role === Role.ADMIN);
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

    const isAdmin = user.role === Role.ADMIN;
    if (!isAdmin && id.toString() !== user._id.toString()) {
      throw new ForbiddenException('You can only update your own profile');
    }

    const hasRoleUpdate = Object.prototype.hasOwnProperty.call(
      updateUserDto,
      'role',
    );
    const hasCompanyUpdate = Object.prototype.hasOwnProperty.call(
      updateUserDto,
      'company',
    );

    if (!isAdmin && hasRoleUpdate) {
      throw new BadRequestException('Only admins can change user roles');
    }

    if (!isAdmin && hasCompanyUpdate) {
      throw new BadRequestException(
        'Only admins can change user company assignments',
      );
    }

    const updateData: Partial<User> = {};
    if (Object.prototype.hasOwnProperty.call(updateUserDto, 'email')) {
      updateData.email = updateUserDto.email;
    }
    if (Object.prototype.hasOwnProperty.call(updateUserDto, 'name')) {
      updateData.name = updateUserDto.name;
    }
    if (Object.prototype.hasOwnProperty.call(updateUserDto, 'age')) {
      updateData.age = updateUserDto.age;
    }
    if (Object.prototype.hasOwnProperty.call(updateUserDto, 'gender')) {
      updateData.gender = updateUserDto.gender;
    }
    if (Object.prototype.hasOwnProperty.call(updateUserDto, 'address')) {
      updateData.address = updateUserDto.address;
    }
    if (Object.prototype.hasOwnProperty.call(updateUserDto, 'avatar')) {
      updateData.avatar = updateUserDto.avatar;
    }

    // Role and company changes remain available only through the admin update path.
    if (isAdmin && hasRoleUpdate) {
      updateData.role = updateUserDto.role;
    }
    if (isAdmin && hasCompanyUpdate) {
      updateData.company = updateUserDto.company;
    }

    return await this.userRepo.update(id, {
      ...updateData,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });
  }

  async updateUserCompany(
    userId: string,
    company: { _id: string; name: string; isActive?: boolean },
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

    const currentPassword =
      updateUserDto.currentPassword ?? updateUserDto.oldPassword;
    const newPassword = updateUserDto.newPassword ?? updateUserDto.password;

    if (!currentPassword || !newPassword) {
      throw new BadRequestException(
        'Current password and new password are required',
      );
    }

    if (!this.checkPassword(currentPassword, user.password)) {
      throw new BadRequestException('Current password is incorrect');
    }

    return await this.userRepo.update(id, {
      password: this.hashPassword(newPassword),
      refreshToken: null,
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
          'Chỉ HR Trưởng (người tạo công ty) mới có quyền xóa HR khác khỏi công ty',
        );
      }
    }

    if (hrId === requester._id.toString()) {
      throw new BadRequestException(
        'HR Trưởng không thể tự xóa chính mình khỏi công ty',
      );
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
        'HR Trưởng (người tạo công ty) không được quyền rời công ty. Hãy chuyển giao quyền quản lý hoặc giải thể công ty.',
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

    // If HR registered with company information and has no company yet, automatically create company active
    if (user.registrationCompany?.name && !user.company) {
      const existingCompany = await this.companyRepo.findOne({
        where: { name: user.registrationCompany.name },
      });

      if (!existingCompany) {
        const newCompany = this.companyRepo.create({
          name: user.registrationCompany.name,
          taxCode: user.registrationCompany.taxCode || '',
          scale: user.registrationCompany.scale || '',
          isActive: true,
          createdBy: {
            _id: user._id,
            email: user.email,
          },
        });
        const savedCompany = await this.companyRepo.save(newCompany);

        await this.userRepo.update(userId, {
          company: {
            _id: savedCompany._id.toString(),
            name: savedCompany.name,
            isActive: true,
          },
        });
      }
    }

    return { message: 'Duyệt tài khoản HR thành công' };
  }

  // Get all admin users
  async findAllAdmins() {
    const users = await this.userRepo.find({
      where: { role: Role.ADMIN, isDeleted: false },
    });
    return users.map((user) => this.sanitizeUser(user, true));
  }

  // Get pending HR accounts (Admin only)
  async findPendingHrs(actor?: IUser) {
    this.assertAdminActor(actor);
    const users = await this.userRepo.find({
      where: { role: Role.HR, isApproved: false, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
    return users.map((user) => this.sanitizeUser(user, true));
  }

  // Get all candidates (USER role only) for Admin
  async findAllCandidates(qs: any, actor?: IUser) {
    this.assertAdminActor(actor);
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
      queryBuilder.addOrderBy('user._id', 'DESC');
    } else {
      queryBuilder
        .addSelect(
          `(CASE WHEN user.boostExpiresAt > NOW() THEN 1 ELSE 0 END)`,
          'candidate_boosted',
        )
        .orderBy('candidate_boosted', 'DESC')
        .addOrderBy('user.isPremium', 'DESC')
        .addOrderBy('user.isVerified', 'DESC')
        .addOrderBy('user.createdAt', 'DESC')
        .addOrderBy('user._id', 'DESC');
    }

    const [users, totalRecord] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPage = Math.ceil(totalRecord / limit);

    const sanitizedUsers = users.map((u) => this.sanitizeUser(u, true));

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

  /**
   * Kiểm tra xem người dùng có đang sở hữu gói Premium hợp lệ (hoặc là ADMIN) không
   */
  isUserPremium(user: User | IUser | any): boolean {
    if (!user) return false;
    if (user.role === Role.ADMIN) return true;
    if (!user.isPremium) return false;
    if (!user.premiumExpiresAt) return true; // Gói vĩnh viễn hoặc chưa hết hạn
    return new Date(user.premiumExpiresAt) > new Date();
  }

  /**
   * Kiểm tra xem tài khoản có quyền HR Premium (hoặc Admin) không
   */
  isHrPremium(user: User | IUser | any): boolean {
    if (!user) return false;
    if (user.role === Role.ADMIN) return true;
    if (!this.isUserPremium(user)) return false;
    return user.premiumPlan === PremiumPlan.HR_PREMIUM;
  }

  /**
   * Kiểm tra xem ứng viên có quyền Candidate Premium không
   */
  isCandidatePremium(user: User | IUser | any): boolean {
    if (!user) return false;
    if (user.role === Role.ADMIN) return true;
    if (!this.isUserPremium(user)) return false;
    return user.premiumPlan === PremiumPlan.CANDIDATE_PREMIUM;
  }

  /**
   * Lấy giới hạn số lượng tin tuyển dụng đang hoạt động tối đa
   * - HR Standard (Free): 6 tin đang hoạt động cùng lúc (còn hạn, chưa bị xóa)
   * - HR Premium / Admin: Không giới hạn (999999)
   */
  getUserMaxActiveJobs(user: User | IUser | any): number {
    if (!user) return 6;
    if (this.isHrPremium(user)) {
      return 999999;
    }
    return 6;
  }

  getUserMaxDailyJobs(user: User | IUser | any): number {
    return this.getUserMaxActiveJobs(user);
  }

  /**
   * Nâng cấp gói Premium cho người dùng
   */
  async upgradePremiumPlan(
    userId: string,
    plan: string,
    durationDays: number,
  ): Promise<any> {
    const user = await this.userRepo.findOne({ where: { _id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = new Date();
    const currentExpiry =
      user.premiumExpiresAt && new Date(user.premiumExpiresAt) > now
        ? new Date(user.premiumExpiresAt)
        : now;

    const newExpiry = new Date(
      currentExpiry.getTime() + durationDays * 24 * 60 * 60 * 1000,
    );

    user.isPremium = true;
    user.premiumPlan = plan as any;
    user.premiumExpiresAt = newExpiry;

    const savedUser = await this.userRepo.save(user);

    if (user.company?._id && plan === PremiumPlan.HR_PREMIUM) {
      await this.companyRepo.update(user.company._id, {
        isPremium: true,
        premiumExpiresAt: newExpiry,
      });
    }

    return this.sanitizeUser(savedUser);
  }

  /**
   * Đẩy Top hồ sơ ứng viên (Profile Boosting)
   * - Candidate Premium: 1 lần / ngày (cooldown 24h, boost 24h)
   * - Đã Xác Thực: 1 lần / tuần (cooldown 7 ngày, boost 12h)
   * - Thường (chưa xác thực): Bị chặn
   */
  async boostProfile(userId: string) {
    const user = await this.userRepo.findOne({ where: { _id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (user.role !== Role.USER) {
      throw new BadRequestException(
        'Tính năng Đẩy Top chỉ dành cho tài khoản Ứng viên (Candidate)',
      );
    }

    const isPremium = this.isCandidatePremium(user);
    const isVerified = user.isVerified || false;

    if (!isPremium && !isVerified) {
      throw new ForbiddenException(
        'Tính năng Đẩy Top hồ sơ yêu cầu tài khoản Đã Xác Thực (1 lần/tuần) hoặc Candidate Premium (1 lần/ngày). Vui lòng xác thực email hoặc nâng cấp gói Premium.',
      );
    }

    const now = Date.now();
    const cooldownMs = isPremium
      ? 24 * 60 * 60 * 1000 // 24 hours for Premium
      : 7 * 24 * 60 * 60 * 1000; // 7 days for Verified

    const boostDurationMs = isPremium
      ? 24 * 60 * 60 * 1000 // 24 hours boost for Premium
      : 12 * 60 * 60 * 1000; // 12 hours boost for Verified

    if (user.lastBoostedAt) {
      const elapsedMs = now - new Date(user.lastBoostedAt).getTime();
      if (elapsedMs < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        const days = Math.floor(remainingSeconds / 86400);
        const hours = Math.floor((remainingSeconds % 86400) / 3600);
        const minutes = Math.floor((remainingSeconds % 3600) / 60);

        let remainingText = '';
        if (days > 0) remainingText += `${days} ngày `;
        if (hours > 0) remainingText += `${hours} giờ `;
        remainingText += `${minutes} phút`;

        throw new BadRequestException(
          `Bạn đang trong thời gian hồi chiêu lượt đẩy top. Vui lòng thử lại sau ${remainingText.trim()}.`,
        );
      }
    }

    const boostExpiresAt = new Date(now + boostDurationMs);
    user.lastBoostedAt = new Date(now);
    user.boostExpiresAt = boostExpiresAt;

    await this.userRepo.save(user);

    return {
      message:
        '🚀 Đẩy top hồ sơ thành công! Hồ sơ của bạn đã được đưa lên vị trí ưu tiên hàng đầu trong tìm kiếm CV của Nhà Tuyển Dụng.',
      lastBoostedAt: user.lastBoostedAt,
      boostExpiresAt: user.boostExpiresAt,
      isBoosted: true,
    };
  }

  /**
   * Lấy trạng thái Đẩy Top hồ sơ hiện tại của ứng viên
   */
  async getBoostStatus(userId: string) {
    const user = await this.userRepo.findOne({ where: { _id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    const isPremium = this.isCandidatePremium(user);
    const isVerified = user.isVerified || false;

    const tier = isPremium ? 'PREMIUM' : isVerified ? 'VERIFIED' : 'FREE';
    const boostLimitText = isPremium
      ? '1 lần / ngày (Ưu tiên Top 1 - 24 giờ)'
      : isVerified
      ? '1 lần / tuần (Hiệu lực 12 giờ)'
      : 'Không khả dụng (Cần xác thực email hoặc mua gói Premium)';

    const now = Date.now();
    const isBoosted = Boolean(
      user.boostExpiresAt && new Date(user.boostExpiresAt).getTime() > now,
    );

    let canBoost = false;
    let remainingCooldownSeconds = 0;
    let remainingCooldownText = '';

    if (isPremium || isVerified) {
      const cooldownMs = isPremium
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

      if (!user.lastBoostedAt) {
        canBoost = true;
      } else {
        const elapsedMs = now - new Date(user.lastBoostedAt).getTime();
        if (elapsedMs >= cooldownMs) {
          canBoost = true;
        } else {
          remainingCooldownSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
          const days = Math.floor(remainingCooldownSeconds / 86400);
          const hours = Math.floor((remainingCooldownSeconds % 86400) / 3600);
          const minutes = Math.floor((remainingCooldownSeconds % 3600) / 60);

          if (days > 0) remainingCooldownText += `${days} ngày `;
          if (hours > 0) remainingCooldownText += `${hours} giờ `;
          remainingCooldownText += `${minutes} phút`;
          remainingCooldownText = remainingCooldownText.trim();
        }
      }
    }

    return {
      tier,
      isVerified,
      isPremium,
      isBoosted,
      canBoost,
      lastBoostedAt: user.lastBoostedAt || null,
      boostExpiresAt: user.boostExpiresAt || null,
      remainingCooldownSeconds,
      remainingCooldownText,
      boostLimitText,
    };
  }

  /**
   * Lấy cài đặt hiển thị và tìm kiếm việc của ứng viên
   */
  async getCandidateSettings(userId: string) {
    const user = await this.userRepo.findOne({ where: { _id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    return {
      isJobSeeking: user.isJobSeeking ?? true,
      isJobRecommendation: user.isJobRecommendation ?? true,
      allowRecruiterSearch: user.allowRecruiterSearch ?? true,
    };
  }

  /**
   * Cập nhật cài đặt hiển thị và tìm kiếm việc của ứng viên
   */
  async updateCandidateSettings(
    userId: string,
    settings: {
      isJobSeeking?: boolean;
      isJobRecommendation?: boolean;
      allowRecruiterSearch?: boolean;
    },
  ) {
    const user = await this.userRepo.findOne({ where: { _id: userId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }

    if (settings.isJobSeeking !== undefined) {
      user.isJobSeeking = settings.isJobSeeking;
    }
    if (settings.isJobRecommendation !== undefined) {
      user.isJobRecommendation = settings.isJobRecommendation;
    }
    if (settings.allowRecruiterSearch !== undefined) {
      user.allowRecruiterSearch = settings.allowRecruiterSearch;
    }

    await this.userRepo.save(user);

    return {
      message: 'Cập nhật cài đặt tìm việc thành công',
      settings: {
        isJobSeeking: user.isJobSeeking,
        isJobRecommendation: user.isJobRecommendation,
        allowRecruiterSearch: user.allowRecruiterSearch,
      },
    };
  }
}
