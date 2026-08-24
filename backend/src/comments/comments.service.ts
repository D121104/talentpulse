import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './entities/comment.entity';
import { IUser } from 'src/users/users.interface';
import aqp from 'api-query-params';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
  ) {}

  // Create a new comment (root or reply). For replies, shifts Nested Set left/right values.
  async create(createCommentDto: CreateCommentDto, user: IUser) {
    const { companyId, content, parentId } = createCommentDto;

    let rightValue: number;

    // Root comment: set left/right to max+1, max+2
    if (!parentId) {
      const maxRightComment = await this.commentRepo
        .createQueryBuilder('comment')
        .where('comment.companyId = :companyId', { companyId })
        .orderBy('comment.right', 'DESC')
        .getOne();

      if (maxRightComment) {
        rightValue = maxRightComment.right + 1;
      } else {
        rightValue = 1;
      }
    } else {
      // Reply: shift all nodes with right >= parent.right by +2, then insert
      const parentComment = await this.commentRepo.findOne({
        where: { _id: parentId },
      });
      if (!parentComment) {
        throw new BadRequestException('Parent comment not found');
      }
      rightValue = parentComment.right;

      await this.commentRepo
        .createQueryBuilder()
        .update(Comment)
        .set({ right: () => '"right" + 2' })
        .where('companyId = :companyId AND "right" >= :rightValue', {
          companyId,
          rightValue,
        })
        .execute();

      await this.commentRepo
        .createQueryBuilder()
        .update(Comment)
        .set({ left: () => '"left" + 2' })
        .where('companyId = :companyId AND "left" > :rightValue', {
          companyId,
          rightValue,
        })
        .execute();
    }

    const comment = this.commentRepo.create({
      companyId,
      content,
      userId: user._id,
      parentId: parentId || undefined,
      left: rightValue,
      right: rightValue + 1,
      createdBy: {
        _id: user._id,
        email: user.email,
      },
    });

    const savedComment = await this.commentRepo.save(comment);

    return await this.commentRepo.findOne({
      where: { _id: savedComment._id },
      relations: ['user', 'company'],
    });
  }

  // Get all comments with pagination
  async findAll(qs: any) {
    try {
      const { filter, sort } = aqp(qs);
      delete filter.current;
      delete filter.pageSize;

      const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
      const current = qs.current ? parseInt(qs.current) : 1;
      const skip = (current - 1) * limit;

      const queryBuilder = this.commentRepo
        .createQueryBuilder('comment')
        .leftJoinAndSelect('comment.user', 'user')
        .leftJoinAndSelect('comment.company', 'company')
        .where('comment.isDeleted = :isDeleted', { isDeleted: false });

      if (filter.companyId) {
        queryBuilder.andWhere('comment.companyId = :companyId', {
          companyId: filter.companyId,
        });
      }

      if (sort) {
        for (const [key, value] of Object.entries(sort)) {
          queryBuilder.addOrderBy(
            `comment.${key}`,
            (value as number) === 1 ? 'ASC' : 'DESC',
          );
        }
      } else {
        queryBuilder.orderBy('comment.createdAt', 'DESC');
      }

      const [comments, totalRecord] = await queryBuilder
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
        result: comments,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Get direct child replies of a parent comment, with pagination
  async findByParent(parentId: string, qs: any) {
    try {
      const { sort } = aqp(qs);
      const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
      const current = qs.current ? parseInt(qs.current) : 1;
      const skip = (current - 1) * limit;

      const queryBuilder = this.commentRepo
        .createQueryBuilder('comment')
        .leftJoinAndSelect('comment.user', 'user')
        .leftJoinAndSelect('comment.company', 'company')
        .where('comment.parentId = :parentId', { parentId })
        .andWhere('comment.isDeleted = :isDeleted', { isDeleted: false });

      if (sort) {
        for (const [key, value] of Object.entries(sort)) {
          queryBuilder.addOrderBy(
            `comment.${key}`,
            (value as number) === 1 ? 'ASC' : 'DESC',
          );
        }
      } else {
        queryBuilder.orderBy('comment.left', 'ASC');
      }

      const [comments, totalRecord] = await queryBuilder
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
        result: comments,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Get root-level comments for a company (no parentId), with pagination
  async findByCompany(companyId: string, qs: any) {
    try {
      const { sort } = aqp(qs);
      const limit = qs.pageSize ? parseInt(qs.pageSize) : 10;
      const current = qs.current ? parseInt(qs.current) : 1;
      const skip = (current - 1) * limit;

      const queryBuilder = this.commentRepo
        .createQueryBuilder('comment')
        .leftJoinAndSelect('comment.user', 'user')
        .where('comment.companyId = :companyId', { companyId })
        .andWhere('comment.parentId IS NULL')
        .andWhere('comment.isDeleted = :isDeleted', { isDeleted: false });

      if (sort) {
        for (const [key, value] of Object.entries(sort)) {
          queryBuilder.addOrderBy(
            `comment.${key}`,
            (value as number) === 1 ? 'ASC' : 'DESC',
          );
        }
      } else {
        queryBuilder.orderBy('comment.left', 'ASC');
      }

      const [comments, totalRecord] = await queryBuilder
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
        result: comments,
      };
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  // Delete a comment and all its nested children using Nested Set width calculation
  async remove(id: string, user: IUser) {
    const comment = await this.commentRepo.findOne({
      where: { _id: id, isDeleted: false },
    });

    if (!comment) {
      throw new BadRequestException('Comment not found');
    }

    if (comment.userId !== user._id) {
      throw new BadRequestException(
        'You are not allowed to delete this comment',
      );
    }

    const leftValue = comment.left;
    const rightValue = comment.right;
    const width = rightValue - leftValue + 1;

    // Delete all nodes within the left-right range
    await this.commentRepo
      .createQueryBuilder()
      .delete()
      .from(Comment)
      .where(
        'companyId = :companyId AND "left" >= :leftValue AND "right" <= :rightValue',
        {
          companyId: comment.companyId,
          leftValue,
          rightValue,
        },
      )
      .execute();

    // Shift left/right values of remaining nodes
    await this.commentRepo
      .createQueryBuilder()
      .update(Comment)
      .set({ left: () => `"left" - ${width}` })
      .where('companyId = :companyId AND "left" > :rightValue', {
        companyId: comment.companyId,
        rightValue,
      })
      .execute();

    await this.commentRepo
      .createQueryBuilder()
      .update(Comment)
      .set({ right: () => `"right" - ${width}` })
      .where('companyId = :companyId AND "right" > :rightValue', {
        companyId: comment.companyId,
        rightValue,
      })
      .execute();

    return comment;
  }
}
