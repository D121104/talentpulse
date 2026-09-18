import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CreateSubscriberDto } from './dto/create-subscriber.dto';
import { UpdateSubscriberDto } from './dto/update-subscriber.dto';
import { Subscriber } from './entities/subscriber.entity';
import { Skill } from 'src/skills/entities/skill.entity';
import { IUser } from 'src/users/users.interface';

@Injectable()
export class SubscribersService {
  constructor(
    @InjectRepository(Subscriber)
    private readonly subscriberRepo: Repository<Subscriber>,
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
  ) {}

  // Create or retrieve skills from user-suggested names (case-insensitive)
  private async createNewSkills(
    skillNames: string[],
    user: IUser,
  ): Promise<Skill[]> {
    const skills: Skill[] = [];

    for (const name of skillNames) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const normalizedName = trimmed.toUpperCase();

      let existingSkill = await this.skillRepo
        .createQueryBuilder('skill')
        .where('LOWER(skill.name) = LOWER(:name)', { name: trimmed })
        .andWhere('skill.isDeleted = false')
        .getOne();

      if (!existingSkill) {
        try {
          const newSkill = this.skillRepo.create({
            name: normalizedName,
            createdBy: {
              _id: user._id,
              email: user.email,
            },
          });
          existingSkill = await this.skillRepo.save(newSkill);
        } catch {
          // If concurrent insert occurred, load existing skill
          existingSkill = await this.skillRepo
            .createQueryBuilder('skill')
            .where('LOWER(skill.name) = LOWER(:name)', { name: trimmed })
            .andWhere('skill.isDeleted = false')
            .getOne();
        }
      }
      if (existingSkill && !skills.some((s) => s._id === existingSkill._id)) {
        skills.push(existingSkill);
      }
    }

