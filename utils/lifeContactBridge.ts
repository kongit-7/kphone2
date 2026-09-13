import { DB } from './db';
import type { LifeContactDecision } from './lifeRuntimeV3';

const SENT_KEY = 'kphone.life.runtime.sentContacts.v1';

const readSent = (): string[] => {
  try { const x = JSON.parse(localStorage.getItem(SENT_KEY) || '[]'); return Array.isArray(x) ? x : []; } catch { return []; }
};
const markSent = (id:string) => {
  const next = [...readSent(), id];
  try { localStorage.setItem(SENT_KEY, JSON.stringify(next.slice(-1000))); } catch { /* chat delivery is still attempted */ }
};

export const deliverLifeContact = async (decision: LifeContactDecision) => {
  if (!decision.shouldContact || !decision.draftMessage || typeof window === 'undefined') return;
  if (readSent().includes(decision.id)) return;
  try {
    // Use the existing message store. `as any` keeps this bridge tolerant of
    // additional Message fields added by upstream SullyOS versions.
    await DB.saveMessage({
      charId: decision.charId,
      role: 'assistant',
      type: 'text',
      content: decision.draftMessage,
      metadata: { source: 'kphone-life', lifeExperienceId: decision.experienceId, autonomous: true },
      timestamp: decision.createdAt,
    } as any);
    markSent(decision.id);
    window.dispatchEvent(new CustomEvent('kphone-life-message-delivered', { detail: decision }));
    window.dispatchEvent(new CustomEvent('active-msg-open', { detail: { charId: decision.charId, source: 'kphone-life' } }));
  } catch (e) {
    console.warn('[Kphone Life] autonomous contact could not be delivered', e);
  }
};

export const installLifeContactBridge = () => {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => { void deliverLifeContact((event as CustomEvent<LifeContactDecision>).detail); };
  window.addEventListener('kphone-life-contact', handler);
  return () => window.removeEventListener('kphone-life-contact', handler);
};
