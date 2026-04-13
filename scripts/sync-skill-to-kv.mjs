import { mkdtemp, readdir, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join, relative, resolve } from 'path';
import { spawn } from 'child_process';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const args = new Set(process.argv.slice(2));
const skillSlug = process.env.SKILL_SLUG || 'zhangxuefeng-perspective';
const binding = process.env.KV_BINDING || 'APP_KV';
const skillRoot = resolve(projectRoot, 'skills', skillSlug);

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.csv', '.js', '.mjs', '.html', '.css', '.svg',
]);
const TEXT_FILENAMES = new Set(['LICENSE', 'README']);

function isTextFile(filePath) {
  const lowerName = basename(filePath).toUpperCase();
  if (TEXT_FILENAMES.has(lowerName)) {
    return true;
  }

  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

function normalizeRelativePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function getFileKey(relativePath) {
  return `skill:${skillSlug}:file:${relativePath}`;
}

function runWrangler(commandArgs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('npx', ['wrangler', ...commandArgs], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`wrangler ${commandArgs.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function walkDirectory(rootDir, currentDir, manifest) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const relativeDir = normalizeRelativePath(relative(rootDir, currentDir)) || '.';
  const directoryEntries = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = join(currentDir, entry.name);
    const relativePath = normalizeRelativePath(relative(rootDir, fullPath));
    if (entry.isDirectory()) {
      directoryEntries.push({
        name: entry.name,
        type: 'dir',
        path: relativePath,
      });
      await walkDirectory(rootDir, fullPath, manifest);
      continue;
    }

    const fileStat = await stat(fullPath);
    const text = isTextFile(fullPath);
    manifest.files[relativePath] = {
      name: entry.name,
      path: relativePath,
      size: fileStat.size,
      text,
    };

    directoryEntries.push({
      name: entry.name,
      type: 'file',
      path: relativePath,
    });
  }

  manifest.directories[relativeDir] = directoryEntries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

async function buildManifest() {
  const manifest = {
    skillSlug,
    generatedAt: new Date().toISOString(),
    skillDirLabel: `skills/${skillSlug}`,
    directories: {},
    files: {},
  };

  await walkDirectory(skillRoot, skillRoot, manifest);
  return manifest;
}

async function uploadKey(key, filePath) {
  const uploadArgs = [
    'kv',
    'key',
    'put',
    key,
    '--path',
    filePath,
    '--binding',
    binding,
  ];

  if (args.has('--preview')) {
    uploadArgs.push('--preview');
  } else {
    uploadArgs.push('--remote', '--preview=false');
  }

  await runWrangler(uploadArgs);
}

async function main() {
  const manifest = await buildManifest();
  const tempDir = await mkdtemp(join(tmpdir(), 'cyberxuefeng-kv-'));

  try {
    const manifestPath = join(tempDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    await uploadKey(`skill:${skillSlug}:manifest`, manifestPath);

    for (const [relativePath, metadata] of Object.entries(manifest.files)) {
      if (!metadata.text) {
        continue;
      }

      const sourcePath = resolve(skillRoot, relativePath);
      await uploadKey(getFileKey(relativePath), sourcePath);
    }

    const uploadedCount = Object.values(manifest.files).filter((item) => item.text).length;
    console.log(`已上传 manifest 和 ${uploadedCount} 个文本技能文件到 ${binding}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
