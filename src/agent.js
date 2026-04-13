import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { getRuntimeConfig } from './config.js';
import { loadSkill } from './skill-store.js';
import { getEnabledTools, getSearchRuntimeInfo, getSearchType, getToolNames } from './tools.js';

const agentCache = new Map();

function buildCacheKey(env) {
  const config = getRuntimeConfig(env);
  return JSON.stringify({
    skillSlug: config.skillSlug,
    model: config.model,
    baseUrl: config.baseUrl,
    searchProvider: config.searchProvider,
  });
}

function logAgentEvent(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[agent][${timestamp}] ${message}`);
    return;
  }

  console.log(`[agent][${timestamp}] ${message}`, extra);
}

function buildMessages(skill, userMessage, history = []) {
  const messages = [new SystemMessage(skill.systemPrompt)];

  messages.push(
    ...history.map((item) => (
      item.role === 'human'
        ? new HumanMessage(item.content)
        : new AIMessage(item.content)
    )),
    new HumanMessage(userMessage),
  );

  return messages;
}

export async function getSkillInfo(env) {
  const skill = await loadSkill(env);
  const config = getRuntimeConfig(env);
  const searchRuntimeInfo = getSearchRuntimeInfo(env);

  return {
    name: skill.name,
    description: skill.description,
    model: config.model,
    searchEnabled: searchRuntimeInfo.enabled,
    searchType: getSearchType(env),
    tools: getToolNames(env),
  };
}

export async function createAgent(env) {
  const cacheKey = buildCacheKey(env);
  if (agentCache.has(cacheKey)) {
    return agentCache.get(cacheKey);
  }

  const config = getRuntimeConfig(env);
  if (!config.apiKey) {
    throw new Error('API_KEY / OPENAI_API_KEY not found in environment');
  }

  const skill = await loadSkill(env);
  const tools = getEnabledTools(env);
  const searchRuntimeInfo = getSearchRuntimeInfo(env);

  logAgentEvent('初始化 Agent', {
    model: config.model,
    baseUrl: config.baseUrl || 'default',
    searchEnabled: searchRuntimeInfo.enabled,
  });

  const llm = new ChatOpenAI({
    model: config.model,
    temperature: 0.7,
    apiKey: config.apiKey,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });

  const reactAgent = await createReactAgent({
    llm,
    tools,
  });

  const agent = {
    async chat(userMessage, history = []) {
      const result = await reactAgent.invoke({
        messages: buildMessages(skill, userMessage, history),
      });
      const lastMessage = result.messages[result.messages.length - 1];
      return lastMessage.content;
    },

    async *streamChat(userMessage, history = []) {
      const eventStream = await reactAgent.streamEvents(
        { messages: buildMessages(skill, userMessage, history) },
        { version: 'v1' },
      );

      for await (const event of eventStream) {
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

        if (text) {
          yield text;
        }
      }
    },

    getSkillInfo() {
      return {
        name: skill.name,
        description: skill.description,
        model: config.model,
        searchEnabled: searchRuntimeInfo.enabled,
        searchType: getSearchType(env),
        tools: getToolNames(env),
      };
    },
  };

  agentCache.set(cacheKey, agent);
  return agent;
}

export function clearAgentCache() {
  agentCache.clear();
}
