import * as repo from '../db/repo';

/** Admin settings. Defaults are conservative; the admin page (M8) edits them. */
export interface AppSettings {
  /** Add the precedent-conflict label when a high-confidence conflict is found. */
  labelConflicts: boolean;
  /** Post one comment per issue naming the conflicting decision. Off by default. */
  commentOnConflict: boolean;
  /** Extra aliases per keyword, e.g. { redis: ["valkey"] }. */
  aliases: Record<string, string[]>;
  /** Teamwork Graph context in panels and the agent. */
  graphContext: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  labelConflicts: true,
  commentOnConflict: false,
  aliases: {},
  graphContext: true,
};

export async function loadSettings(): Promise<AppSettings> {
  const stored = await repo.getSetting<Partial<AppSettings>>('app', {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await loadSettings()), ...patch };
  await repo.setSetting('app', next);
  return next;
}
