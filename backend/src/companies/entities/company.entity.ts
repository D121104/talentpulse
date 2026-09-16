import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn('uuid')
  _id: string;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  address: string;

  @Column({ type: 'double precision', nullable: true })
  lat: number;

  @Column({ type: 'double precision', nullable: true })
  lon: number;

  @Index({ spatial: true })
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location: { type: string; coordinates: [number, number] } | null;

  @BeforeInsert()
  @BeforeUpdate()
  syncLocation() {
    if (this.lat != null && this.lon != null && !isNaN(Number(this.lat)) && !isNaN(Number(this.lon))) {
      this.location = {
        type: 'Point',
        coordinates: [Number(this.lon), Number(this.lat)],
      };
    } else {
      this.location = null;
    }
  }

  @Column({ nullable: true })
  website: string;

  @Column({ nullable: true })
  logo: string;

  @Column({ type: 'text', array: true, default: '{}' })
  usersFollow: string[];

  @Column({ nullable: true })
  taxCode: string;

  @Column({ nullable: true })
  scale: string;

  @Column({ type: 'jsonb', default: '[]' })
  pendingHrs: {
    userId: string;
    name: string;
    email: string;
    avatar?: string;
    requestedAt: Date;
  }[];

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isPremium: boolean;

  @Column({ type: 'timestamp', nullable: true })
  premiumExpiresAt: Date;

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