    return skills;
  }

  // Create or update a subscription. Handles both existing and new skill IDs/names.
  async createOrUpdate(createSubscriberDto: CreateSubscriberDto, user: IUser) {
    const skillEntities: Skill[] = [];

    const isUuid = (val: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        val,
      );

    const uuidSkillIds: string[] = [];
    const nameSkillStrings: string[] = [];

    if (createSubscriberDto.skills && createSubscriberDto.skills.length > 0) {
      for (const item of createSubscriberDto.skills) {
        if (isUuid(item)) {
          uuidSkillIds.push(item);
        } else if (typeof item === 'string' && item.trim()) {
          nameSkillStrings.push(item.trim());
        }
      }
    }

    if (uuidSkillIds.length > 0) {
      const foundSkills = await this.skillRepo.find({
        where: { _id: In(uuidSkillIds), isDeleted: false },
      });
      skillEntities.push(...foundSkills);
    }

    const allNewSkillNames = [
      ...nameSkillStrings,
      ...(createSubscriberDto.newSkillNames || []),
    ];

    if (allNewSkillNames.length > 0) {
      const newSkills = await this.createNewSkills(allNewSkillNames, user);
      for (const s of newSkills) {
        if (!skillEntities.some((existing) => existing._id === s._id)) {
          skillEntities.push(s);
        }
      }
    }

    const targetEmail = (createSubscriberDto.email || user.email)
      .trim()
      .toLowerCase();

    // Find existing by userId OR by email
    let existingSubscription = await this.subscriberRepo.findOne({
      where: { userId: user._id, isDeleted: false },
      relations: ['skills'],
    });

    if (!existingSubscription && targetEmail) {
      existingSubscription = await this.subscriberRepo.findOne({
        where: { email: targetEmail, isDeleted: false },
        relations: ['skills'],
      });
    }

    if (existingSubscription) {
      existingSubscription.userId = user._id;
      existingSubscription.skills = skillEntities;
      existingSubscription.email = targetEmail;
      if (createSubscriberDto.isActive !== undefined) {
        existingSubscription.isActive = createSubscriberDto.isActive;
      }
      existingSubscription.updatedBy = {
        _id: user._id,
        email: user.email,
      };

      await this.subscriberRepo.save(existingSubscription);
      return await this.getSubscriberByUserId(user._id, targetEmail);
    }

    const newSubscriber = this.subscriberRepo.create({
      userId: user._id,
      email: targetEmail,
      skills: skillEntities,
      isActive: createSubscriberDto.isActive ?? true,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    await this.subscriberRepo.save(newSubscriber);
    return await this.getSubscriberByUserId(user._id, targetEmail);
  }

  async create(createSubscriberDto: CreateSubscriberDto) {
    let skillEntities: Skill[] = [];

    if (createSubscriberDto.skills && createSubscriberDto.skills.length > 0) {
      skillEntities = await this.skillRepo.find({
        where: { _id: In(createSubscriberDto.skills) },
      });
    }

    const isExist = await this.subscriberRepo.findOne({
      where: { email: createSubscriberDto.email },
      relations: ['skills'],
    });

    if (isExist) {
      isExist.skills = skillEntities;
      await this.subscriberRepo.save(isExist);
      return 'Skills updated successfully';
    }

    if (
      !createSubscriberDto.skills ||
      createSubscriberDto.skills.length === 0
    ) {
      throw new BadRequestException('Skills is required');
    }

    const newSubscriber = this.subscriberRepo.create({
      ...createSubscriberDto,
      skills: skillEntities,
    });

    return await this.subscriberRepo.save(newSubscriber);
  }

  async update(
    id: string,
    updateSubscriberDto: UpdateSubscriberDto,
    user: IUser,
  ) {
    const subscriber = await this.subscriberRepo.findOne({
      where: { _id: id },
      relations: ['skills'],
    });

    if (!subscriber) {
      throw new BadRequestException('Subscriber not found');
    }

    if (updateSubscriberDto.skills) {
      subscriber.skills = await this.skillRepo.find({
        where: { _id: In(updateSubscriberDto.skills) },
      });
    }

    if (updateSubscriberDto.email) {
      subscriber.email = updateSubscriberDto.email;
    }

    if (updateSubscriberDto.isActive !== undefined) {
      subscriber.isActive = updateSubscriberDto.isActive;
    }

    subscriber.updatedBy = {
      _id: user._id,
      email: user.email,
    };

    return await this.subscriberRepo.save(subscriber);
  }

  async toggleActive(id: string, user: IUser) {
    const subscriber = await this.subscriberRepo.findOne({
      where: { _id: id },
    });
    if (!subscriber) {
      throw new BadRequestException('Subscriber not found');
    }

    if (subscriber.userId !== user._id) {
      throw new BadRequestException(
        'You can only toggle your own subscription',
      );
    }

    subscriber.isActive = !subscriber.isActive;
    subscriber.updatedBy = {
      _id: user._id,
      email: user.email,
    };

    return await this.subscriberRepo.save(subscriber);
  }

  async getAll(page: number, limit: number) {
    return await this.subscriberRepo.find({
      where: { isActive: true, isDeleted: false },
      relations: ['skills'],
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async getActiveSubscribersCount() {
    return await this.subscriberRepo.count({
      where: { isActive: true, isDeleted: false },
    });
  }

  async getSubscriberByEmail(email: string) {
    return await this.subscriberRepo.findOne({
      where: { email, isDeleted: false },
      relations: ['skills'],
    });
  }

  async getSubscriberByUserId(userId: string, email?: string) {
    let sub = await this.subscriberRepo.findOne({
      where: { userId, isDeleted: false },
      relations: ['skills'],
    });

    if (!sub && email) {
      sub = await this.subscriberRepo.findOne({
        where: { email: email.trim().toLowerCase(), isDeleted: false },
        relations: ['skills'],
      });
      if (sub && !sub.userId) {
        sub.userId = userId;
        await this.subscriberRepo.save(sub);
      }
    }

    return sub;
  }

  async toggleMyActive(user: IUser) {
    let sub = await this.getSubscriberByUserId(user._id, user.email);
    if (!sub) {
      sub = this.subscriberRepo.create({
        userId: user._id,
        email: user.email.trim().toLowerCase(),
        skills: [],
        isActive: true,
        createdBy: {
          _id: user._id,
          email: user.email,
        },
      });
      return await this.subscriberRepo.save(sub);
    }

    sub.isActive = !sub.isActive;
    sub.updatedBy = {
      _id: user._id,
      email: user.email,
    };

    return await this.subscriberRepo.save(sub);
  }

  async remove(id: string, user: IUser) {
    const subscriber = await this.subscriberRepo.findOne({
      where: { _id: id },
    });
    if (!subscriber) {
      throw new BadRequestException('Subscriber not found');
    }

    await this.subscriberRepo.update(id, {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return await this.subscriberRepo.softDelete(id);
  }

  async count() {
    return await this.subscriberRepo.count({ where: { isDeleted: false } });
  }
}
