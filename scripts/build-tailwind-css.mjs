import { readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { compile } from '@tailwindcss/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const htmlPath = resolve(projectRoot, 'public/index.html');
const inputCss = '@import "tailwindcss";\n@source "./public/index.html";';
const outputPath = resolve(projectRoot, 'public/css/tailwind.generated.css');
const SAFELIST = [
  'justify-end',
  'max-w-[80%]',
  'max-w-[90%]',
  'bg-orange-100',
  'bg-gray-50',
  'text-gray-800',
  'rounded-xl',
  'px-4',
  'py-3',
];

function extractClassCandidates(source) {
  const candidates = new Set();
  const patterns = [
    /class="([^"]+)"/g,
    /class='([^']+)'/g,
    /className\s*=\s*'([^']+)'/g,
    /className\s*=\s*"([^"]+)"/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      for (const token of match[1].split(/\s+/)) {
        if (token) {
          candidates.add(token);
        }
      }
    }
  }

  for (const match of source.matchAll(/'([^']+)'/g)) {
    const value = match[1];
    if (!/[\s:-]/.test(value) || /[<{}`]/.test(value)) {
      continue;
    }

    const tokens = value.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      continue;
    }

    if (tokens.every((token) => /^[a-zA-Z0-9_:[\]()./%!#-]+$/.test(token))) {
      for (const token of tokens) {
        candidates.add(token);
      }
    }
  }

  return Array.from(candidates);
}

const compiler = await compile(inputCss, {
  base: projectRoot,
  from: resolve(projectRoot, 'tailwind.inline.css'),
  onDependency() {},
});

const htmlSource = await readFile(htmlPath, 'utf8');
const css = compiler.build([
  ...extractClassCandidates(htmlSource),
  ...SAFELIST,
]);
await writeFile(outputPath, css, 'utf8');

console.log(`已生成 Tailwind 静态样式: ${outputPath}`);
