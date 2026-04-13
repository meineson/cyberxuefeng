const DEFAULT_SEARCH_PROVIDER = 'gemini';
const DEFAULT_SKILL_SLUG = 'zhangxuefeng-perspective';
const DEFAULT_MODEL = 'glm-5';
const DEFAULT_AUTH_PASSWORD = 'sbxf2026';
const DEFAULT_MAX_MESSAGE_LENGTH = 300;
const DEFAULT_RATE_LIMIT_MAX = 5;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_MAX_SKILL_FILE_SIZE = 64 * 1024;

export function readEnv(env, key) {
  if (env && Object.prototype.hasOwnProperty.call(env, key) && env[key] !== undefined) {
    return env[key];
  }
  return process.env[key];
}

function readNumberEnv(env, key, fallback) {
  const rawValue = readEnv(env, key);
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return fallback;
  }

  const value = Number(rawValue);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getRuntimeConfig(env = {}) {
  return {
    authPassword: readEnv(env, 'AUTH_PASSWORD') ?? DEFAULT_AUTH_PASSWORD,
    searchProvider: (readEnv(env, 'SEARCH_PROVIDER') || DEFAULT_SEARCH_PROVIDER).trim().toLowerCase(),
    skillSlug: (readEnv(env, 'SKILL_SLUG') || DEFAULT_SKILL_SLUG).trim(),
    model: readEnv(env, 'OPENAI_MODEL') || DEFAULT_MODEL,
    baseUrl: readEnv(env, 'BASE_URL') || readEnv(env, 'OPENAI_BASE_URL') || '',
    apiKey: readEnv(env, 'API_KEY') || readEnv(env, 'OPENAI_API_KEY') || '',
    geminiApiKey: readEnv(env, 'GEMINI_API_KEY') || '',
    geminiModel: readEnv(env, 'GEMINI_MODEL') || '',
    tavilyApiKey: readEnv(env, 'TAVILY_API_KEY') || '',
    maxMessageLength: readNumberEnv(env, 'MAX_MESSAGE_LENGTH', DEFAULT_MAX_MESSAGE_LENGTH),
    rateLimitMax: readNumberEnv(env, 'RATE_LIMIT_MAX', DEFAULT_RATE_LIMIT_MAX),
    rateLimitWindowMs: readNumberEnv(env, 'RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS),
    maxSkillFileSize: readNumberEnv(env, 'MAX_SKILL_FILE_SIZE', DEFAULT_MAX_SKILL_FILE_SIZE),
  };
}

export function getAppKv(env) {
  const kv = env?.APP_KV;
  if (!kv || typeof kv.get !== 'function' || typeof kv.put !== 'function') {
    throw new Error('APP_KV binding is required');
  }
  return kv;
}

export function getSkillPrefix(env) {
  return `skill:${getRuntimeConfig(env).skillSlug}`;
}

export function getSkillManifestKey(env) {
  return `${getSkillPrefix(env)}:manifest`;
}

export function getSkillFileKey(env, relativePath) {
  return `${getSkillPrefix(env)}:file:${relativePath}`;
}

export function getRateLimitKey(userKey) {
  return `rate-limit:${encodeURIComponent(userKey)}`;
}
