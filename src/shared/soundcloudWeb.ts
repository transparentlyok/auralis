export interface SoundCloudWebApiContext {
  clientId: string;
  appVersion: string;
  userId?: number | string;
}

export function soundcloudTrackLikePath(userId: string | number, trackId: string | number): string {
  return `/users/${encodeURIComponent(String(userId))}/track_likes/${encodeURIComponent(String(trackId))}`;
}

export function extractSoundCloudWebApiContext(source: string): SoundCloudWebApiContext | undefined {
  const prefix = 'window.__sc_hydration = ';
  const start = source.indexOf(prefix);
  if (start < 0) return undefined;
  const end = source.lastIndexOf(';');
  try {
    const hydration = JSON.parse(source.slice(start + prefix.length, end > start ? end : undefined)) as Array<{
      hydratable?: string;
      data?: { id?: unknown; user?: { id?: unknown } };
    }>;
    const clientId = hydration.find((item) => item?.hydratable === 'apiClient')?.data?.id;
    const appVersion = source.match(/"appVersion":"(\d+)"/)?.[1];
    if (typeof clientId !== 'string' || !/^[A-Za-z0-9]{32}$/.test(clientId) || !appVersion) return undefined;
    const me = hydration.find((item) => item?.hydratable === 'me' || item?.hydratable === 'currentUser')?.data;
    const userId = me?.id ?? me?.user?.id;
    return {
      clientId,
      appVersion,
      userId: typeof userId === 'number' || typeof userId === 'string' ? userId : undefined
    };
  } catch {
    return undefined;
  }
}
