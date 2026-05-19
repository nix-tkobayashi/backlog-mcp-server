import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
  type KMSClientConfig,
} from '@aws-sdk/client-kms';

export type ApiKeyVaultConfig = {
  tableName: string;
  kmsKeyId: string;
  region: string;
};

type CacheEntry = {
  apiKey: string;
  expiresAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

export class ApiKeyVault {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly kmsClient: KMSClient;
  private readonly tableName: string;
  private readonly kmsKeyId: string;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    config: ApiKeyVaultConfig,
    dynamoConfig?: DynamoDBClientConfig,
    kmsConfig?: KMSClientConfig
  ) {
    this.tableName = config.tableName;
    this.kmsKeyId = config.kmsKeyId;

    const dynamoClient = new DynamoDBClient(
      dynamoConfig ?? { region: config.region }
    );
    this.docClient = DynamoDBDocumentClient.from(dynamoClient);
    this.kmsClient = new KMSClient(kmsConfig ?? { region: config.region });
  }

  async getApiKey(
    userId: string,
    backlogDomain: string
  ): Promise<string | undefined> {
    const cacheKey = `${userId}:${backlogDomain}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.apiKey;
    }

    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { userId, backlogDomain },
      })
    );

    if (!result.Item?.encryptedApiKey) return undefined;

    const decrypted = await this.kmsClient.send(
      new DecryptCommand({
        CiphertextBlob: result.Item.encryptedApiKey,
        EncryptionContext: { userId, backlogDomain },
      })
    );

    if (!decrypted.Plaintext) return undefined;
    const apiKey = new TextDecoder().decode(decrypted.Plaintext);

    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(cacheKey, {
      apiKey,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return apiKey;
  }

  async putApiKey(
    userId: string,
    backlogDomain: string,
    apiKey: string
  ): Promise<void> {
    const encrypted = await this.kmsClient.send(
      new EncryptCommand({
        KeyId: this.kmsKeyId,
        Plaintext: new TextEncoder().encode(apiKey),
        EncryptionContext: { userId, backlogDomain },
      })
    );

    if (!encrypted.CiphertextBlob) {
      throw new Error('KMS encryption returned empty ciphertext');
    }

    const now = new Date().toISOString();
    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          userId,
          backlogDomain,
          encryptedApiKey: encrypted.CiphertextBlob,
          updatedAt: now,
          createdAt: now,
        },
      })
    );

    const cacheKey = `${userId}:${backlogDomain}`;
    this.cache.set(cacheKey, {
      apiKey,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  async deleteApiKey(
    userId: string,
    backlogDomain: string
  ): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { userId, backlogDomain },
      })
    );

    this.cache.delete(`${userId}:${backlogDomain}`);
  }

  async listDomains(userId: string): Promise<string[]> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ProjectionExpression: 'backlogDomain',
      })
    );

    return (result.Items ?? []).map((item) => item.backlogDomain as string);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
