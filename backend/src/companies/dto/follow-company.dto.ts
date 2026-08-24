import { IsNotEmpty } from 'class-validator';

export class FollowCompanyDto {
  @IsNotEmpty({ message: 'Company ID is required' })
  companyId: string;
}
