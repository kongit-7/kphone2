import { DB } from './db';
import type { CharacterProfile } from '../types';

/**
 * Kphone Life Runtime v0.1
 *
 * Deliberately sits above SullyOS' existing activity/chat systems.  This first
 * version does not call an LLM and never sends a message by itself.  It gives
 * each character a small amount of background time, records a lightweight
 * Experience, and exposes the result through a DOM event/local storage so the
 * future Life UI and LLM-driven Thought/Contact layers can consume it.
 *
 * Design goals:
 * - no API calls just to keep a character "alive"
 * - no automatic messages or notifications in v0.1
 * - one character can only receive one experience per runtime tick
 * - quiet/cooldown rules prevent spam
 * - easy to replace the activity selector with an LLM later
 */

export type LifeActivity =
  | 'rest'
  | 'browse'
  | 'read'
  | 'listen'
  | 'reflect';

export interface LifeExperience {
  id: string;
  charId: string;
  charName: string;
  createdAt: number;
  activity: LifeActivity;
  title: string;
  detail: string;
  visibility: 'private';
  source: 'life-runtime-v0.1';
}

export interface LifeRuntimeSettings {
  enabled: boolean;
  intervalMinutes: number;
  maxExperiencesPerDay: number;
  quietStart: number;
  quietEnd: number;
}

const SETTINGS_KEY = 'kphone.life.runtime.settings.v1';
const EXPERIENCES_KEY = 'kphone.life.runtime.experiences.v1';
const LAST_RUN_KEY = 'kphone.life.runtime.lastRun.v1';
const MAX_STORED_EXPERIENCES = 300;

const DEFAULT_SETTINGS: LifeRuntimeSettings = {
  enabled: true,
  intervalMinutes: 30,
  maxExperiencesPerDay: 3,
  quietStart: 0,
  quietEnd: 7,
};

const ACTIVITY_TEMPLATES: Record<LifeActivity, Array<{ title: string; detail: string }>> = {
  rest: [
    { title: 'Taking a quiet break', detail: 'Spent some unhurried time doing nothing in particular.' },
    { title: 'A little downtime', detail: 'Took a break and let the moment pass without doing anything productive.' },
  ],
  browse: [
    { title: 'Browsing for a while', detail: 'Spent some time casually looking around online.' },
    { title: 'Caught up on a few things', detail: 'Browsed through a few interesting things that happened recently.' },
  ],
  read: [
    { title: 'Read for a while', detail: 'Settled down with something to read and spent some quiet time with it.' },
    { title: 'Picked up some reading', detail: 'Read a few pages before moving on with the day.' },
  ],
  listen: [
    { title: 'Listened to some music', detail: 'Put on some music and spent a little time listening.' },
    { title: 'Had some music on', detail: 'Spent a quiet stretch of time with music playing in the background.' },
  ],
  reflect: [
    { title: 'Had some time to think', detail: 'Spent a little time alone with their thoughts.' },
    { title: 'A quiet moment', detail: 'Paused for a while and reflected on the day.' },
  ],
};

const readSettings = (): LifeRuntimeSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

