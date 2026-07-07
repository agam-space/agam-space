import {
  LoginResponse,
  LoginResponseSchema,
  User,
  UserSchema,
  ChangeLoginPasswordRequest,
} from '@agam-space/shared-types';
import { ApiClientError } from './api-client';
import { ClientRegistry } from '../registry/client.registry';
import { AlreadyExistsError } from '../errors';

export async function loginWithPassword(
  username: string,
  password: string
): Promise<LoginResponse> {
  try {
    return await ClientRegistry.getApiClient().fetchAndParse(
      '/v1/auth/login/password',
      LoginResponseSchema,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }
    );
  } catch (e) {
    if (e instanceof ApiClientError) {
      if (e.status === 401) {
        throw new Error('Invalid credentials', { cause: e });
      }
    }
    throw new Error(`Login failed`, { cause: e });
  }
}

export async function logoutApi() {
  await ClientRegistry.getApiClient().fetchRaw('/v1/auth/logout', { method: 'POST' });
}

export async function signupApi(
  username: string,
  email: string,
  password: string,
  inviteCode?: string
) {
  try {
    await ClientRegistry.getApiClient().fetchAndParse(`/v1/auth/signup`, UserSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email: email || undefined,
        password,
        inviteCode: inviteCode || undefined,
      }),
    });
  } catch (e) {
    if (e instanceof ApiClientError) {
      if (e.status === 409) {
        throw new AlreadyExistsError('Username or email already exists', 'USER_ALREADY_EXISTS');
      }
    }
    throw new Error(`Signup failed: ${e}`, { cause: e });
  }
}

export async function fetchCurrentUserApi(): Promise<User> {
  return await ClientRegistry.getApiClient().fetchAndParse('/v1/me', UserSchema);
}

export async function changeLoginPasswordApi(request: ChangeLoginPasswordRequest): Promise<void> {
  try {
    await ClientRegistry.getApiClient().fetchRaw('/v1/auth/change-login-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch (e) {
    if (e instanceof ApiClientError) {
      if (e.status === 401) {
        throw new Error('Current password is incorrect', { cause: e });
      }
      if (e.status === 403) {
        throw new Error('SSO users cannot change login password', { cause: e });
      }
    }
    throw new Error('Failed to change password', { cause: e });
  }
}
