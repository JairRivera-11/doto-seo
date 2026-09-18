import React from 'react';
import { SessionStats, ActiveTab, ShopConnectionInfo } from '../types/seo';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Sparkles,
  Layers,
  FileDown,
  ShieldCheck,
  Cpu,
} from 'lucide-react';

interface DashboardViewProps {
  stats: SessionStats;
  shop: ShopConnectionInfo;
  onNavigate: (tab: ActiveTab) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ stats, shop, onNavigate }) => {
  const metricCards = [
    {
      id: 'processed',
      label: 'Productos procesados',
      value: stats.processed,
      icon: Layers,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      border: 'border-indigo-100',
    },
    {
      id: 'found',
      label: 'Productos encontrados',
      value: stats.found,
      icon: Search,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
    {
      id: 'pending',
      label: 'Cambios pendientes',
      value: stats.pendingChanges,
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
    },
    {
      id: 'successful',
      label: 'Actualizaciones exitosas',
      value: stats.successful,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
    },
    {
      id: 'errors',
      label: 'Errores',
      value: stats.errors,
      icon: AlertTriangle,
      color: 'text-rose-600',
      bg: 'bg-rose-50',
      border: 'border-rose-100',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#6012C3] to-[#7c2de0] rounded-2xl p-6 sm:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-white/15 text-xs font-semibold backdrop-blur-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>{shop.isDemo ? 'Catálogo Demo Activo' : 'Tienda Conectada'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {shop.name}
          </h1>
          <p className="text-sm text-purple-100 max-w-xl">
            Optimiza el posicionamiento SEO de tu catálogo de Shopify. Modifica Handles, SEO Titles y Meta Descriptions con validación previa en vivo.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            id="dash-btn-seo"
            onClick={() => onNavigate('seo')}
            className="px-4 py-2.5 bg-white text-[#6012C3] font-semibold text-xs sm:text-sm rounded-xl hover:bg-purple-50 transition-all shadow-xs flex items-center space-x-2 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span>Ir a SEO</span>
          </button>
          <button
            id="dash-btn-alt-text"
            onClick={() => onNavigate('alt_text')}
            className="px-4 py-2.5 bg-emerald-500 text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-emerald-600 transition-all shadow-xs flex items-center space-x-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>Alt Text AI</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Métricas de la Sesión
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {metricCards.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 line-clamp-1">{m.label}</span>
                  <div className={`w-8 h-8 rounded-xl ${m.bg} flex items-center justify-center ${m.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-black tracking-tight text-slate-900">
                    {m.value.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary Action Modules */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Opciones Principales
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: SEO (Auditoría + edición individual/masiva) */}
          <div
            onClick={() => onNavigate('seo')}
            className="md:col-span-2 group bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-[#6012C3] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-[#6012C3]/10 text-[#6012C3] flex items-center justify-center group-hover:scale-105 transition-transform">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#6012C3] transition-colors">
                SEO: Auditoría y edición
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Audita el catálogo completo directamente desde Shopify (sin IA) para detectar handles inválidos y SEO
                Title / Meta Description faltantes o fuera de longitud recomendada. Desde ahí edita un producto por
                su <strong>Shopify Product ID</strong> con vista previa estilo Google, o en lote importando un
                archivo <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">.csv</code> /
                <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">.xlsx</code>.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#6012C3]">
              <span>Abrir módulo de SEO</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Card 2: Alt Text AI */}
          <div
            onClick={() => onNavigate('alt_text')}
            className="group bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:border-emerald-500 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Alt Text AI
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Nuevo Módulo
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Detecta imágenes sin texto alternativo y genera descripciones con análisis visual de Claude (o Google Gemini / IA Local como alternativas). Flujo de aprobación visual y actualización directa mediante GraphQL sin modificar archivos.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-emerald-700">
              <span>Optimizar imágenes del catálogo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Supporting resources */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('ai_settings')}
          className="bg-slate-50 rounded-2xl border border-slate-200 p-4 hover:bg-slate-100/80 transition-colors cursor-pointer flex items-center space-x-3"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#6012C3] shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Configuración de IA</h4>
            <p className="text-xs text-slate-500">Elige el modelo (Claude, Gemini o Local) y guarda su API Key en un solo lugar.</p>
          </div>
        </div>

        <div
          onClick={() => onNavigate('templates')}
          className="bg-slate-50 rounded-2xl border border-slate-200 p-4 hover:bg-slate-100/80 transition-colors cursor-pointer flex items-center space-x-3"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#6012C3] shrink-0">
            <FileDown className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Descargar plantillas oficiales</h4>
            <p className="text-xs text-slate-500">Obtén archivos modelo en CSV y Excel con hoja de instrucciones.</p>
          </div>
        </div>

        <div
          onClick={() => onNavigate('logs')}
          className="bg-slate-50 rounded-2xl border border-slate-200 p-4 hover:bg-slate-100/80 transition-colors cursor-pointer flex items-center space-x-3"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#6012C3] shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Historial y diagnóstico en memoria</h4>
            <p className="text-xs text-slate-500">Revisa la traza de operaciones ejecutadas durante esta sesión.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
