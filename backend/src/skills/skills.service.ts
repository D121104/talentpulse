import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { Skill } from './entities/skill.entity';
import { IUser } from 'src/users/users.interface';
import aqp from 'api-query-params';

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
  ) {}

  async create(createSkillDto: CreateSkillDto, user: IUser) {
    const normalizedName = createSkillDto.name.toUpperCase();
    const isExist = await this.skillRepo.findOne({
      where: { name: normalizedName },
    });
    if (isExist) {
      throw new BadRequestException('Skill already exists');
    }

    const newSkill = this.skillRepo.create({
      ...createSkillDto,
      name: normalizedName,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    return await this.skillRepo.save(newSkill);
  }

  async findAll(qs: any) {
    try {
      const { filter, sort } = aqp(qs);
      delete filter.current;
      delete filter.pageSize;

      const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
      const current = qs.current ? parseInt(qs.current) : 1;
      const skip = (current - 1) * limit;

      const queryBuilder = this.skillRepo
        .createQueryBuilder('skill')
        .where('skill.isDeleted = :isDeleted', { isDeleted: false });

      if (filter.name) {
        queryBuilder.andWhere('skill.name ILIKE :name', {
          name: `%${filter.name}%`,
        });
      }

      if (sort) {
        for (const [key, value] of Object.entries(sort)) {
          queryBuilder.addOrderBy(
            `skill.${key}`,
            (value as number) === 1 ? 'ASC' : 'DESC',
          );
        }
      } else {
        queryBuilder.orderBy('skill.createdAt', 'DESC');
      }

      const [skills, totalRecord] = await queryBuilder
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPage = Math.ceil(totalRecord / limit);

      return {
        meta: {
          current,
          pageSize: limit,
          pages: totalPage,
          total: totalRecord,
        },
        result: skills,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  async findOne(id: string) {
    const skill = await this.skillRepo.findOne({
      where: { _id: id, isDeleted: false },
    });
    if (!skill) {
      throw new BadRequestException('Skill not found');
    }
    return skill;
  }

  async update(id: string, updateSkillDto: UpdateSkillDto, user: IUser) {
    const isExist = await this.skillRepo.findOne({ where: { _id: id } });
    if (!isExist) {
      throw new BadRequestException('Skill not found');
    }

    if (updateSkillDto.name) {
      updateSkillDto.name = updateSkillDto.name.toUpperCase();
    }

    return await this.skillRepo.update(id, {
      ...updateSkillDto,
      updatedBy: {
        _id: user._id,
        email: user.email,
      },
    });
  }

  async remove(id: string) {
    const isExist = await this.skillRepo.findOne({ where: { _id: id } });
    if (!isExist) {
      throw new BadRequestException('Skill not found');
    }

    await this.skillRepo.update(id, { isDeleted: true, deletedAt: new Date() });
    return await this.skillRepo.softDelete(id);
  }
}
