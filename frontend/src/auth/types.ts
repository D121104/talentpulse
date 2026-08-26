export type UserRole = 'ADMIN' | 'HR' | 'USER';

export interface AuthUser {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  age?: number;
  gender?: string;
  address?: string;
  avatar?: string;
  isApproved?: boolean;
  isPremium?: boolean;
  premiumPlan?: string;
  premiumExpiresAt?: string;
  isVerified?: boolean;
  verifiedAt?: string;
  lastBoostedAt?: string;
  boostExpiresAt?: string;
  company?: {
    _id: string;
    name: string;
    isActive?: boolean;
  };
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface RegisterHrInput extends RegisterInput {
  companyName?: string;
  taxCode?: string;
  companyScale?: string;
}
