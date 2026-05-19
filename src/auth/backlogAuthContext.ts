// Copyright (c) 2025 Nulab inc.
// Licensed under the MIT License.

import { AsyncLocalStorage } from 'node:async_hooks';

type BacklogAuthContext =
  | { mode: 'oauth'; accessToken: string; backlogDomain: string }
  | { mode: 'apiKey'; apiKey: string; backlogDomain: string };

const authContextStorage = new AsyncLocalStorage<
  BacklogAuthContext | undefined
>();

export function runWithOAuthContext<T>(
  accessToken: string,
  backlogDomain: string,
  fn: () => Promise<T>
): Promise<T> {
  return authContextStorage.run(
    { mode: 'oauth', accessToken, backlogDomain },
    fn
  );
}

export function runWithApiKeyContext<T>(
  apiKey: string,
  backlogDomain: string,
  fn: () => Promise<T>
): Promise<T> {
  return authContextStorage.run({ mode: 'apiKey', apiKey, backlogDomain }, fn);
}

export function runWithAccessToken<T>(
  token: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (!token) return authContextStorage.run(undefined, fn);
  const existing = authContextStorage.getStore();
  return authContextStorage.run(
    {
      mode: 'oauth',
      accessToken: token,
      backlogDomain: existing?.backlogDomain ?? '',
    },
    fn
  );
}

export function getCurrentAccessToken(): string | undefined {
  const store = authContextStorage.getStore();
  return store?.mode === 'oauth' ? store.accessToken : undefined;
}

export function getCurrentApiKey(): string | undefined {
  const store = authContextStorage.getStore();
  return store?.mode === 'apiKey' ? store.apiKey : undefined;
}

export function getCurrentBacklogDomain(): string | undefined {
  return authContextStorage.getStore()?.backlogDomain;
}

export function getAuthMode(): 'oauth' | 'apiKey' | undefined {
  return authContextStorage.getStore()?.mode;
}
