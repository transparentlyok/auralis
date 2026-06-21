import type { IpcMainInvokeEvent } from 'electron';

export type IpcHandler<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  event: IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<TResult> | TResult;

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
}

export interface SoundCloudCredentials {
  clientId: string;
  clientSecret: string;
}

export interface StoredSecretEnvelope {
  version: 1;
  encoding: 'base64';
  data: string;
}
