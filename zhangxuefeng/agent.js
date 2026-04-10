/**
 * 张雪峰视角 Agent
 * OpenAI 兼容 API + Gemini WebSearch 工具
 */
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { loadSkill } from './skill.js';
import { getEnabledTools, getToolNames, getSearchType } from './tools/index.js';

let agentCache = null;

function logAgentStream(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[agent-stream][${timestamp}] ${message}`);
    return;
  }

  console.log(`[agent-stream][${timestamp}] ${message}`, extra);
}

function buildMessages(skill, userMessage, history = []) {
  const messages = [new SystemMessage(skill.systemPrompt)];

  messages.push(
    ...history.map(h =>
      h.role === 'human'
        ? new HumanMessage(h.content)
        : new AIMessage(h.content)
    ),
    new HumanMessage(userMessage)
  );

  return messages;
}

/**
 * 创建 Agent 实例
 */
export async function createAgent() {
  if (agentCache) {
    return agentCache;
  }
  
  const skill = await loadSkill();
  const model = process.env.OPENAI_MODEL || 'glm-5';
  const baseUrl = process.env.BASE_URL || process.env.OPENAI_BASE_URL;
  const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('API_KEY / OPENAI_API_KEY not found in environment');
  }
  
  console.log('🔧 使用 OpenAI 兼容 API:', baseUrl || '默认', model);
  
  // 基础 LLM
  const llm = new ChatOpenAI({
    model: model,
    temperature: 0.7,
    apiKey: apiKey,
    configuration: baseUrl ? { baseURL: baseUrl } : undefined,
  });
  
  // 工具列表
  const searchEnabled = Boolean(process.env.GEMINI_API_KEY);
  const tools = getEnabledTools();

  if (searchEnabled) {
    console.log('🔧 已启用 Gemini WebSearch 工具');
  } else {
    console.log('🔧 未启用搜索工具（未配置 GEMINI_API_KEY）');
  }

  const reactAgent = await createReactAgent({
    llm,
    tools,
  });

  agentCache = {
    skill,
    llm,
    reactAgent,
    model,
    searchEnabled,

    /**
     * 执行对话
     */
    async chat(userMessage, history = []) {
      const messages = buildMessages(skill, userMessage, history);
      const result = await reactAgent.invoke({ messages });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },

    /**
     * 流式对话
     */
    async *streamChat(userMessage, history = []) {
      const messages = buildMessages(skill, userMessage, history);
      logAgentStream('开始 streamChat', {
        historyLength: history.length,
        messagePreview: userMessage.slice(0, 120),
      });

      const eventStream = await reactAgent.streamEvents(
        { messages },
        { version: 'v1' }
      );

      let eventCount = 0;
      let chunkCount = 0;
      let sawToolEvent = false;

      for await (const event of eventStream) {
        eventCount += 1;

        if (!sawToolEvent && event.event.includes('tool')) {
          sawToolEvent = true;
          logAgentStream('检测到工具调用事件', {
            index: eventCount,
            event: event.event,
          });
        }

        if (event.event !== 'on_chat_model_stream' && event.event !== 'on_llm_stream') {
          continue;
        }

        const chunk = event.data?.chunk?.message?.content ?? event.data?.chunk?.content;
        if (!chunk) {
          continue;
        }

        const text = Array.isArray(chunk)
          ? chunk.map((item) => item?.text ?? '').join('')
          : String(chunk);

        if (!text) {
          continue;
        }

        chunkCount += 1;
        if (chunkCount === 1) {
          logAgentStream('收到首个可输出 chunk', {
            preview: text.slice(0, 120),
          });
        }

        yield text;
      }

      logAgentStream('streamChat 结束', {
        eventCount,
        chunkCount,
      });
    },

    /**
     * 获取技能信息
     */
    getSkillInfo() {
      return {
        name: skill.name,
        description: skill.description,
        model: this.model,
        searchEnabled: this.searchEnabled,
        searchType: getSearchType(),
        tools: getToolNames(),
      };
    },
  };
  
  return agentCache;
}

/**
 * 清除 Agent 缓存
 */
export function clearAgentCache() {
  agentCache = null;
}

export default createAgent;
