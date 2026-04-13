import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { tavily } from '@tavily/core';
import { getRuntimeConfig, readEnv } from './config.js';
import { listSkillFiles, readSkillFile } from './skill-store.js';

const DEFAULT_GEMINI_SEARCH_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
];

function logToolEvent(name, message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[${name}][${timestamp}] ${message}`);
    return;
  }

  console.log(`[${name}][${timestamp}] ${message}`, extra);
}

function getSearchModels(env) {
  const manualModel = readEnv(env, 'GEMINI_MODEL')?.trim();
  if (manualModel) {
    return [manualModel];
  }

  return DEFAULT_GEMINI_SEARCH_MODELS;
}

export function getSearchRuntimeInfo(env) {
  const { searchProvider, geminiApiKey, tavilyApiKey } = getRuntimeConfig(env);
  if (searchProvider === 'tavily') {
    return {
      provider: 'tavily',
      enabled: Boolean(tavilyApiKey),
      searchType: 'Tavily Search',
    };
  }

  return {
    provider: 'gemini',
    enabled: Boolean(geminiApiKey),
    searchType: 'Gemini Google Search',
  };
}

export async function geminiSearch(query, env) {
  const { geminiApiKey } = getRuntimeConfig(env);
  if (!geminiApiKey) {
    logToolEvent('web_search', '调用失败：未配置 GEMINI_API_KEY');
    return '⚠️ 未配置 GEMINI_API_KEY，无法搜索';
  }

  const models = getSearchModels(env);
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const searchPrompt = `请搜索并提取以下信息的最新数据：
${query}

要求：
1. 提供具体的数字、百分比、排名等数据
2. 注明数据来源和时效性
3. 如果有多个来源，列出主要来源`;

  let lastError = null;
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ google_search: {} }],
      });

      const result = await model.generateContent(searchPrompt);
      const response = result.response;
      let output = response.text();
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks?.length > 0) {
        const sources = groundingMetadata.groundingChunks
          .map((item) => item.web?.title || item.web?.uri)
          .filter(Boolean)
          .slice(0, 5);

        if (sources.length > 0) {
          output += `\n\n📊 来源：${sources.join('、')}`;
        }
      }

      logToolEvent('web_search', 'Gemini 调用成功', {
        query,
        model: modelName,
        outputLength: output.length,
      });
      return output;
    } catch (error) {
      lastError = error;
      logToolEvent('web_search', 'Gemini 调用异常，尝试下一个模型', {
        query,
        model: modelName,
        error: error.message,
      });
    }
  }

  return `搜索失败：${lastError?.message || '未知错误'}`;
}

export async function tavilySearch(query, env) {
  const { tavilyApiKey } = getRuntimeConfig(env);
  if (!tavilyApiKey) {
    logToolEvent('web_search', '调用失败：未配置 TAVILY_API_KEY');
    return '⚠️ 未配置 TAVILY_API_KEY，无法搜索';
  }

  try {
    const client = tavily({ apiKey: tavilyApiKey });
    const result = await client.search(query, {
      includeAnswer: 'advanced',
      searchDepth: 'advanced',
    });

    const answer = result?.answer ? String(result.answer) : '';
    const sources = Array.isArray(result?.results) ? result.results : [];
    const topSources = sources
      .map((item) => item?.title || item?.url)
      .filter(Boolean)
      .slice(0, 5);

    let output = answer || '已完成搜索，但未返回摘要答案。';
    if (topSources.length > 0) {
      output += `\n\n📊 来源：${topSources.join('、')}`;
    }

    logToolEvent('web_search', 'Tavily 调用成功', {
      query,
      outputLength: output.length,
      sourceCount: sources.length,
    });
    return output;
  } catch (error) {
    logToolEvent('web_search', 'Tavily 调用异常', {
      query,
      error: error.message,
    });
    return `搜索失败：${error?.message || '未知错误'}`;
  }
}

export async function webSearch(query, env) {
  const runtimeInfo = getSearchRuntimeInfo(env);
  return runtimeInfo.provider === 'tavily'
    ? tavilySearch(query, env)
    : geminiSearch(query, env);
}

export function createListSkillFilesTool(env) {
  return tool(
    async ({ relativeDir = '.' }) => {
      try {
        logToolEvent('list_skill_files', '调用开始', { relativeDir });
        const entries = await listSkillFiles(env, relativeDir);
        return [
          `目录路径: ${relativeDir}`,
          '目录内容:',
          ...entries.map((entry) => `- [${entry.type}] ${entry.path}`),
        ].join('\n');
      } catch (error) {
        logToolEvent('list_skill_files', '调用异常', {
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
}

export function createReadSkillFileTool(env) {
  return tool(
    async ({ relativePath }) => {
      try {
        logToolEvent('read_skill_file', '调用开始', { relativePath });
        const content = await readSkillFile(env, relativePath);
        return [
          `文件路径: ${relativePath}`,
          '文件内容:',
          content,
        ].join('\n');
      } catch (error) {
        logToolEvent('read_skill_file', '调用异常', {
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
}

export function createWebSearchTool(env) {
  return tool(
    async ({ query }) => {
      return webSearch(query, env);
    },
    {
      name: 'web_search',
      description: '搜索就业数据、院校排名、专业信息、行业报告等。用于获取最新、具体的数据支撑回答。',
      schema: z.object({
        query: z.string().describe('搜索查询，如"新闻学专业2025就业率"或"计算机专业薪资中位数"'),
      }),
    },
  );
}

export function getEnabledTools(env) {
  const tools = [
    createListSkillFilesTool(env),
    createReadSkillFileTool(env),
  ];

  if (getSearchRuntimeInfo(env).enabled) {
    tools.push(createWebSearchTool(env));
  }

  return tools;
}

export function getToolNames(env) {
  return getEnabledTools(env).map((item) => item.name);
}

export function getSearchType(env) {
  const runtimeInfo = getSearchRuntimeInfo(env);
  return runtimeInfo.enabled ? runtimeInfo.searchType : '无';
}
