import { IsEnum, IsNotEmpty, IsUUID } from 'class-validator';
import { CandidateAccessType } from '../entities/candidate-access.entity';

export class UnlockCandidateDto {
  @IsNotEmpty({ message: 'cvType không được để trống' })
  @IsEnum(CandidateAccessType, { message: 'cvType phải là ONLINE_CV hoặc UPLOADED_CV' })
  cvType: CandidateAccessType;

  @IsNotEmpty({ message: 'cvId không được để trống' })
  @IsUUID('all', { message: 'cvId phải là UUID hợp lệ' })
  cvId: string;
}
