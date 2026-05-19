import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { CognitoConfig } from './cognitoConfig.js';

export type CognitoJwtClaims = JWTPayload & {
  sub: string;
  client_id?: string;
  'cognito:username'?: string;
  email?: string;
  token_use?: 'access' | 'id';
};

export type CognitoJwtVerifier = (token: string) => Promise<CognitoJwtClaims>;

export function createCognitoJwtVerifier(
  config: CognitoConfig
): CognitoJwtVerifier {
  const jwks = createRemoteJWKSet(new URL(config.jwksUri));

  return async (token: string): Promise<CognitoJwtClaims> => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.issuer,
    });

    const claims = payload as CognitoJwtClaims;

    if (claims.token_use !== 'access') {
      throw new Error(
        `JWT token_use must be "access", got "${String(claims.token_use)}"`
      );
    }

    if (claims.client_id !== config.clientId) {
      throw new Error(
        `JWT client_id mismatch: expected ${config.clientId}, got ${String(claims.client_id)}`
      );
    }

    if (!claims.sub) {
      throw new Error('JWT missing sub claim');
    }

    return claims;
  };
}
