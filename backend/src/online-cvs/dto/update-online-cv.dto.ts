import { PartialType } from '@nestjs/swagger';
import { CreateOnlineCVDto } from './create-online-cv.dto';

export class UpdateOnlineCVDto extends PartialType(CreateOnlineCVDto) {}
