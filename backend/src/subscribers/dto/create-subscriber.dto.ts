import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsBoolean,
  IsMongoId,
} from 'class-validator';

export class CreateSubscriberDto {
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsArray()
  skills: string[];

  // Skill names that don't exist in the system (user suggested)
  @IsOptional()
  @IsArray()
  newSkillNames?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
