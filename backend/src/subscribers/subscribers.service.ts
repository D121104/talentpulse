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

  // Create new skills from user-suggested names
  private async createNewSkills(
    skillNames: string[],
    user: IUser,
  ): Promise<Skill[]> {
    const skills: Skill[] = [];

    for (const name of skillNames) {
      const normalizedName = name.trim().toUpperCase();
      if (!normalizedName) continue;

      let existingSkill = await this.skillRepo.findOne({
        where: { name: normalizedName },
      });

      if (!existingSkill) {
        const newSkill = this.skillRepo.create({
          name: normalizedName,
          createdBy: {
            _id: user._id,
            email: user.email,
          },
        });
        existingSkill = await this.skillRepo.save(newSkill);
      }
      skills.push(existingSkill);
    }

    return skills;
  }

  // Create or update a subscription. Handles both existing and new skill IDs.
  async createOrUpdate(createSubscriberDto: CreateSubscriberDto, user: IUser) {
    let skillEntities: Skill[] = [];

    if (createSubscriberDto.skills && createSubscriberDto.skills.length > 0) {
      skillEntities = await this.skillRepo.find({
        where: { _id: In(createSubscriberDto.skills) },
      });
    }

    if (
      createSubscriberDto.newSkillNames &&
      createSubscriberDto.newSkillNames.length > 0
    ) {
      const newSkills = await this.createNewSkills(
        createSubscriberDto.newSkillNames,
        user,
      );
      skillEntities = [...skillEntities, ...newSkills];
    }

    const existingSubscription = await this.subscriberRepo.findOne({
      where: { userId: user._id, isDeleted: false },
      relations: ['skills'],
    });

    if (existingSubscription) {
      existingSubscription.skills = skillEntities;
      existingSubscription.email = createSubscriberDto.email || user.email;
      if (createSubscriberDto.isActive !== undefined) {
        existingSubscription.isActive = createSubscriberDto.isActive;
      }
      existingSubscription.updatedBy = {
        _id: user._id,
        email: user.email,
      };

      await this.subscriberRepo.save(existingSubscription);
      return await this.getSubscriberByUserId(user._id);
    }

    const newSubscriber = this.subscriberRepo.create({
      userId: user._id,
      email: createSubscriberDto.email || user.email,
      skills: skillEntities,
      isActive: createSubscriberDto.isActive ?? true,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return await this.subscriberRepo.save(newSubscriber);
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

  async getSubscriberByUserId(userId: string) {
    return await this.subscriberRepo.findOne({
      where: { userId, isDeleted: false },
      relations: ['skills'],
    });
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
