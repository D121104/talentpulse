import {
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsArray,
  IsString,
  IsEnum,
} from 'class-validator';

export class CreateUserCVDto {
  @IsNotEmpty({ message: 'Vui lòng tải CV lên!' })
  url: string;

  @IsOptional()
  title?: string;

  @IsOptional()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsUUID('4')
  onlineCvId?: string; // Reference to online CV if created via online builder

  @IsOptional()
  @IsEnum(['pdf', 'doc', 'docx', 'online'])
  fileType?: string;

  @IsOptional()
  @IsString()
  parsedText?: string;

  @IsOptional()
  @IsArray()
  skills?: string[];

  @IsOptional()
  @IsArray()
  education?: string[];

  @IsOptional()
  @IsArray()
  experience?: string[];

  @IsOptional()
  @IsArray()
  certificates?: string[];

  @IsOptional()
  @IsBoolean()
  isSearchable?: boolean;
}
