import { Hono } from 'hono';
import { Backlog } from 'backlog-js';
import type { CognitoJwtVerifier } from './cognitoJwtVerifier.js';
import type { ApiKeyVault } from './apiKeyVault.js';
import { isValidBacklogDomain } from './backlogDomainValidator.js';
import { logger } from '../utils/logger.js';

export function createCognitoRoutes(
  verifier: CognitoJwtVerifier,
  vault: ApiKeyVault
): Hono {
  const app = new Hono();

  const authenticate = async (
    authHeader: string | undefined
  ): Promise<{ userId: string } | { error: string }> => {
    if (!authHeader) return { error: 'Missing Authorization header' };
    const [type, token] = authHeader.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) {
      return { error: 'Expected Bearer token' };
    }
    try {
      const claims = await verifier(token);
      return { userId: claims.sub };
    } catch {
      return { error: 'Invalid or expired JWT' };
    }
  };

  app.use('/api/keys/*', async (c, next) => {
    const result = await authenticate(c.req.header('authorization'));
    if ('error' in result) {
      return c.json({ error: 'unauthorized', error_description: result.error }, 401);
    }
    c.set('userId' as never, result.userId);
    await next();
  });

  app.use('/api/keys', async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'POST') {
      const result = await authenticate(c.req.header('authorization'));
      if ('error' in result) {
        return c.json({ error: 'unauthorized', error_description: result.error }, 401);
      }
      c.set('userId' as never, result.userId);
    }
    await next();
  });

  app.post('/api/keys', async (c) => {
    const userId = c.get('userId' as never) as string;

    let body: { backlogDomain?: string; apiKey?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json(
        { error: 'invalid_request', error_description: 'Invalid JSON body' },
        400
      );
    }

    const { backlogDomain, apiKey } = body;
    if (
      !backlogDomain ||
      !apiKey ||
      typeof backlogDomain !== 'string' ||
      typeof apiKey !== 'string'
    ) {
      return c.json(
        {
          error: 'invalid_request',
          error_description:
            'Both backlogDomain and apiKey are required as strings',
        },
        400
      );
    }

    if (!isValidBacklogDomain(backlogDomain)) {
      return c.json(
        {
          error: 'invalid_request',
          error_description:
            'backlogDomain must be a valid Backlog domain (e.g. example.backlog.jp, example.backlog.com, example.backlogtool.com)',
        },
        400
      );
    }

    try {
      const backlog = new Backlog({ host: backlogDomain, apiKey });
      const user = await backlog.getMyself();
      logger.info(
        { userId, backlogDomain, backlogUserId: user.id },
        'Verified Backlog API key'
      );
    } catch {
      logger.warn({ userId, backlogDomain }, 'Backlog API key verification failed');
      return c.json(
        {
          error: 'invalid_api_key',
          error_description:
            'Could not verify the API key against Backlog API. Check the domain and key.',
        },
        400
      );
    }

    await vault.putApiKey(userId, backlogDomain, apiKey);
    logger.info({ userId, backlogDomain }, 'Registered Backlog API key');

    return c.json({ status: 'registered', backlogDomain }, 201);
  });

  app.get('/api/keys', async (c) => {
    const userId = c.get('userId' as never) as string;
    const domains = await vault.listDomains(userId);
    return c.json({ domains });
  });

  app.delete('/api/keys/:domain', async (c) => {
    const userId = c.get('userId' as never) as string;
    const domain = c.req.param('domain');
    await vault.deleteApiKey(userId, domain);
    logger.info({ userId, backlogDomain: domain }, 'Deleted Backlog API key');
    return c.json({ status: 'deleted', backlogDomain: domain });
  });

  return app;
}
