import { PartialType } from '@nestjs/mapped-types';
import { CreateUserCVDto } from './create-usercv.dto';

export class UpdateUserCVDto extends PartialType(CreateUserCVDto) {}
