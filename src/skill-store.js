import {
  getAppKv,
  getRuntimeConfig,
  getSkillFileKey,
  getSkillManifestKey,
} from './config.js';

const manifestCache = new Map();
const skillCache = new Map();

function getCacheKey(env) {
  return getRuntimeConfig(env).skillSlug;
}

export function normalizeRelativePath(relativePath, { allowCurrent = false } = {}) {
  if (typeof relativePath !== 'string') {
    throw new Error('relativePath is required');
  }

  const trimmedPath = relativePath.trim();
  if (!trimmedPath) {
    throw new Error('relativePath is required');
  }

  const normalizedSegments = [];
  for (const segment of trimmedPath.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      throw new Error('只允许读取当前技能目录下的文件');
    }

    normalizedSegments.push(segment);
  }

  if (normalizedSegments.length === 0) {
    if (allowCurrent) {
      return '.';
    }
    throw new Error('relativePath is required');
  }

  return normalizedSegments.join('/');
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }

  const yamlStr = match[1];
  const body = match[2];
  const yaml = {};
  const lines = yamlStr.split('\n');
  let currentKey = null;
  let currentValue = [];

  for (const line of lines) {
    if (line.match(/^(\w+):\s*(.*)$/)) {
      if (currentKey) {
        yaml[currentKey] = currentValue.length > 0
          ? currentValue.join('\n').trim()
          : yaml[currentKey];
        currentValue = [];
      }

      const [, key, value] = line.match(/^(\w+):\s*(.*)$/);
      currentKey = key;
      if (value) {
        yaml[key] = value;
      }
      continue;
    }

    if (line.startsWith('  ') || line.startsWith('\t')) {
      currentValue.push(line.replace(/^[\t ]+/, ''));
    }
  }

  if (currentKey && currentValue.length > 0) {
    yaml[currentKey] = currentValue.join('\n').trim();
  }

  return { yaml, body };
}

function extractSystemPrompt(body, skillDirLabel) {
  return [
    `当前技能目录：${skillDirLabel}`,
    '如需查看技能目录下的补充资料，先调用 list_skill_files 查看目录中的真实文件名，再调用 read_skill_file 读取相对路径文件。',
    '禁止猜测文件名。尤其是 references/research 目录，必须先列目录再读取文件。',
    '',
    body.trim(),
  ].join('\n');
}

async function loadManifest(env) {
  const cacheKey = getCacheKey(env);
  if (manifestCache.has(cacheKey)) {
    return manifestCache.get(cacheKey);
  }

  const kv = getAppKv(env);
  const manifest = await kv.get(getSkillManifestKey(env), 'json');
  if (!manifest) {
    throw new Error('Skill manifest not found in APP_KV');
  }

  manifestCache.set(cacheKey, manifest);
  return manifest;
}

export async function listSkillFiles(env, relativeDir = '.') {
  const normalizedDir = normalizeRelativePath(relativeDir, { allowCurrent: true });
  const manifest = await loadManifest(env);
  const entries = manifest.directories?.[normalizedDir];

  if (!Array.isArray(entries)) {
    throw new Error('目标路径不是目录');
  }

  return entries;
}

export async function readSkillFile(env, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const manifest = await loadManifest(env);
  const metadata = manifest.files?.[normalizedPath];

  if (!metadata) {
    throw new Error('目标路径不是文件');
  }

  if (metadata.text === false) {
    throw new Error('当前仅支持读取文本技能文件');
  }

  const { maxSkillFileSize } = getRuntimeConfig(env);
  if (metadata.size > maxSkillFileSize) {
    throw new Error(`文件过大，当前仅支持读取 ${maxSkillFileSize} 字节以内的文件`);
  }

  const kv = getAppKv(env);
  const content = await kv.get(getSkillFileKey(env, normalizedPath));
  if (content === null) {
    throw new Error('技能文件内容不存在');
  }

  return content;
}

export async function loadSkill(env) {
  const cacheKey = getCacheKey(env);
  if (skillCache.has(cacheKey)) {
    return skillCache.get(cacheKey);
  }

  const manifest = await loadManifest(env);
  const content = await readSkillFile(env, 'SKILL.md');
  const { yaml, body } = parseFrontmatter(content);
  const skill = {
    name: yaml.name || getRuntimeConfig(env).skillSlug,
    description: yaml.description || '张雪峰的思维框架与表达方式',
    systemPrompt: extractSystemPrompt(body, manifest.skillDirLabel || `skills/${getRuntimeConfig(env).skillSlug}`),
    rawContent: content,
    skillDir: manifest.skillDirLabel || `skills/${getRuntimeConfig(env).skillSlug}`,
  };

  skillCache.set(cacheKey, skill);
  return skill;
}

export function clearSkillCache() {
  manifestCache.clear();
  skillCache.clear();
}
