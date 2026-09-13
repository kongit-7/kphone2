import React, { useEffect, useState } from 'react';
import { useOS } from '../context/OSContext';
import { getLifeExperiences, getLifeContactDecisions, runLifeTick, type LifeExperience, type LifeContactDecision } from '../utils/lifeRuntime';

const KphoneLifeApp: React.FC = () => {
  const { closeApp } = useOS();
  const [experiences, setExperiences] = useState<LifeExperience[]>([]);
  const [contacts, setContacts] = useState<LifeContactDecision[]>([]);
  const [running, setRunning] = useState(false);

  const refresh = () => {
    setExperiences(getLifeExperiences().slice(-100).reverse());
    setContacts(getLifeContactDecisions().slice(-100).reverse());
  };

  useEffect(() => {
    refresh();
    const onExperience = () => refresh();
    const onDecision = () => refresh();
    window.addEventListener('kphone-life-experience', onExperience);
    window.addEventListener('kphone-life-contact-decision', onDecision);
    return () => {
      window.removeEventListener('kphone-life-experience', onExperience);
      window.removeEventListener('kphone-life-contact-decision', onDecision);
    };
  }, []);

  const runNow = async () => {
    setRunning(true);
    try { await runLifeTick(true); refresh(); } finally { setRunning(false); }
  };

  const decisionByExperience = new Map(contacts.map(x => [x.experienceId, x]));

  return (
    <div className="h-full w-full bg-[#f6f5f2] text-slate-800 flex flex-col">
      <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-black/5 bg-white/70 backdrop-blur-xl">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Kphone Life</div>
          <h1 className="text-xl font-semibold mt-1">他们刚刚在做什么</h1>
          <p className="text-xs text-slate-400 mt-1">角色在你没有聊天时留下的生活痕迹</p>
        </div>
        <button onClick={closeApp} className="text-xs px-3 py-2 rounded-full bg-black/5">关闭</button>
      </div>

      <div className="px-5 py-3 bg-white/50 flex gap-2">
        <button disabled={running} onClick={runNow} className="px-4 py-2 rounded-full bg-slate-900 text-white text-xs disabled:opacity-50">
          {running ? '正在生活…' : '现在让他们活动一下'}
        </button>
        <button onClick={refresh} className="px-4 py-2 rounded-full bg-black/5 text-xs">刷新</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {experiences.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-16">还没有生活记录。可以点上面的按钮，让角色现在开始活动。</div>
        )}
        {experiences.map(item => {
          const decision = decisionByExperience.get(item.id);
          return (
            <div key={item.id} className="bg-white rounded-3xl p-4 shadow-sm border border-black/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-400">{item.charName} · {new Date(item.createdAt).toLocaleString()}</div>
                  <div className="font-medium mt-1">{item.title}</div>
                  <div className="text-sm text-slate-600 mt-1 leading-6">{item.detail}</div>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-500">{item.activity}</span>
              </div>
              {decision && (
                <div className="mt-3 pt-3 border-t border-black/5 text-xs">
                  <span className={decision.shouldContact ? 'text-emerald-600' : 'text-slate-400'}>
                    {decision.shouldContact ? '💬 决定联系你' : '· 没有打扰你'}
                  </span>
                  {decision.draftMessage && <div className="mt-1 text-slate-600">“{decision.draftMessage}”</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KphoneLifeApp;