const readExperiences = (): LifeExperience[] => {
  try {
    const raw = localStorage.getItem(EXPERIENCES_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const writeExperiences = (items: LifeExperience[]) => {
  try {
    localStorage.setItem(EXPERIENCES_KEY, JSON.stringify(items.slice(-MAX_STORED_EXPERIENCES)));
  } catch {
    // Life history is intentionally non-critical; never break the phone for it.
  }
};

const inQuietHours = (date: Date, settings: LifeRuntimeSettings): boolean => {
  const hour = date.getHours();
  if (settings.quietStart === settings.quietEnd) return false;
  if (settings.quietStart < settings.quietEnd) {
    return hour >= settings.quietStart && hour < settings.quietEnd;
  }
  return hour >= settings.quietStart || hour < settings.quietEnd;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const chooseActivity = (character: CharacterProfile, now: Date): LifeActivity => {
  // v0.1 is intentionally deterministic enough to feel calm rather than random
  // spam.  A future LLM decision layer can replace this selector.
  const seed = `${character.id}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}:${now.getHours()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const hour = now.getHours();
  if (hour < 9) return 'rest';
  if (hour >= 23) return 'reflect';
  const options: LifeActivity[] = ['browse', 'read', 'listen', 'reflect', 'rest'];
  return options[Math.abs(hash) % options.length];
};

const buildExperience = (character: CharacterProfile, activity: LifeActivity, now: number): LifeExperience => {
  const templates = ACTIVITY_TEMPLATES[activity];
  const template = templates[Math.floor(Math.random() * templates.length)];
  return {
    id: `life-${character.id}-${now}-${Math.random().toString(36).slice(2, 8)}`,
    charId: character.id,
    charName: character.name || 'Character',
    createdAt: now,
    activity,
    title: template.title,
    detail: template.detail,
    visibility: 'private',
    source: 'life-runtime-v0.1',
  };
};

const canRunForCharacter = (character: CharacterProfile, experiences: LifeExperience[], now: number, settings: LifeRuntimeSettings) => {
  const today = startOfToday();
  const todayCount = experiences.filter(item => item.charId === character.id && item.createdAt >= today).length;
  if (todayCount >= settings.maxExperiencesPerDay) return false;
  const last = experiences.filter(item => item.charId === character.id).at(-1);
  if (last && now - last.createdAt < settings.intervalMinutes * 60_000) return false;
  return true;
};

export const getLifeRuntimeSettings = (): LifeRuntimeSettings => readSettings();

export const saveLifeRuntimeSettings = (updates: Partial<LifeRuntimeSettings>) => {
  const next = { ...readSettings(), ...updates };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('kphone-life-settings-changed', { detail: next }));
  return next;
};

export const getLifeExperiences = (charId?: string): LifeExperience[] => {
  const items = readExperiences();
  return charId ? items.filter(item => item.charId === charId) : items;
};

export const runLifeTick = async (): Promise<LifeExperience[]> => {
  if (typeof window === 'undefined') return [];
  const settings = readSettings();
  if (!settings.enabled) return [];

  const nowDate = new Date();
  if (inQuietHours(nowDate, settings)) return [];

  const now = Date.now();
  const previousRun = Number(localStorage.getItem(LAST_RUN_KEY) || 0);
  if (previousRun && now - previousRun < settings.intervalMinutes * 60_000) return [];
  localStorage.setItem(LAST_RUN_KEY, String(now));

  let characters: CharacterProfile[] = [];
  try {
    characters = await DB.getAllCharacters();
  } catch (error) {
    console.warn('[Kphone Life] unable to read characters', error);
    return [];
  }

  const experiences = readExperiences();
  const created: LifeExperience[] = [];

  // One experience per character per tick.  No LLM call, no chat message.
  for (const character of characters) {
    if (!canRunForCharacter(character, experiences, now, settings)) continue;
    const activity = chooseActivity(character, nowDate);
    created.push(buildExperience(character, activity, now));
  }

  if (created.length === 0) return [];
  const next = [...experiences, ...created].slice(-MAX_STORED_EXPERIENCES);
  writeExperiences(next);

  for (const experience of created) {
    window.dispatchEvent(new CustomEvent('kphone-life-experience', { detail: experience }));
  }

  return created;
};

let runtimeTimer: number | null = null;

export const startLifeRuntime = () => {
  if (typeof window === 'undefined' || runtimeTimer !== null) return () => undefined;

  const schedule = () => {
    const settings = readSettings();
    const delay = Math.max(60_000, settings.intervalMinutes * 60_000);
    runtimeTimer = window.setTimeout(async () => {
      runtimeTimer = null;
      try {
        await runLifeTick();
      } catch (error) {
        console.warn('[Kphone Life] tick failed', error);
      }
      schedule();
    }, delay);
  };

  // Run once after startup; the cooldown makes reloads harmless.
  void runLifeTick().catch(error => console.warn('[Kphone Life] initial tick failed', error));
  schedule();

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void runLifeTick().catch(error => console.warn('[Kphone Life] visibility tick failed', error));
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    if (runtimeTimer !== null) {
      window.clearTimeout(runtimeTimer);
      runtimeTimer = null;
    }
    document.removeEventListener('visibilitychange', onVisibility);
  };
};
