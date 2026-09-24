import React, { useState, useEffect } from 'react';
import { ShopConnectionInfo, SessionStats, ActiveTab } from './types/seo';
import { getSessionStatus, disconnectShopify } from './services/api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ConnectView } from './components/ConnectView';
import { DashboardView } from './components/DashboardView';
import { SEOView } from './components/SEOView';
import { AuditView } from './components/AuditView';
import { TemplatesView } from './components/TemplatesView';
import { SessionLogsView } from './components/SessionLogsView';
import { AltTextView } from './components/AltTextView';
import { AISettingsView } from './components/AISettingsView';

export default function App() {
  const [shop, setShop] = useState<ShopConnectionInfo | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [stats, setStats] = useState<SessionStats>({
    processed: 0,
    found: 0,
    pendingChanges: 0,
    successful: 0,
    errors: 0,
  });
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Check if session exists in memory
  const checkSession = async () => {
    try {
      const res = await getSessionStatus();
      if (res.connected && res.shop) {
        setShop(res.shop);
        if (res.stats) {
          setStats(res.stats);
        }
      } else {
        setShop(null);
      }
    } catch {
      setShop(null);
    } finally {
      setIsCheckingSession(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleDisconnect = async () => {
    try {
      await disconnectShopify();
    } catch {
      // safe fallback
    } finally {
      setShop(null);
      setActiveTab('dashboard');
      setStats({
        processed: 0,
        found: 0,
        pendingChanges: 0,
        successful: 0,
        errors: 0,
      });
    }
  };

  const handleConnected = (newShop: ShopConnectionInfo) => {
    setShop(newShop);
    setActiveTab('dashboard');
    checkSession();
  };

  const refreshStats = async () => {
    try {
      const res = await getSessionStatus();
      if (res.stats) {
        setStats(res.stats);
      }
    } catch {
      // safe fallback
    }
  };

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-3 border-[#6012C3] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Iniciando Doto SEO...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header shop={shop} onDisconnect={handleDisconnect} />

      {!shop ? (
        <main className="flex-1">
          <ConnectView onConnected={handleConnected} />
        </main>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto">
          <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} stats={stats} />

          <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
            {activeTab === 'dashboard' && (
              <DashboardView shop={shop} stats={stats} onNavigate={setActiveTab} />
            )}
            {activeTab === 'seo' && (
              <SEOView shop={shop} onNavigateLogs={() => setActiveTab('logs')} onExecutionCompleted={refreshStats} />
            )}
            {activeTab === 'audit' && (
              <AuditView shop={shop} onNavigateLogs={() => setActiveTab('logs')} onExecutionCompleted={refreshStats} />
            )}
            {activeTab === 'alt_text' && (
              <AltTextView
                shop={shop}
                onNavigateLogs={() => setActiveTab('logs')}
                onNavigateSettings={() => setActiveTab('ai_settings')}
              />
            )}
            {activeTab === 'ai_settings' && <AISettingsView />}
            {activeTab === 'templates' && <TemplatesView />}
            {activeTab === 'logs' && <SessionLogsView />}
          </main>
        </div>
      )}
    </div>
  );
}
