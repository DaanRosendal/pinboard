import type { User } from '@acme/shared';

export interface GetMeResponse { user: User }

export interface UpdateMeBody {
  name?: string;
  email?: string;
}

export interface UpdateMeResponse { user: User }
