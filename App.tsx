
import React from 'react';
import { OSProvider } from './context/OSContext';
import { MusicProvider } from './context/MusicContext';
import PhoneShell from './components/PhoneShell';
import BuildBadge from './components/BuildBadge';
import DevDebugPanel from './components/DevDebugPanel';
import Amsg2DebugPanel from './components/Amsg2DebugPanel';
import VRBroadcast from './components/VRBroadcast';
import WorldBroadcast from './components/WorldBroadcast';
import ChatBroadcast from './components/ChatBroadcast';
import { isIOSStandaloneWebApp } from './utils/iosStandalone';
import { installDevDebugLifecycleCapture } from './utils/devDebug';
import { startLifeRuntime } from './utils/lifeRuntimeV3';
import KphoneLifeApp from './apps/KphoneLifeApp';

const App: React.FC = () => {
  const [showLife, setShowLife] = React.useState(false);
  const [lifePulse, setLifePulse] = React.useState(0);

  React.useEffect(() => { installDevDebugLifecycleCapture(); }, []);

  React.useEffect(() => {
    return startLifeRuntime();
  }, []);

  React.useEffect(() => {
    const onLife = () => setLifePulse(x => x + 1);
    window.addEventListener('kphone-life-experience', onLife);
    return () => window.removeEventListener('kphone-life-experience', onLife);
  }, []);

  const useAbsoluteShell = typeof window !== 'undefined' && isIOSStandaloneWebApp();
  const shellClassName = useAbsoluteShell
    ? 'fixed inset-0 w-full h-full bg-transparent overflow-hidden'
    : 'relative w-full bg-transparent overflow-hidden';
  const shellStyle = { height: 'var(--app-height, 100lvh)', minHeight: 'var(--app-height, 100lvh)' };

  return (
    <>
      <div className={shellClassName} style={shellStyle}>
        <div className={`${useAbsoluteShell ? 'absolute' : 'fixed'} inset-0 w-full h-full z-0 bg-transparent`} style={{ transform: 'translateZ(0)' }}>
          <OSProvider>
            <MusicProvider>
              <PhoneShell />
            </MusicProvider>
            <Amsg2DebugPanel />
          </OSProvider>
        </div>
      </div>

      {/* Kphone Life：任何时候都可以打开，直接观察角色在后台留下的生活痕迹。 */}
      <button
        onClick={() => setShowLife(true)}
        aria-label="打开角色生活记录"
        className="fixed right-4 bottom-4 z-[8000] w-12 h-12 rounded-full bg-white/90 backdrop-blur-xl shadow-lg border border-black/5 text-lg active:scale-95 transition-transform"
      >
        {lifePulse > 0 ? '✨' : '☁️'}
        {lifePulse > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">{Math.min(lifePulse,99)}</span>}
      </button>

      {showLife && (
        <div className="fixed inset-0 z-[9000] bg-black/25 backdrop-blur-sm p-3 sm:p-6 flex items-stretch sm:items-center justify-center">
          <div className="w-full max-w-md h-full sm:h-[min(760px,92vh)] rounded-[2rem] overflow-hidden shadow-2xl border border-white/40 bg-white">
            <KphoneLifeApp onClose={() => setShowLife(false)} />
          </div>
        </div>
      )}

      <BuildBadge />
      <DevDebugPanel />
      <VRBroadcast />
      <WorldBroadcast />
      <ChatBroadcast />
    </>
  );
};

export default App;
