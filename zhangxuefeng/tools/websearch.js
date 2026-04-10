/**
 * WebSearch 工具
 * 支持 Gemini / Tavily 双提供方
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { tavily } from '@tavily/core';

const DEFAULT_GEMINI_SEARCH_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
];
const DEFAULT_SEARCH_PROVIDER = 'gemini';

function logWebSearch(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[web_search][${timestamp}] ${message}`);
    return;
  }

  console.log(`[web_search][${timestamp}] ${message}`, extra);
}

function getSearchProvider() {
  const provider = (process.env.SEARCH_PROVIDER || DEFAULT_SEARCH_PROVIDER).trim().toLowerCase();
  if (provider === 'tavily') {
    return 'tavily';
  }
  return 'gemini';
}

export function getSearchRuntimeInfo() {
  const provider = getSearchProvider();
  if (provider === 'tavily') {
    return {
      provider,
      enabled: Boolean(process.env.TAVILY_API_KEY),
      searchType: 'Tavily Search',
    };
  }

  return {
    provider: 'gemini',
    enabled: Boolean(process.env.GEMINI_API_KEY),
    searchType: 'Gemini Google Search',
  };
}

function getSearchModels() {
  const manualModel = process.env.GEMINI_MODEL?.trim();
  if (manualModel) {
    return [manualModel];
  }

  return DEFAULT_GEMINI_SEARCH_MODELS;
}

/**
 * 使用 Gemini + Google Search grounding 进行搜索
 */
export async function geminiSearch(query) {
  const models = getSearchModels();
  logWebSearch('调用开始', { query, models });
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    logWebSearch('调用失败：未配置 GEMINI_API_KEY');
    return '⚠️ 未配置 GEMINI_API_KEY，无法搜索';
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  // 搜索提示词 - 专注于数据查询
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

      // 提取搜索来源
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks?.length > 0) {
        const sources = groundingMetadata.groundingChunks
          .map((c) => c.web?.title || c.web?.uri)
          .filter(Boolean)
          .slice(0, 5);

        if (sources.length > 0) {
          output += `\n\n📊 来源：${sources.join('、')}`;
        }
      }

      logWebSearch('调用成功', {
        query,
        model: modelName,
        outputLength: output.length,
        sourceCount: groundingMetadata?.groundingChunks?.length || 0,
      });

      return output;
    } catch (error) {
      lastError = error;
      logWebSearch('模型调用异常，准备切换下一个模型', {
        query,
        model: modelName,
        error: error.message,
      });
    }
  }

  console.error('Gemini search error:', lastError);
  return `搜索失败：${lastError?.message || '未知错误'}`;
}

export async function tavilySearch(query) {
  logWebSearch('调用开始', { query, provider: 'tavily' });
  const tavilyApiKey = process.env.TAVILY_API_KEY;

  if (!tavilyApiKey) {
    logWebSearch('调用失败：未配置 TAVILY_API_KEY');
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

    logWebSearch('调用成功', {
      query,
      provider: 'tavily',
      outputLength: output.length,
      sourceCount: sources.length,
    });

    return output;
  } catch (error) {
    logWebSearch('调用异常', {
      query,
      provider: 'tavily',
      error: error.message,
    });
    return `搜索失败：${error?.message || '未知错误'}`;
  }
}

export async function webSearch(query) {
  const provider = getSearchProvider();
  logWebSearch('提供方选择', { provider, query });

  if (provider === 'tavily') {
    return tavilySearch(query);
  }

  return geminiSearch(query);
}

/**
 * LangChain 工具定义
 */
export const webSearchTool = tool(
  async ({ query }) => {
    return await webSearch(query);
  },
  {
    name: 'web_search',
    description: '搜索就业数据、院校排名、专业信息、行业报告等。用于获取最新、具体的数据支撑回答。',
    schema: z.object({
      query: z.string().describe('搜索查询，如"新闻学专业2025就业率"或"计算机专业薪资中位数"'),
    }),
  }
);

export default webSearchTool;
