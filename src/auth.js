import { getRuntimeConfig } from './config.js';

export function getAuthStatus(env) {
  const { authPassword } = getRuntimeConfig(env);
  return {
    required: Boolean(authPassword),
    message: authPassword ? 'Password authentication required' : 'No authentication required',
  };
}

export function verifyPassword(env, password) {
  const { authPassword } = getRuntimeConfig(env);

  if (!password) {
    return {
      ok: false,
      status: 400,
      body: { error: 'password is required' },
    };
  }

  if (password === authPassword) {
    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        message: 'Authentication successful',
      },
    };
  }

  return {
    ok: false,
    status: 401,
    body: {
      success: false,
      error: 'Invalid password',
    },
  };
}
