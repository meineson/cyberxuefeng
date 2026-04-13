import { createHash, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto';
import { getRuntimeConfig } from './config.js';

function timingSafeStringEqual(a, b) {
  const aHash = createHash('sha256').update(a).digest();
  const bHash = createHash('sha256').update(b).digest();
  return nodeTimingSafeEqual(aHash, bHash);
}

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

  if (authPassword && timingSafeStringEqual(String(password), authPassword)) {
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

