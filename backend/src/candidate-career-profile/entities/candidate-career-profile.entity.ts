import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

export class CandidateCareerContact {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  link: string | null;
  address: string | null;
  avatar: string | null;
}

export class CandidateCareerExperience {
  companyName: string | null;
  position: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export class CandidateCareerEducation {
  schoolName: string | null;
  degree: string | null;
  major: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export class CandidateCareerProject {
  projectName: string | null;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  technologies: string[];
}

export class CandidateCareerSkill {
  name: string | null;
  level: string | null;
  description: string | null;
}

export class CandidateCareerActivity {
  organizationName: string | null;
  position: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
}

export class CandidateCareerCertificate {
  name: string | null;
  issuer: string | null;
  date: string | null;
  credentialUrl: string | null;
}

export class CandidateCareerAward {
  name: string | null;
  issuer: string | null;
  date: string | null;
  description: string | null;
}

@Entity('candidate_career_profiles')
export class CandidateCareerProfile {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'jsonb', default: '{}' })
  contact: CandidateCareerContact;

  @Column({ type: 'varchar', length: 500, nullable: true })
  headline: string | null;

  @Column({ type: 'text', nullable: true })
  objective: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  experience: CandidateCareerExperience[];

  @Column({ type: 'jsonb', default: '[]' })
  education: CandidateCareerEducation[];

  @Column({ type: 'jsonb', default: '[]' })
  projects: CandidateCareerProject[];

  @Column({ type: 'jsonb', default: '[]' })
  certificates: CandidateCareerCertificate[];

  @Column({ type: 'jsonb', default: '[]' })
  skills: CandidateCareerSkill[];

  @Column({ type: 'jsonb', default: '[]' })
  activities: CandidateCareerActivity[];

  @Column({ type: 'jsonb', default: '[]' })
  awards: CandidateCareerAward[];

  @Column({ type: 'integer', default: 1 })
  contentVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
