import React from 'react';
import { ActiveTab, SessionStats } from '../types/seo';
import {
  LayoutDashboard,
  Search,
  ShieldAlert,
  FileDown,
  Activity,
  ShieldCheck,
  Lock,
  Sparkles,
  Cpu,
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  stats: SessionStats;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab, stats }) => {
  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'seo' as ActiveTab,
      label: 'SEO',
      icon: Search,
      badge: stats.pendingChanges > 0 ? `${stats.pendingChanges} pendientes` : null,
      badgeColor: 'bg-[#6012C3] text-white',
    },
    {
      id: 'audit' as ActiveTab,
      label: 'Auditoría',
      icon: ShieldAlert,
      badge: null,
    },
    {
      id: 'alt_text' as ActiveTab,
      label: 'Alt Text AI',
      icon: Sparkles,
      badge: 'Nuevo',
      badgeColor: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    },
    {
      id: 'ai_settings' as ActiveTab,
      label: 'Configuración de IA',
      icon: Cpu,
      badge: null,
    },
    {
      id: 'templates' as ActiveTab,
      label: 'Plantillas',
      icon: FileDown,
      badge: null,
    },
    {
      id: 'logs' as ActiveTab,
      label: 'Historial de sesión',
      icon: Activity,
      badge: stats.processed > 0 ? `${stats.processed}` : null,
      badgeColor: 'bg-slate-200 text-slate-700',
    },
  ];

  return (
    <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 p-4">
      <div className="space-y-1">
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Navegación
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#6012C3] text-white shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : item.badgeColor
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Security disclaimer box required by specs */}
      <div className="mt-8 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
        <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
          <ShieldCheck className="w-4 h-4 text-[#6012C3]" />
          <span>Privacidad Estricta</span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Tus credenciales de Shopify se mantienen únicamente en <strong>memoria RAM</strong> durante la sesión activa. No se almacenan en bases de datos, cookies ni discos.
        </p>
        <div className="flex items-center space-x-1 text-[10px] text-slate-400">
          <Lock className="w-3 h-3" />
          <span>API Keys de IA en RAM • Sin persistencia externa</span>
        </div>
      </div>
    </aside>
  );
};
