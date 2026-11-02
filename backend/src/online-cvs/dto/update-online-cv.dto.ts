import { PartialType } from '@nestjs/swagger';
import { CreateOnlineCVDto } from './create-online-cv.dto';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateOnlineCVDto extends PartialType(CreateOnlineCVDto) {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedContentVersion: number;
}
