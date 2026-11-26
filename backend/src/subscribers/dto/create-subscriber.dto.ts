import {
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsBoolean,
  IsUUID,
} from 'class-validator';

export class CreateSubscriberDto {
  @IsOptional()
  @IsUUID('4')
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
