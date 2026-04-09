/**
 * Gemini WebSearch 工具
 * 使用 Gemini API 的 Google Search grounding 进行搜索
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';

function logWebSearch(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[web_search][${timestamp}] ${message}`);
    return;
  }

  console.log(`[web_search][${timestamp}] ${message}`, extra);
}

/**
 * 使用 Gemini + Google Search grounding 进行搜索
 */
export async function geminiSearch(query) {
  logWebSearch('调用开始', { query });
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    logWebSearch('调用失败：未配置 GEMINI_API_KEY');
    return '⚠️ 未配置 GEMINI_API_KEY，无法搜索';
  }

  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    tools: [
      {
        google_search: {}
      }
    ],
  });

  // 搜索提示词 - 专注于数据查询
  const searchPrompt = `请搜索并提取以下信息的最新数据：
${query}

要求：
1. 提供具体的数字、百分比、排名等数据
2. 注明数据来源和时效性
3. 如果有多个来源，列出主要来源`;

  try {
    const result = await model.generateContent(searchPrompt);
    const response = result.response;
    
    let output = response.text();
    
    // 提取搜索来源
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    if (groundingMetadata?.groundingChunks?.length > 0) {
      const sources = groundingMetadata.groundingChunks
        .map(c => c.web?.title || c.web?.uri)
        .filter(Boolean)
        .slice(0, 5);
      
      if (sources.length > 0) {
        output += `\n\n📊 来源：${sources.join('、')}`;
      }
    }

    logWebSearch('调用成功', {
      query,
      outputLength: output.length,
      sourceCount: groundingMetadata?.groundingChunks?.length || 0,
    });
    
    return output;
  } catch (error) {
    logWebSearch('调用异常', {
      query,
      error: error.message,
    });
    console.error('Gemini search error:', error);
    return `搜索失败：${error.message}`;
  }
}

/**
 * LangChain 工具定义
 */
export const webSearchTool = tool(
  async ({ query }) => {
    return await geminiSearch(query);
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
