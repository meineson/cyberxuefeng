import { createAgent, clearAgentCache, getSkillInfo } from './agent.js';
import { getAuthStatus, verifyPassword } from './auth.js';
import { jsonResponse, noContentResponse, parseJsonBody, textResponse } from './http.js';
import { checkRateLimit, getRateLimitStatus, validateInputLength } from './limit.js';
import { clearSkillCache } from './skill-store.js';

function logRequest(message, extra) {
  const timestamp = new Date().toISOString();
  if (extra === undefined) {
    console.log(`[worker][${timestamp}] ${message}`);
    return;
  }

  console.log(`[worker][${timestamp}] ${message}`, extra);
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

  logRequest('收到聊天请求', {
    stream,
    historyLength: Array.isArray(history) ? history.length : 0,
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
          error: error.message || 'Internal server error',
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
      message: error.message,
    }, { status: 500 });
  }

  return textResponse('Not Found', { status: 404 });
}
