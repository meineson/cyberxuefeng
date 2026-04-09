import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readSkillFile } from '../skill.js';

function logSkillFileRead(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[read_skill_file][${timestamp}] ${message}`);
    return;
  }

  console.log(`[read_skill_file][${timestamp}] ${message}`, extra);
}

export const readSkillFileTool = tool(
  async ({ relativePath }) => {
    try {
      logSkillFileRead('调用开始', { relativePath });
      const content = await readSkillFile(relativePath);
      logSkillFileRead('调用成功', {
        relativePath,
        contentLength: content.length,
      });
      return [
        `文件路径: ${relativePath}`,
        '文件内容:',
        content,
      ].join('\n');
    } catch (error) {
      logSkillFileRead('调用异常', {
        relativePath,
        error: error.message,
      });
      return `读取技能文件失败: ${error.message}`;
    }
  },
  {
    name: 'read_skill_file',
    description: '读取当前技能目录下的文本文件内容。只允许相对路径，例如 references/research/著作.md 或 README.md。',
    schema: z.object({
      relativePath: z.string().describe('技能目录下的相对文件路径'),
    }),
  },
);

export default readSkillFileTool;
