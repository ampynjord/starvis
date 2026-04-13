/**
 * POST /api/v1/chat — AI chatbot with SSE streaming (Groq Llama 3.3 70B)
 *
 * Request body:
 *   { messages: [{ role: 'user'|'assistant', content: string }] }
 *
 * Response: Server-Sent Events (text/event-stream)
 *   data: {"type":"chunk","text":"..."}   — incremental text
 *   data: {"type":"done"}                 — stream complete
 *   data: {"type":"error","message":"..."} — error
 */

import type { Router } from 'express';
import { ChatService } from '../services/chat-service.js';
import type { RouteDependencies } from './types.js';

export function mountChatRoutes(router: Router, deps: RouteDependencies): void {
  if (!deps.gameDataService) return;
  if (!deps.rsiWebsiteService) return;
  if (!process.env.GROQ_API_KEY) return;

  const chatService = new ChatService(deps.gameDataService, deps.shipMatrixService, deps.rsiWebsiteService);

  router.post('/api/v1/chat', (req, res) => {
    const { messages } = req.body as { messages?: { role: string; content: string }[] };

    if (!Array.isArray(messages) || messages.length === 0) {
      return void res.status(400).json({ success: false, error: 'messages array required' });
    }

    // Validate and sanitize messages
    const sanitized = messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content.slice(0, 4000) }))
      .slice(-20); // keep last 20 messages max

    if (!sanitized.length || sanitized[sanitized.length - 1].role !== 'user') {
      return void res.status(400).json({ success: false, error: 'Last message must be from user' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
    res.flushHeaders();

    const send = (data: object) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
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
}
