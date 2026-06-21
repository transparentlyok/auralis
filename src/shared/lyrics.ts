export interface SyncedLyricLine {
  time: number;
  text: string;
}

export function parseSyncedLyrics(value: string | undefined): SyncedLyricLine[] {
  if (!value) return [];
  const lines: SyncedLyricLine[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const stamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?]/g)];
    if (!stamps.length) continue;
    const text = rawLine.replace(/\[[^\]]+]/g, '').trim();
    for (const stamp of stamps) {
      const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
      lines.push({ time: (Number(stamp[1]) * 60 + Number(stamp[2]) + fraction) * 1000, text });
    }
  }
  return lines.sort((left, right) => left.time - right.time);
}
