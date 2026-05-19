import { logger } from '../utils/logger.js';

export type CognitoConfig = {
  userPoolId: string;
  region: string;
  clientId: string;
  dynamoTableName: string;
  kmsKeyId: string;
  jwksUri: string;
  issuer: string;
};

type Environment = Record<string, string | undefined>;

export function getCognitoConfig(
  env: Environment = process.env
): CognitoConfig | undefined {
  const userPoolId = env.COGNITO_USER_POOL_ID;
  if (!userPoolId) return undefined;

  const region = env.COGNITO_REGION;
  const clientId = env.COGNITO_CLIENT_ID;
  const dynamoTableName = env.DYNAMODB_API_KEY_TABLE;
  const kmsKeyId = env.KMS_KEY_ID;

  if (!region || !clientId || !dynamoTableName || !kmsKeyId) {
    throw new Error(
      'COGNITO_USER_POOL_ID is set but one or more required Cognito variables are missing: ' +
        'COGNITO_REGION, COGNITO_CLIENT_ID, DYNAMODB_API_KEY_TABLE, KMS_KEY_ID'
    );
  }

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const jwksUri = `${issuer}/.well-known/jwks.json`;

  logger.info(
    { userPoolId, region, dynamoTableName },
    'Cognito authentication enabled'
  );

  return {
    userPoolId,
    region,
    clientId,
    dynamoTableName,
    kmsKeyId,
    jwksUri,
    issuer,
  };
}
