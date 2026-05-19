// Copyright (c) 2025 Nulab inc.
// Licensed under the MIT License.

import type { MiddlewareHandler } from 'hono';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthConfigResolver } from './backlogOAuthConfig.js';
import { verifyBacklogToken } from './backlogOAuthClient.js';
import type { TokenStore } from './tokenStore.js';
import type { CognitoJwtVerifier } from './cognitoJwtVerifier.js';
import type { ApiKeyVault } from './apiKeyVault.js';
import { isValidBacklogDomain } from './backlogDomainValidator.js';
import { logger } from '../utils/logger.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

function isJwtToken(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export function createBearerAuthMiddleware(
  store: TokenStore,
  resolver: OAuthConfigResolver,
  mcpPath: string,
  cognitoVerifier?: CognitoJwtVerifier,
  apiKeyVault?: ApiKeyVault
): MiddlewareHandler {
  const prmPath = mcpPath === '/' ? '' : mcpPath;

  function buildResourceMetadataUrl(host: string): string {
    const config = resolver.resolve(host);
    const baseUrl = config?.serverBaseUrl ?? `https://${host.split(':')[0]}`;
    return `${baseUrl}/.well-known/oauth-protected-resource${prmPath}`;
  }

  return async (c, next) => {
    const host = c.req.header('host') ?? '';
    const resourceMetadataUrl = buildResourceMetadataUrl(host);
    const authHeader = c.req.header('authorization');

    if (!authHeader) {
      c.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${resourceMetadataUrl}"`
      );
      return c.json(
        {
          error: 'invalid_token',
          error_description: 'Missing Authorization header',
        },
        401
      );
    }

    const [type, mcpToken] = authHeader.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !mcpToken) {
      c.header(
        'WWW-Authenticate',
        `Bearer error="invalid_token", error_description="Invalid Authorization header format", resource_metadata="${resourceMetadataUrl}"`
      );
      return c.json(
        { error: 'invalid_token', error_description: 'Expected Bearer token' },
        401
      );
    }

    const tokenEntry = store.getMcpToken(mcpToken);

    if (!tokenEntry && cognitoVerifier && apiKeyVault && isJwtToken(mcpToken)) {
      return handleCognitoAuth(
        c,
        next,
        mcpToken,
        cognitoVerifier,
        apiKeyVault
      );
    }
    if (!tokenEntry) {
      c.header(
        'WWW-Authenticate',
        `Bearer error="invalid_token", error_description="Unknown or expired token", resource_metadata="${resourceMetadataUrl}"`
      );
      return c.json(
        {
          error: 'invalid_token',
          error_description: 'Unknown or expired token',
        },
        401
      );
    }

    const hostConfig = resolver.resolve(host);
    if (hostConfig && tokenEntry.backlogDomain !== hostConfig.backlogDomain) {
      c.header(
        'WWW-Authenticate',
        `Bearer error="invalid_token", error_description="Token was issued for a different site", resource_metadata="${resourceMetadataUrl}"`
      );
      return c.json(
        {
          error: 'invalid_token',
          error_description: 'Token was issued for a different site',
        },
        401
      );
    }

    const cached = store.getCachedVerification(mcpToken);
    if (cached) {
      c.set('authInfo', cached);
      c.set('backlogDomain', tokenEntry.backlogDomain);
      await next();
      return;
    }

    try {
      const user = await verifyBacklogToken(
        tokenEntry.backlogDomain,
        tokenEntry.backlogAccessToken
      );
      const authInfo: AuthInfo = {
        token: tokenEntry.backlogAccessToken,
        clientId: String(user.id),
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + CACHE_TTL_MS / 1000,
      };
      store.cacheVerification(mcpToken, authInfo, CACHE_TTL_MS);
      c.set('authInfo', authInfo);
      c.set('backlogDomain', tokenEntry.backlogDomain);
      await next();
    } catch (err) {
      logger.warn({ err }, 'Bearer token verification failed');
      c.header(
        'WWW-Authenticate',
        `Bearer error="invalid_token", error_description="Token verification failed", resource_metadata="${resourceMetadataUrl}"`
      );
      return c.json(
        {
          error: 'invalid_token',
          error_description: 'Token verification failed',
        },
        401
      );
    }
  };
}

export function createCognitoOnlyAuthMiddleware(
  verifier: CognitoJwtVerifier,
  vault: ApiKeyVault
): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header('authorization');
    if (!authHeader) {
      return c.json(
        {
          error: 'invalid_token',
          error_description: 'Missing Authorization header',
        },
        401
      );
    }

    const [type, token] = authHeader.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) {
      return c.json(
        { error: 'invalid_token', error_description: 'Expected Bearer token' },
        401
      );
    }

    return handleCognitoAuth(c, next, token, verifier, vault);
  };
}

async function handleCognitoAuth(
  c: Parameters<MiddlewareHandler>[0],
  next: Parameters<MiddlewareHandler>[1],
  token: string,
  verifier: CognitoJwtVerifier,
  vault: ApiKeyVault
): Promise<Response | void> {
  let claims;
  try {
    claims = await verifier(token);
  } catch (err) {
    logger.warn({ err }, 'Cognito JWT verification failed');
    return c.json(
      {
        error: 'invalid_token',
        error_description: 'JWT verification failed',
      },
      401
    );
  }

  const userId = claims.sub;
  const backlogDomain = c.req.header('x-backlog-domain');

  if (backlogDomain && !isValidBacklogDomain(backlogDomain)) {
    return c.json(
      {
        error: 'invalid_request',
        error_description:
          'X-Backlog-Domain must be a valid Backlog domain (e.g. example.backlog.jp)',
      },
      400
    );
  }

  let resolvedDomain = backlogDomain;
  if (!resolvedDomain) {
    const domains = await vault.listDomains(userId);
    if (domains.length === 1) {
      resolvedDomain = domains[0];
    } else if (domains.length === 0) {
      return c.json(
        {
          error: 'api_key_not_registered',
          error_description:
            'No Backlog API key registered. Use POST /api/keys to register one.',
        },
        403
      );
    } else {
      return c.json(
        {
          error: 'domain_required',
          error_description:
            'Multiple domains registered. Set X-Backlog-Domain header.',
          registered_domains: domains,
        },
        400
      );
    }
  }

  const apiKey = await vault.getApiKey(userId, resolvedDomain);
  if (!apiKey) {
    return c.json(
      {
        error: 'api_key_not_registered',
        error_description: `No API key registered for domain: ${resolvedDomain}. Use POST /api/keys to register one.`,
      },
      403
    );
  }

  const authInfo: AuthInfo = {
    token,
    clientId: userId,
    scopes: [],
    expiresAt: typeof claims.exp === 'number' ? claims.exp : 0,
  };

  c.set('authInfo', authInfo);
  c.set('backlogDomain', resolvedDomain);
  c.set('authMode', 'cognito');
  c.set('backlogApiKey', apiKey);
  await next();
}
