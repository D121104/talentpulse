export interface IUser {
  _id: string;
  email: string;
  name: string;
  role: string; // Role enum value: 'ADMIN' | 'HR' | 'USER'
  age: number;
  gender?: string;
  address?: string;
  company?: {
    _id: string;
    name: string;
    isActive?: boolean;
  };
  avatar?: string;
  isApproved?: boolean;
}
