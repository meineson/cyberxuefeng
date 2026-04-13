import { getAppKv, getRateLimitKey, getRuntimeConfig } from './config.js';

function getClientIp(request) {
  const direct = request.headers.get('cf-connecting-ip');
  if (direct) {
    return direct;
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return 'unknown';
}

export function getUserKey(request) {
  const ip = getClientIp(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return `${ip}:${userAgent.slice(0, 50)}`;
}

function getRateLimitTtl(windowMs) {
  return Math.ceil(windowMs / 1000) + 60;
}

export function validateInputLength(body, env) {
  if (!body?.message || typeof body.message !== 'string') {
    return null;
  }

  const { maxMessageLength } = getRuntimeConfig(env);
  if (body.message.length <= maxMessageLength) {
    return null;
  }

  return {
    error: `输入过长，最多${maxMessageLength}字`,
    currentLength: body.message.length,
    maxLength: maxMessageLength,
  };
}

export async function checkRateLimit(request, env) {
  const kv = getAppKv(env);
  const { rateLimitMax, rateLimitWindowMs } = getRuntimeConfig(env);
  const key = getRateLimitKey(getUserKey(request));
  const now = Date.now();
  const existing = await kv.get(key, 'json');

  if (!existing || now - existing.startTime > rateLimitWindowMs) {
    await kv.put(key, JSON.stringify({ startTime: now, count: 1 }), {
      expirationTtl: getRateLimitTtl(rateLimitWindowMs),
    });
    return {
      allowed: true,
      remaining: rateLimitMax - 1,
      limit: rateLimitMax,
      currentCount: 1,
    };
  }

  if (existing.count >= rateLimitMax) {
    const retryAfter = Math.max(
      1,
      Math.ceil((rateLimitWindowMs - (now - existing.startTime)) / 1000),
    );

    return {
      allowed: false,
      remaining: 0,
      limit: rateLimitMax,
      currentCount: existing.count,
      retryAfter,
    };
  }

  const nextCount = existing.count + 1;
  await kv.put(key, JSON.stringify({ ...existing, count: nextCount }), {
    expirationTtl: getRateLimitTtl(rateLimitWindowMs),
  });

  return {
    allowed: true,
    remaining: rateLimitMax - nextCount,
    limit: rateLimitMax,
    currentCount: nextCount,
  };
}

export async function getRateLimitStatus(request, env) {
  const kv = getAppKv(env);
  const { maxMessageLength, rateLimitMax, rateLimitWindowMs } = getRuntimeConfig(env);
  const key = getRateLimitKey(getUserKey(request));
  const now = Date.now();
  const record = await kv.get(key, 'json');
  const withinWindow = record && now - record.startTime <= rateLimitWindowMs;
  const currentCount = withinWindow ? record.count : 0;

  return {
    maxLength: maxMessageLength,
    rateLimit: {
      limit: rateLimitMax,
      window: '1分钟',
      remaining: Math.max(0, rateLimitMax - currentCount),
      currentCount,
    },
  };
}
