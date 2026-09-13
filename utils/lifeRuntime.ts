import { DB } from './db';
import type { CharacterProfile } from '../types';

/**
 * Kphone Life Runtime v0.2
 *
 * A character's proactive message is a consequence of its background life:
 * activity -> Experience -> (optional) Thought/Contact Decision.
 *
 * This layer intentionally keeps the Experience history separate from chat
 * storage. The contact decision is emitted as an event so the existing chat /
 * ActiveMsg pipeline can consume it without creating a second chat database.
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
  source: 'life-runtime-v0.2';
}

export interface LifeContactDecision {
  id: string;
  charId: string;
  charName: string;
  experienceId: string;
  createdAt: number;
  shouldContact: boolean;
  reason: string;
  draftMessage?: string;
  source: 'life-runtime-v0.2';
}

export interface LifeRuntimeSettings {
  enabled: boolean;
  intervalMinutes: number;
  maxExperiencesPerDay: number;
  quietStart: number;
  quietEnd: number;
  proactiveEnabled: boolean;
  contactCooldownMinutes: number;
}

// v2 deliberately drops the old default quiet-hours behaviour (00:00-07:00).
// Existing v1 settings are not migrated so a fresh default is genuinely 24/7.
const SETTINGS_KEY = 'kphone.life.runtime.settings.v2';
const EXPERIENCES_KEY = 'kphone.life.runtime.experiences.v2';
const CONTACTS_KEY = 'kphone.life.runtime.contacts.v1';
const LAST_RUN_KEY = 'kphone.life.runtime.lastRun.v2';

const DEFAULT_SETTINGS: LifeRuntimeSettings = {
  enabled: true,
  intervalMinutes: 30,
  maxExperiencesPerDay: 3,
  quietStart: 0,
  quietEnd: 0,
  proactiveEnabled: true,
  contactCooldownMinutes: 120,
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

const CONTACT_DRAFTS: Record<LifeActivity, string[]> = {
  rest: ['Had a little downtime just now.', 'Finally got a quiet minute.'],
  browse: ['I was looking around online for a bit and found something interesting.', 'Been browsing for a while. Thought I’d tell you.'],
  read: ['I just spent a little time reading. It was actually nice to slow down for a bit.', 'Picked up something to read for a while.'],
  listen: ['I had some music on for a bit. Kinda nice.', 'Been listening to music for a while.'],
  reflect: ['Was just sitting here thinking for a bit.', 'Had a random quiet moment and started thinking about things.'],
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
    // No artificial application-level cap. The browser's own storage quota is
    // the only limit; history is therefore retained rather than silently lost.
    localStorage.setItem(EXPERIENCES_KEY, JSON.stringify(items));
  } catch {
    console.warn('[Kphone Life] unable to persist experience history');
  }
};

const readContacts = (): LifeContactDecision[] => {
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

const writeContacts = (items: LifeContactDecision[]) => {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(items));
  } catch {
    console.warn('[Kphone Life] unable to persist contact history');
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
    source: 'life-runtime-v0.2',
  };
};

const shouldContact = (
  character: CharacterProfile,
  experience: LifeExperience,
  contacts: LifeContactDecision[],
  settings: LifeRuntimeSettings,
  now: number,
): boolean => {
  if (!settings.proactiveEnabled) return false;
  const recent = contacts
    .filter(item => item.charId === character.id && item.shouldContact)
    .at(-1);
  if (recent && now - recent.createdAt < settings.contactCooldownMinutes * 60_000) return false;

  // Contact is deliberately a decision, not a timer. Some activities are more
  // naturally shareable than others. The deterministic seed prevents repeated
  // reloads from changing the decision for the same experience.
  const seed = `${experience.id}:${character.id}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  const roll = Math.abs(hash) % 100;
  const threshold: Record<LifeActivity, number> = {
    rest: 8,
    browse: 28,
    read: 22,
    listen: 30,
    reflect: 38,
  };
  return roll < threshold[experience.activity];
};

const buildContactDecision = (
  character: CharacterProfile,
  experience: LifeExperience,
  contacts: LifeContactDecision[],
  settings: LifeRuntimeSettings,
  now: number,
): LifeContactDecision => {
  const contact = shouldContact(character, experience, contacts, settings, now);
  const draft = contact
    ? CONTACT_DRAFTS[experience.activity][Math.abs(now) % CONTACT_DRAFTS[experience.activity].length]
    : undefined;
  return {
    id: `life-contact-${experience.id}`,
    charId: character.id,
    charName: character.name || 'Character',
    experienceId: experience.id,
    createdAt: now,
    shouldContact: contact,
    reason: contact
      ? `The experience felt naturally shareable (${experience.activity}).`
      : `The experience did not feel worth interrupting the user for (${experience.activity}).`,
    draftMessage: draft,
    source: 'life-runtime-v0.2',
  };
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

export const getLifeContactDecisions = (charId?: string): LifeContactDecision[] => {
  const items = readContacts();
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
  const contacts = readContacts();
  const created: LifeExperience[] = [];
  const decisions: LifeContactDecision[] = [];

  for (const character of characters) {
    const todayCount = experiences.filter(item => item.charId === character.id && item.createdAt >= startOfToday()).length;
    if (todayCount >= settings.maxExperiencesPerDay) continue;
    const last = experiences.filter(item => item.charId === character.id).at(-1);
    if (last && now - last.createdAt < settings.intervalMinutes * 60_000) continue;

    const experience = buildExperience(character, chooseActivity(character, nowDate), now);
    created.push(experience);
    decisions.push(buildContactDecision(character, experience, contacts, settings, now));
  }

  if (created.length === 0) return [];

  const nextExperiences = [...experiences, ...created];
  writeExperiences(nextExperiences);
  const nextContacts = [...contacts, ...decisions];
  writeContacts(nextContacts);

  for (const experience of created) {
    window.dispatchEvent(new CustomEvent('kphone-life-experience', { detail: experience }));
  }

  for (const decision of decisions) {
    window.dispatchEvent(new CustomEvent('kphone-life-contact-decision', { detail: decision }));
    // Only positive decisions enter the future chat/ActiveMsg bridge. Negative
    // decisions are still stored so the character's restraint is observable.
    if (decision.shouldContact) {
      window.dispatchEvent(new CustomEvent('kphone-life-contact', { detail: decision }));
    }
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