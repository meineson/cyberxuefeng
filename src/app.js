import { createAgent, clearAgentCache, getSkillInfo } from './agent.js';
import { getAuthStatus, verifyPassword } from './auth.js';
import { jsonResponse, noContentResponse, parseJsonBody, textResponse } from './http.js';
import { checkRateLimit, getRateLimitStatus, validateInputLength } from './limit.js';
import { clearSkillCache } from './skill-store.js';

const MAX_HISTORY_ITEMS = 50;
const MAX_HISTORY_CONTENT_LENGTH = 2000;

function logRequest(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[worker][${timestamp}] ${message}`);
    return;
  }

  console.log(`[worker][${timestamp}] ${message}`, extra);
}

function validateHistory(history) {
  if (!Array.isArray(history)) {
    return 'history must be an array';
  }

  if (history.length > MAX_HISTORY_ITEMS) {
    return `history too long (max ${MAX_HISTORY_ITEMS} items)`;
  }

  for (const item of history) {
    if (!item || typeof item !== 'object') {
      return 'each history item must be an object';
    }

    if (item.role !== 'human' && item.role !== 'ai') {
      return 'history item role must be "human" or "ai"';
    }

    if (typeof item.content !== 'string') {
      return 'history item content must be a string';
    }

    if (item.content.length > MAX_HISTORY_CONTENT_LENGTH) {
      return `history item content too long (max ${MAX_HISTORY_CONTENT_LENGTH} chars)`;
    }
  }

  return null;
}

function verifyRequestAuth(request, env) {
  const { required } = getAuthStatus(env);
  if (!required) {
    return null;
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const result = verifyPassword(env, token);
  if (!result.ok) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

function shouldApplyAppGuards(pathname) {
  return pathname === '/api/chat'
    || pathname === '/api/chat/reset'
    || pathname === '/api/reload'
    || pathname === '/api/skill/info';
}

async function applyAppGuards(request, env, body) {
  if (!shouldApplyAppGuards(new URL(request.url).pathname)) {
    return null;
  }

  const authError = verifyRequestAuth(request, env);
  if (authError) {
    return authError;
  }

  const lengthError = validateInputLength(body, env);
  if (lengthError) {
    return jsonResponse(lengthError, { status: 400 });
  }

  const rateLimit = await checkRateLimit(request, env);
  const headers = {
    'X-RateLimit-Limit': String(rateLimit.limit),
    'X-RateLimit-Remaining': String(rateLimit.remaining),
  };

  if (!rateLimit.allowed) {
    return jsonResponse({
      error: '请求过于频繁，请稍后再试',
      retryAfter: rateLimit.retryAfter,
      limit: rateLimit.limit,
      window: '1分钟',
    }, {
      status: 429,
      headers: {
        ...headers,
        'Retry-After': String(rateLimit.retryAfter),
      },
    });
  }

  return headers;
}

function buildSseMessage(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function handleChat(request, env) {
  const body = await parseJsonBody(request);
  const guardResult = await applyAppGuards(request, env, body);
  if (guardResult instanceof Response) {
    return guardResult;
  }

  const { message, history = [], stream = false } = body;
  if (!message || typeof message !== 'string') {
    return jsonResponse({ error: 'message is required' }, {
      status: 400,
      headers: guardResult,
    });
  }

  const historyError = validateHistory(history);
  if (historyError) {
    return jsonResponse({ error: historyError }, {
      status: 400,
      headers: guardResult,
    });
  }

  logRequest('收到聊天请求', {
    stream,
    historyLength: history.length,
    messagePreview: message.slice(0, 120),
  });

  const agent = await createAgent(env);
  if (!stream) {
    const reply = await agent.chat(message, history);
    return jsonResponse({
      success: true,
      reply,
      timestamp: new Date().toISOString(),
    }, {
      headers: guardResult,
    });
  }

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      let fullReply = '';

      try {
        for await (const chunk of agent.streamChat(message, history)) {
          fullReply += chunk;
          controller.enqueue(encoder.encode(buildSseMessage({
            type: 'chunk',
            content: chunk,
          })));
        }

        controller.enqueue(encoder.encode(buildSseMessage({
          type: 'done',
          reply: fullReply,
          timestamp: new Date().toISOString(),
        })));
      } catch (error) {
        logRequest('流式聊天异常', { error: error.message });
        controller.enqueue(encoder.encode(buildSseMessage({
          type: 'error',
          error: 'Stream error, please try again',
        })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      ...guardResult,
    },
  });
}

async function handleSkillInfo(request, env) {
  const guardResult = await applyAppGuards(request, env);
  if (guardResult instanceof Response) {
    return guardResult;
  }

  const skill = await getSkillInfo(env);
  return jsonResponse({
    success: true,
    skill,
  }, {
    headers: guardResult,
  });
}

async function handleChatReset(request, env) {
  const guardResult = await applyAppGuards(request, env);
  if (guardResult instanceof Response) {
    return guardResult;
  }

  clearAgentCache();
  clearSkillCache();

  return jsonResponse({
    success: true,
    message: 'Session reset, skill reloaded',
  }, {
    headers: guardResult,
  });
}

async function handleReload(request, env) {
  const guardResult = await applyAppGuards(request, env);
  if (guardResult instanceof Response) {
    return guardResult;
  }

  clearAgentCache();
  clearSkillCache();

  return jsonResponse({
    success: true,
    message: 'Skill reloaded',
    skill: await getSkillInfo(env),
  }, {
    headers: guardResult,
  });
}

export async function handleApiRequest(request, env) {
  const { method } = request;
  const { pathname } = new URL(request.url);

  if (method === 'OPTIONS') {
    return noContentResponse();
  }

  try {
    if (pathname === '/health' && method === 'GET') {
      return jsonResponse({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    }

    if (pathname === '/api/auth/status' && method === 'GET') {
      return jsonResponse(getAuthStatus(env));
    }

    if (pathname === '/api/auth/verify' && method === 'POST') {
      const body = await parseJsonBody(request);
      const result = verifyPassword(env, body.password);
      return jsonResponse(result.body, { status: result.status });
    }

    if (pathname === '/api/limit/status' && method === 'GET') {
      return jsonResponse(await getRateLimitStatus(request, env));
    }

    if (pathname === '/api/skill/info' && method === 'GET') {
      return await handleSkillInfo(request, env);
    }

    if (pathname === '/api/chat' && method === 'POST') {
      return await handleChat(request, env);
    }

    if (pathname === '/api/chat/reset' && method === 'POST') {
      return await handleChatReset(request, env);
    }

    if (pathname === '/api/reload' && method === 'POST') {
      return await handleReload(request, env);
    }
  } catch (error) {
    logRequest('请求失败', {
      pathname,
      method,
      error: error.message,
    });

    if (error.message === 'Invalid JSON body') {
      return jsonResponse({ error: error.message }, { status: 400 });
    }

    return jsonResponse({
      error: 'Internal server error',
    }, { status: 500 });
  }

  return textResponse('Not Found', { status: 404 });
}

