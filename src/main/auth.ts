import { BrowserWindow, shell } from 'electron';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AppStore } from './store';
import type { SoundCloudCredentials, TokenSet } from './types';
import type { AuthStatus, UserProfile } from '../shared/types';

const AUTH_HOST = '127.0.0.1';
const DEFAULT_AUTH_PORT = 42871;
const SC_AUTH_BASE = 'https://secure.soundcloud.com';
const SC_API_BASE = 'https://api.soundcloud.com';

export class AuthService {
  private appToken?: TokenSet;

  constructor(private readonly store: AppStore) {}

  async status(): Promise<AuthStatus> {
    const credentials = await this.store.getCredentials().catch(() => undefined);
    const tokens = await this.store.getTokens().catch(() => undefined);
    if (!credentials) {
      return {
        authenticated: false,
        credentialsConfigured: false,
        mode: 'mock',
        message: 'SoundCloud credentials are not configured. Mock mode is available.'
      };
    }
    if (!tokens) {
      return {
        authenticated: false,
        credentialsConfigured: true,
        mode: 'mock',
        message: 'Credentials are configured. Log in to access your SoundCloud library.'
      };
    }
    try {
      const accessToken = await this.ensureAccessToken();
      const user = await fetchMe(accessToken);
      return {
        authenticated: true,
        credentialsConfigured: true,
        mode: 'soundcloud',
        user,
        expiresAt: (await this.store.getTokens())?.expiresAt
      };
    } catch (error) {
      return {
        authenticated: false,
        credentialsConfigured: true,
        mode: 'mock',
        message: error instanceof Error ? error.message : 'SoundCloud session could not be restored.'
      };
    }
  }

  async saveCredentials(credentials: SoundCloudCredentials): Promise<AuthStatus> {
    await this.store.saveCredentials(credentials);
    return this.status();
  }

  async login(parentWindow?: BrowserWindow): Promise<AuthStatus> {
    const credentials = await this.requireCredentials();
    const verifier = base64Url(crypto.randomBytes(48));
    const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
    const state = base64Url(crypto.randomBytes(24));
    const port = Number(process.env.AURALIS_AUTH_PORT ?? DEFAULT_AUTH_PORT);
    const redirectUri = `http://${AUTH_HOST}:${port}/soundcloud/callback`;
    const server = await createCallbackServer(port, state);
    try {
      const authUrl = new URL(`${SC_AUTH_BASE}/authorize`);
      authUrl.searchParams.set('client_id', credentials.clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);
      await shell.openExternal(authUrl.toString());
      const code = await server.waitForCode;
      const tokens = await exchangeCode(credentials, redirectUri, code, verifier);
      await this.store.saveTokens(tokens);
      parentWindow?.focus();
      return this.status();
    } finally {
      server.close();
    }
  }

  async logout(): Promise<AuthStatus> {
    const tokens = await this.store.getTokens().catch(() => undefined);
    if (tokens?.accessToken) {
      fetch(`${SC_AUTH_BASE}/sign-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: tokens.accessToken })
      }).catch(() => undefined);
    }
    await this.store.clearTokens();
    return this.status();
  }

  async ensureAccessToken(): Promise<string> {
    const credentials = await this.requireCredentials();
    const tokens = await this.store.getTokens();
    if (!tokens) throw new Error('No SoundCloud session is stored.');
    if (Date.now() < tokens.expiresAt - 60_000) {
      return tokens.accessToken;
    }
    if (!tokens.refreshToken) {
      throw new Error('The SoundCloud session expired. Log in again to continue.');
    }
    const next = await refreshTokens(credentials, tokens.refreshToken);
    await this.store.saveTokens(next);
    return next.accessToken;
  }

  async getAppToken(): Promise<string> {
    const credentials = await this.requireCredentials();
    if (this.appToken && Date.now() < this.appToken.expiresAt - 60_000) {
      return this.appToken.accessToken;
    }
    this.appToken = await clientCredentials(credentials);
    return this.appToken.accessToken;
  }

  private async requireCredentials(): Promise<SoundCloudCredentials> {
    const credentials = await this.store.getCredentials();
    if (!credentials) {
      throw new Error('SoundCloud credentials are missing. Configure SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET or save them in Settings.');
    }
    return credentials;
  }
}

async function fetchMe(accessToken: string): Promise<UserProfile> {
  const response = await fetch(`${SC_API_BASE}/me`, {
    headers: soundcloudHeaders(accessToken)
  });
  if (!response.ok) throw new Error(`SoundCloud /me failed (${response.status}).`);
  const data = await response.json() as Record<string, unknown>;
  return mapUser(data);
}

async function exchangeCode(
  credentials: SoundCloudCredentials,
  redirectUri: string,
  code: string,
  verifier: string
): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    code
  });
  return tokenRequest(body);
}

async function refreshTokens(credentials: SoundCloudCredentials, refreshToken: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken
  });
  return tokenRequest(body);
}

async function clientCredentials(credentials: SoundCloudCredentials): Promise<TokenSet> {
  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const response = await fetch(`${SC_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json; charset=utf-8',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`
    },
    body
  });
  return parseTokenResponse(response);
}

async function tokenRequest(body: URLSearchParams): Promise<TokenSet> {
  const response = await fetch(`${SC_AUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json; charset=utf-8',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  return parseTokenResponse(response);
}

async function parseTokenResponse(response: Response): Promise<TokenSet> {
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : `OAuth request failed (${response.status}).`;
    throw new Error(message);
  }
  const accessToken = String(data.access_token ?? '');
  const refreshToken = typeof data.refresh_token === 'string' && data.refresh_token
    ? data.refresh_token
    : undefined;
  const expiresIn = Number(data.expires_in ?? 3600);
  if (!accessToken) throw new Error('OAuth response did not include an access token.');
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
    scope: typeof data.scope === 'string' ? data.scope : undefined
  };
}

function createCallbackServer(port: number, expectedState: string): Promise<{
  waitForCode: Promise<string>;
  close: () => void;
}> {
  let resolveCode: (code: string) => void;
  let rejectCode: (error: Error) => void;
  const waitForCode = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${AUTH_HOST}:${port}`);
    if (url.pathname !== '/soundcloud/callback') {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || state !== expectedState) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<h1>Auralis login failed</h1><p>State validation failed. Return to the app and try again.</p>');
      rejectCode(new Error('SoundCloud login state validation failed.'));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<h1>Auralis is connected</h1><p>You can return to the desktop app.</p>');
    resolveCode(code);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, AUTH_HOST, () => {
      const address = server.address() as AddressInfo;
      resolve({
        waitForCode,
        close: () => server.close(),
      });
      if (address.port !== port) {
        rejectCode(new Error('Unexpected OAuth callback port.'));
      }
    });
  });
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function soundcloudHeaders(accessToken: string): HeadersInit {
  return {
    Accept: 'application/json; charset=utf-8',
    Authorization: `OAuth ${accessToken}`
  };
}

export function mapUser(data: Record<string, unknown>): UserProfile {
  return {
    id: data.id as number | string,
    username: String(data.username ?? data.permalink ?? 'Unknown user'),
    fullName: typeof data.full_name === 'string' ? data.full_name : undefined,
    avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : undefined,
    permalinkUrl: typeof data.permalink_url === 'string' ? data.permalink_url : undefined,
    followersCount: typeof data.followers_count === 'number' ? data.followers_count : undefined,
    trackCount: typeof data.track_count === 'number' ? data.track_count : undefined
  };
}
