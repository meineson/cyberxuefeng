/**
 * 张雪峰视角技能加载器
 * 从 SKILL.md 加载并解析技能定义
 */
import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname, resolve, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 技能路径：优先使用 .env 配置，否则使用默认路径
const DEFAULT_SKILL_DIR = join(process.env.HOME, '.agents/skills/zhangxuefeng-perspective');
const SKILL_DIR = process.env.SKILL_PATH || DEFAULT_SKILL_DIR;
const SKILL_PATH = join(SKILL_DIR, 'SKILL.md');
const MAX_SKILL_FILE_SIZE = 64 * 1024;

let skillCache = null;

/**
 * 解析 SKILL.md 的 YAML frontmatter
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid SKILL.md format: missing frontmatter');
  }
  
  const yamlStr = match[1];
  const body = match[2];
  
  // 简单解析 YAML frontmatter
  const yaml = {};
  const lines = yamlStr.split('\n');
  let currentKey = null;
  let currentValue = [];
  
  for (const line of lines) {
    // 新的 key
    if (line.match(/^(\w+):\s*(.*)$/)) {
      // 保存上一个 key
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
    }
    // 多行值
    else if (line.startsWith('  ') || line.startsWith('\t')) {
      currentValue.push(line.replace(/^[\t ]+/, ''));
    }
  }
  
  // 保存最后一个 key
  if (currentKey && currentValue.length > 0) {
    yaml[currentKey] = currentValue.join('\n').trim();
  }
  
  return { yaml, body };
}

/**
 * 提取技能核心内容用于 system prompt
 */
function extractSystemPrompt(body, skillDir) {
  // 直接返回 SKILL.md 内容，让 LLM 理解全部规则
  return [
    `当前技能目录：${skillDir}`,
    '如需查看技能目录下的补充资料，先调用 list_skill_files 查看目录中的真实文件名，再调用 read_skill_file 读取相对路径文件。',
    '禁止猜测文件名。尤其是 references/research 目录，必须先列目录再读取文件。',
    '',
    body.trim(),
  ].join('\n');
}

function resolveSkillFilePath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('relativePath is required');
  }

  const trimmedPath = relativePath.trim();
  if (!trimmedPath) {
    throw new Error('relativePath is required');
  }

  const fullPath = resolve(SKILL_DIR, trimmedPath);
  const relPath = relative(SKILL_DIR, fullPath);
  if (relPath.startsWith('..') || relPath.includes(`..${sep}`)) {
    throw new Error('只允许读取当前技能目录下的文件');
  }

  return fullPath;
}

export async function readSkillFile(relativePath) {
  const filePath = resolveSkillFilePath(relativePath);
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    throw new Error('目标路径不是文件');
  }

  if (fileStat.size > MAX_SKILL_FILE_SIZE) {
    throw new Error(`文件过大，当前仅支持读取 ${MAX_SKILL_FILE_SIZE} 字节以内的文件`);
  }

  return readFile(filePath, 'utf-8');
}

export async function listSkillFiles(relativeDir = '.') {
  const dirPath = resolveSkillFilePath(relativeDir);
  const dirStat = await stat(dirPath);

  if (!dirStat.isDirectory()) {
    throw new Error('目标路径不是目录');
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      path: relativeDir === '.' ? entry.name : `${relativeDir}/${entry.name}`,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }
      return a.name.localeCompare(b.name, 'zh-CN');
    });
}

/**
 * 加载技能定义
 */
export async function loadSkill() {
  if (skillCache) {
    return skillCache;
  }
  
  const content = await readFile(SKILL_PATH, 'utf-8');
  const { yaml, body } = parseFrontmatter(content);
  
  skillCache = {
    name: yaml.name || 'zhangxuefeng-perspective',
    description: yaml.description || '张雪峰的思维框架与表达方式',
    systemPrompt: extractSystemPrompt(body, SKILL_DIR),
    rawContent: content,
    skillDir: SKILL_DIR,
  };
  
  return skillCache;
}

/**
 * 清除缓存（用于热重载）
 */
export function clearCache() {
  skillCache = null;
}

export default loadSkill;
