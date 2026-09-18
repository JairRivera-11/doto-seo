import React from 'react';
import { ShopConnectionInfo } from '../types/seo';
import { ShieldCheck, LogOut, ExternalLink, CheckCircle2, Sparkles } from 'lucide-react';

interface HeaderProps {
  shop: ShopConnectionInfo | null;
  onDisconnect: () => void;
}

export const Header: React.FC<HeaderProps> = ({ shop, onDisconnect }) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Subtitle */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#6012C3] flex items-center justify-center text-white font-bold text-xl shadow-sm tracking-tight">
              D
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl font-extrabold tracking-tight text-slate-900">
                  Doto <span className="text-[#6012C3]">SEO</span>
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-[#6012C3]/10 text-[#6012C3] border border-[#6012C3]/20">
                  Shopify SEO Manager
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Administrador masivo de Handle, SEO Title y Meta Description
              </p>
            </div>
          </div>

          {/* Connection status and action */}
          <div className="flex items-center space-x-3">
            {shop ? (
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-emerald-900 leading-tight">
                      {shop.isDemo ? 'Catálogo Demo Conectado' : 'Shopify Conectado'}
                    </span>
                    <span className="text-[11px] text-emerald-700 truncate max-w-[140px] sm:max-w-[200px]">
                      {shop.domain}
                    </span>
                  </div>
                </div>

                {shop.url && (
                  <a
                    href={shop.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Visitar tienda"
                    className="p-2 text-slate-400 hover:text-[#6012C3] hover:bg-slate-100 rounded-lg transition-colors hidden md:block"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                <button
                  id="btn-disconnect-shopify"
                  onClick={onDisconnect}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                  title="Desconectar y borrar credenciales de memoria"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                <ShieldCheck className="w-4 h-4 text-[#6012C3]" />
                <span className="font-medium">Sesión segura en memoria</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
