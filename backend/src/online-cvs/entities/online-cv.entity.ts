import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

export class EducationEntry {
  schoolName: string;
  major: string;
  startDate: string;
  endDate: string;
  description: string;
}

export class WorkExperienceEntry {
  companyName: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
}

export class SkillEntry {
  name: string;
  description: string;
}

export class ActivityEntry {
  organizationName: string;
  position: string;
  startDate: string;
  endDate: string;
  description: string;
}

export class CertificateEntry {
  name: string;
  date: string;
}

export class AwardEntry {
  name: string;
  date: string;
}

@Entity('online_cvs')
export class OnlineCV {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ enum: ['template1', 'template2'] })
  templateType: string;

  @Column()
  fullName: string;

  @Column({ nullable: true })
  position: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  link: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  avatar: string;

  @Column({ type: 'text', nullable: true })
  careerObjective: string;

  @Column({ type: 'jsonb', default: '[]' })
  education: EducationEntry[];

  @Column({ type: 'jsonb', default: '[]' })
  workExperience: WorkExperienceEntry[];

  @Column({ type: 'jsonb', default: '[]' })
  skills: SkillEntry[];

  @Column({ type: 'jsonb', default: '[]' })
  activities: ActivityEntry[];

  @Column({ type: 'jsonb', default: '[]' })
  certificates: CertificateEntry[];

  @Column({ type: 'jsonb', default: '[]' })
  awards: AwardEntry[];

  @Column({
    type: 'jsonb',
    default: '["objective", "education", "experience", "skills", "activities", "certificates", "awards"]',
  })
  sectionOrder: string[];

  @Column({ nullable: true })
  fontFamily: string;

  @Column({ nullable: true })
  themeColor: string;

  @Column({ nullable: true })
  fontSize: string;

  @Column({ type: 'jsonb', nullable: true })
  customFormatting: any;

  @Column({ type: 'text', nullable: true })
  htmlContent: string;

  @Column({ nullable: true })
  pdfUrl: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ default: true })
  isSearchable: boolean;

  @Column({ default: false })
  isPrimary: boolean;

  @Column({ default: false })
  isDeleted: boolean;

  @Column({ type: 'jsonb', nullable: true })
  createdBy: {
    _id: string;
    email: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  updatedBy: {
    _id: string;
    email: string;
  };

  @Column({ type: 'jsonb', nullable: true })
  deletedBy: {
    _id: string;
    email: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date;
}
