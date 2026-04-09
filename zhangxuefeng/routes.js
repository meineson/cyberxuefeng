/**
 * API 路由
 */
import { Router } from 'express';
import { createAgent, clearAgentCache } from './agent.js';
import { clearCache } from './skill.js';

const router = Router();

function logChatRequest(message, extra) {
  const timestamp = new Date().toISOString();
  console.log(`[chat][${timestamp}] ${message}`, extra);
}

// Agent 实例（懒加载）
let agent = null;

async function getAgent() {
  if (!agent) {
    agent = await createAgent();
  }
  return agent;
}

/**
 * POST /api/chat
 * 对话接口
 * Body: { message: string, history: Array<{role: string, content: string}> }
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [], stream = false } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    logChatRequest('收到请求', {
      stream,
      historyLength: Array.isArray(history) ? history.length : 0,
      messagePreview: message.slice(0, 120),
    });
    
    const agentInstance = await getAgent();

    if (stream) {
      logChatRequest('开始 SSE 响应');
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      let fullReply = '';
      let chunkCount = 0;

      try {
        for await (const chunk of agentInstance.streamChat(message, history)) {
          chunkCount += 1;
          if (chunkCount === 1) {
            logChatRequest('收到首个流式 chunk', {
              preview: chunk.slice(0, 120),
            });
          }

          fullReply += chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        }

        logChatRequest('流式输出完成', {
          chunkCount,
          replyLength: fullReply.length,
        });

        res.write(`data: ${JSON.stringify({
          type: 'done',
          reply: fullReply,
          timestamp: new Date().toISOString(),
        })}\n\n`);
      } catch (error) {
        logChatRequest('流式输出异常', {
          chunkCount,
          error: error.message,
        });
        console.error('Chat stream error:', error);
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error.message || 'Internal server error',
        })}\n\n`);
      }

      return res.end();
    }

    const reply = await agentInstance.chat(message, history);
    logChatRequest('普通输出完成', {
      replyLength: String(reply || '').length,
    });
    
    res.json({ 
      success: true,
      reply,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * GET /api/skill/info
 * 获取技能信息
 */
router.get('/skill/info', async (req, res) => {
  try {
    const agentInstance = await getAgent();
    const info = agentInstance.getSkillInfo();
    
    res.json({
      success: true,
      skill: info,
    });
  } catch (error) {
    console.error('Skill info error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chat/reset
 * 重置对话（服务端缓存清理，实际会话由前端 localStorage 管理）
 */
router.post('/chat/reset', async (req, res) => {
  try {
    clearAgentCache();
    clearCache();
    agent = null;
    
    res.json({ 
      success: true,
      message: 'Session reset, skill reloaded',
    });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/reload
 * 热重载技能（开发用）
 */
router.post('/reload', async (req, res) => {
  try {
    clearAgentCache();
    clearCache();
    agent = null;
    
    // 重新加载
    agent = await createAgent();
    const info = agent.getSkillInfo();
    
    res.json({ 
      success: true,
      message: 'Skill reloaded',
      skill: info,
    });
  } catch (error) {
    console.error('Reload error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
