import React, { useState } from 'react';
import { Shield, KeyRound, Store, AlertCircle, ArrowRight, Sparkles, Check, HelpCircle } from 'lucide-react';
import { connectShopify, connectDemoShop } from '../services/api';
import { ShopConnectionInfo } from '../types/seo';

interface ConnectViewProps {
  onConnected: (shop: ShopConnectionInfo) => void;
}

export const ConnectView: React.FC<ConnectViewProps> = ({ onConnected }) => {
  const [storeDomain, setStoreDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!storeDomain.trim()) {
      setErrorMessage('Por favor introduce el dominio de tu tienda Shopify (ej: doto.myshopify.com).');
      return;
    }

    if (!accessToken.trim()) {
      setErrorMessage('Por favor introduce el Admin API Access Token (shpat_...).');
      return;
    }

    setIsLoading(true);

    try {
      const res = await connectShopify(storeDomain.trim(), accessToken.trim());
      onConnected(res.shop);
    } catch (err: any) {
      setErrorMessage(
        err.message ||
          'No fue posible conectar con Shopify. Verifica el dominio, el token y que tenga permisos read_products y write_products.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoConnect = async () => {
    setErrorMessage(null);
    setIsDemoLoading(true);
    try {
      const res = await connectDemoShop();
      onConnected(res.shop);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al iniciar catálogo de prueba.');
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-xl">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#6012C3]/10 text-[#6012C3] mb-1">
              <Store className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Conectar Shopify
            </h1>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Ingresa los datos de tu aplicación personalizada de Shopify para administrar el SEO de tus productos.
            </p>
          </div>

          {/* Error notice */}
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm space-y-2">
              <div className="flex items-start space-x-2 font-semibold">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <span>No fue posible conectar con Shopify</span>
              </div>
              <p className="text-xs text-rose-700 leading-relaxed pl-7">
                {errorMessage}
              </p>
              <div className="text-[11px] text-rose-600 pl-7 pt-1 border-t border-rose-200/60">
                <strong>Posibles causas:</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Store Domain incorrecto (ej: doto.myshopify.com)</li>
                  <li>Access Token incorrecto o revocado</li>
                  <li>El token no tiene permisos <code className="bg-rose-100 px-1 py-0.5 rounded">read_products</code> o <code className="bg-rose-100 px-1 py-0.5 rounded">write_products</code></li>
                  <li>Error de red o conexión con Shopify</li>
                </ul>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="store-domain" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Shopify Store
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Store className="w-4 h-4" />
                </div>
                <input
                  id="store-domain"
                  type="text"
                  placeholder="doto.myshopify.com"
                  value={storeDomain}
                  onChange={(e) => setStoreDomain(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6012C3] focus:border-[#6012C3] transition-all"
                  autoComplete="off"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Puedes ingresar <code className="font-mono text-slate-600">mitienda.myshopify.com</code> o simplemente <code className="font-mono text-slate-600">mitienda</code>.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="access-token" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Admin API Access Token
                </label>
                <button
                  type="button"
                  onClick={() => setShowHelp(!showHelp)}
                  className="text-[11px] text-[#6012C3] hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>¿Dónde obtenerlo?</span>
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  id="access-token"
                  type="password"
                  placeholder="shpat_••••••••••••••••••••••••••••"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6012C3] focus:border-[#6012C3] transition-all"
                  autoComplete="off"
                />
              </div>
            </div>

            {/* Help accordion */}
            {showHelp && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-800">
                  Pasos para crear tu token en Shopify:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-600">
                  <li>Ingresa a tu Admin de Shopify → <strong>Configuración</strong> → <strong>Aplicaciones y canales de ventas</strong>.</li>
                  <li>Haz clic en <strong>Desarrollar aplicaciones</strong> y luego en <strong>Crear una aplicación</strong>.</li>
                  <li>En <strong>Configuración de la API del panel de control</strong>, activa los permisos:
                    <span className="font-mono font-bold text-slate-800"> read_products</span> y <span className="font-mono font-bold text-slate-800">write_products</span>.
                  </li>
                  <li>Haz clic en <strong>Instalar aplicación</strong> y copia el <strong>Token de acceso a la API del panel de control</strong> (comienza con <em>shpat_</em>).</li>
                </ol>
              </div>
            )}

            <button
              id="btn-connect-shopify-submit"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-xl text-white font-semibold text-sm bg-[#6012C3] hover:bg-[#4b0d9c] focus:outline-none focus:ring-4 focus:ring-[#6012C3]/20 transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando conexión con Shopify...</span>
                </>
              ) : (
                <>
                  <span>Conectar Shopify</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-4 text-xs uppercase tracking-wider text-slate-400 font-semibold">
              O prueba sin credenciales
            </span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Demo button */}
          <button
            id="btn-demo-catalog"
            type="button"
            onClick={handleDemoConnect}
            disabled={isDemoLoading}
            className="w-full py-2.5 px-4 rounded-xl text-slate-700 font-medium text-sm bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-all flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#6012C3]" />
            <span>{isDemoLoading ? 'Cargando catálogo de prueba...' : 'Probar con Catálogo de Demostración'}</span>
          </button>

          {/* Security guarantee note */}
          <div className="pt-2 border-t border-slate-100 flex items-start space-x-2 text-[11px] text-slate-400">
            <Shield className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              <strong>Seguridad garantizada:</strong> El token de acceso nunca se almacena en bases de datos, cookies ni disco. Reside únicamente en memoria RAM durante esta sesión activa y se elimina inmediatamente al desconectar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
