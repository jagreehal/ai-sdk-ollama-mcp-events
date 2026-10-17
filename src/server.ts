/**
 * Skybridge MCP server that publishes `comment.created` events.
 * Run: pnpm server
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { deliverEvent, type EventSubscription, OAuthError, Skybridge } from 'skybridge/server';
import { z } from 'zod';

const token = process.env.MCP_EVENTS_TOKEN ?? 'local-events-demo';

// Skybridge keeps no subscriptions; onSubscribe/onUnsubscribe are how they reach us.
// ponytail: in-memory, lost on restart. Use your webhook system or a table in production.
const subscriptions = new Map<string, EventSubscription & { documentId: string }>();

const app = new Skybridge({
  name: 'mcp-events-skybridge',
  version: '0.1.0',
  // Events need an authenticated subscriber. A static bearer stands in for a real IdP.
  oauth: {
    oauthMetadata: {
      issuer: 'http://127.0.0.1:3002',
      authorization_endpoint: 'http://127.0.0.1:3002/authorize',
      token_endpoint: 'http://127.0.0.1:3002/token',
      response_types_supported: ['code'],
    },
    verifier: {
      async verifyAccessToken(bearer) {
        const a = Buffer.from(bearer), b = Buffer.from(token);
        if (a.length !== b.length || !timingSafeEqual(a, b)) throw new OAuthError('invalid_token', 'Unknown token');
        const expiresAt = Math.floor(Date.now() / 1000) + 3600; // seconds; bearer auth rejects tokens without one
        return { token: bearer, clientId: 'local-demo', scopes: [], expiresAt, extra: { subject: 'demo-user' } };
      },
    },
  },
  handler: (server) =>
    server
      .registerEvent(
        {
          name: 'comment.created',
          description: 'Fires when someone comments on a document.',
          inputSchema: { document_id: z.string() },
          payloadSchema: { document_id: z.string(), text: z.string() },
        },
        {
          // Runs on every subscribe and refresh, after Skybridge verified the callback.
          onSubscribe: ({ document_id }, { subscription }) => {
            subscriptions.set(subscription.id, { ...subscription, documentId: document_id });
            console.log('Subscribed:', subscription.id, 'until', subscription.expiresAt.toISOString());
          },
          onUnsubscribe: (_args, { subscription }) => {
            subscriptions.delete(subscription.id);
            console.log('Unsubscribed:', subscription.id);
          },
        },
      )
      .registerTool(
        {
          name: 'publish_comment',
          description: 'Publish a comment and emit a comment.created event.',
          inputSchema: { document_id: z.string(), text: z.string() },
        },
        async (data) => {
          const id = `cmt_${randomUUID()}`;
          for (const subscription of subscriptions.values()) {
            if (subscription.documentId !== data.document_id) continue;
            const result = await deliverEvent(subscription, { name: 'comment.created', id, data });
            console.log('Delivered', id, 'to', subscription.id, result);
          }
          return { content: [{ type: 'text', text: `Comment ${id} published.` }] };
        },
      ),
});

process.env.__PORT ??= '3002';

// Skybridge listens on all interfaces and the demo token is public: only serve this machine.
// The Host check stops DNS rebinding, where a web page reaches 127.0.0.1 under its own hostname.
const hosts = ['127.0.0.1', 'localhost', '[::1]'].map((h) => `${h}:${process.env.__PORT}`);
app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  if (loopback && hosts.includes(req.headers.host ?? '')) next();
  else res.writeHead(403).end();
});
await app.run();
console.log(`MCP events server: http://127.0.0.1:${process.env.__PORT}/mcp`);
