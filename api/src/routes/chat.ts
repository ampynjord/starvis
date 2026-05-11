/**
 * POST /api/v1/chat      — SSE streaming (web widget)
 * POST /api/v1/chat/ask  — JSON sync (Discord bot / external)
 *
 * Request body:
 *   { messages: [{ role: 'user'|'assistant', content: string }] }
 */

import type { Router } from 'express';
import { requireJwt, requireJwtBetaOrAdmin } from '../middleware/index.js';
import { ChatService } from '../services/chat-service.js';
import type { RouteDependencies } from './types.js';

function sanitize(messages: { role: string; content: string }[]) {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 4000) }))
    .slice(-20);
}

export function mountChatRoutes(router: Router, deps: RouteDependencies): void {
  if (!deps.gameDataService) return;
  if (!deps.rsiWebsiteService) return;
  if (!process.env.MISTRAL_API_KEY) return;

  const chatService = new ChatService(deps.gameDataService, deps.shipMatrixService, deps.rsiWebsiteService, deps.prisma);

  // ── SSE streaming (web widget — beta testers & admins only) ─────────────
  router.post('/api/v1/chat', requireJwtBetaOrAdmin, (req, res) => {
    const { messages } = req.body as { messages?: { role: string; content: string }[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return void res.status(400).json({ success: false, error: 'messages array required' });
    }

    const sanitized = sanitize(messages);
    if (!sanitized.length || sanitized[sanitized.length - 1].role !== 'user') {
      return void res.status(400).json({ success: false, error: 'Last message must be from user' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Content-Encoding', 'identity');
    res.flushHeaders();

    const send = (data: object) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
          (res as unknown as { flush: () => void }).flush();
        }
      }
    };

    chatService.streamChat(
      sanitized,
      (text) => send({ type: 'chunk', text }),
      () => {
        send({ type: 'done' });
        res.end();
      },
      (err) => {
        send({ type: 'error', message: err.message });
        res.end();
      },
    );
  });

  // ── JSON sync (Discord bot / external — beta testers & admins only) ─────
  router.post('/api/v1/chat/ask', requireJwtBetaOrAdmin, async (req, res) => {
    const { messages } = req.body as { messages?: { role: string; content: string }[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return void res.status(400).json({ success: false, error: 'messages array required' });
    }

    const sanitized = sanitize(messages);
    if (!sanitized.length || sanitized[sanitized.length - 1].role !== 'user') {
      return void res.status(400).json({ success: false, error: 'Last message must be from user' });
    }

    try {
      const reply = await chatService.ask(sanitized);
      res.json({ success: true, reply });
    } catch (e: any) {
      const msg: string = e.message ?? 'Chat error';
      const isRateLimit = msg.includes('429') || msg.includes('rate_limit') || msg.includes('Rate limit');
      res
        .status(isRateLimit ? 429 : 500)
        .json({ success: false, error: isRateLimit ? '⏳ Mistral rate limit reached, please try again in a moment.' : msg });
    }
  });
}
