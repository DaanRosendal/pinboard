import type { User } from '@acme/shared';

export interface LoginBody { email: string; password: string }
export interface LoginResponse { user: User; token: string }

export interface RegisterBody { email: string; password: string; name: string }
export interface RegisterResponse { user: User; token: string }
