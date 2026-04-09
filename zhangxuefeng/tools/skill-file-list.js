import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { listSkillFiles } from '../skill.js';

function logSkillFileList(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[list_skill_files][${timestamp}] ${message}`);
    return;
  }

  console.log(`[list_skill_files][${timestamp}] ${message}`, extra);
}

export const listSkillFilesTool = tool(
  async ({ relativeDir = '.' }) => {
    try {
      logSkillFileList('调用开始', { relativeDir });
      const entries = await listSkillFiles(relativeDir);
      logSkillFileList('调用成功', {
        relativeDir,
        count: entries.length,
      });

      return [
        `目录路径: ${relativeDir}`,
        '目录内容:',
        ...entries.map((entry) => `- [${entry.type}] ${entry.path}`),
      ].join('\n');
    } catch (error) {
      logSkillFileList('调用异常', {
        relativeDir,
        error: error.message,
      });
      return `列出技能目录失败: ${error.message}`;
    }
  },
  {
    name: 'list_skill_files',
    description: '列出当前技能目录下某个子目录的真实文件和子目录。读取文件前应先用它确认文件名，禁止猜测。',
    schema: z.object({
      relativeDir: z.string().default('.').describe('技能目录下的相对目录路径，例如 references/research'),
    }),
  },
);

export default listSkillFilesTool;
