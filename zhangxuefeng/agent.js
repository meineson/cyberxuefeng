/**
 * 张雪峰视角 Agent
 * OpenAI 兼容 API + Gemini WebSearch 工具
 */
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { loadSkill } from './skill.js';
import { getEnabledTools, getToolNames, getSearchType } from './tools/index.js';
import { geminiSearch } from './tools/gemini-search.js';

let agentCache = null;
const SEARCH_TRIGGER_PATTERNS = [
  /最新/,
  /今年/,
  /当前/,
  /现在/,
  /最近/,
  /202\d/,
  /分数线/,
  /录取线/,
  /投档线/,
  /排名/,
  /位次/,
  /就业率/,
  /就业情况/,
  /薪资/,
  /工资/,
  /数据/,
  /政策/,
  /学费/,
  /保研率/,
  /升学率/,
  /招生/,
  /高校/,
  /大学/,
  /专业/,
  /行业/,
];

function logAgentStream(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[agent-stream][${timestamp}] ${message}`);
    return;
  }

  console.log(`[agent-stream][${timestamp}] ${message}`, extra);
}

function logAgentDecision(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[agent-decision][${timestamp}] ${message}`);
    return;
  }

  console.log(`[agent-decision][${timestamp}] ${message}`, extra);
}

function shouldForceWebSearch(userMessage) {
  if (!userMessage) {
    return false;
  }

  return SEARCH_TRIGGER_PATTERNS.some((pattern) => pattern.test(userMessage));
}

async function buildMessages(skill, userMessage, history = [], options = {}) {
  const messages = [new SystemMessage(skill.systemPrompt)];
  const forceWebSearch = shouldForceWebSearch(userMessage);
  const searchEnabled = Boolean(options.searchEnabled);

  if (forceWebSearch) {
    logAgentDecision('命中强制搜索条件', {
      messagePreview: userMessage.slice(0, 120),
    });

    if (searchEnabled) {
      logAgentDecision('开始执行前置 web_search', {
        query: userMessage,
      });
      const searchResult = await geminiSearch(userMessage);
      logAgentDecision('前置 web_search 完成', {
        resultLength: String(searchResult || '').length,
      });

      messages.push(new SystemMessage(
        [
          '本轮问题涉及时效性数据，后端已预先执行 web_search。',
          '你必须优先参考下面这份最新搜索结果作答；如需技能目录资料，可在此基础上再调用 list_skill_files 或 read_skill_file。',
          '除非搜索结果明显不足，否则不要再次调用 web_search。',
          '',
          '【最新搜索结果开始】',
          String(searchResult || ''),
          '【最新搜索结果结束】',
        ].join('\n')
      ));
    } else {
      messages.push(new SystemMessage(
        [
          '本轮问题涉及时效性数据。',
          '当前未启用 web_search，请明确说明无法联网获取最新数据，再基于已有资料谨慎回答。',
        ].join('')
      ));
    }
  }

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
      const messages = await buildMessages(skill, userMessage, history, { searchEnabled });
      const result = await reactAgent.invoke({ messages });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },

    /**
     * 流式对话
     */
    async *streamChat(userMessage, history = []) {
      const messages = await buildMessages(skill, userMessage, history, { searchEnabled });
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
