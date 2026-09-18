import React, { useState, useEffect } from 'react';
import { SessionLog } from '../types/seo';
import { getSessionLogs, clearSessionLogs } from '../services/api';
import {
  Activity,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Shield,
  Search,
} from 'lucide-react';

export const SessionLogsView: React.FC = () => {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'error' | 'warning' | 'info'>('all');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await getSessionLogs();
      setLogs(data);
    } catch {
      // safe fallback
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClear = async () => {
    if (window.confirm('¿Deseas limpiar todos los registros de esta sesión?')) {
      await clearSessionLogs();
      setLogs([]);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filterStatus !== 'all' && log.status !== filterStatus) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.operation.toLowerCase().includes(q) ||
        (log.productId && log.productId.includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Historial de Sesión
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro de operaciones ejecutadas exclusivamente en memoria durante esta sesión activa.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={isLoading}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={logs.length === 0}
            className="px-3.5 py-2 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpiar registros</span>
          </button>
        </div>
      </div>

      {/* Security alert reminder */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start space-x-3 text-xs text-slate-600">
        <Shield className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <p className="leading-relaxed text-[11px]">
          <strong>Seguridad y Privacidad:</strong> Estos registros existen solo en la memoria del navegador y backend mientras la aplicación esté abierta. Al cerrar la pestaña o desconectarse, todo desaparece. Los tokens de autenticación están estrictamente excluidos de cualquier log o mensaje.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            placeholder="Buscar por ID, producto o mensaje..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6012C3] focus:border-[#6012C3]"
          />
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto">
          {[
            { id: 'all', label: `Todos (${logs.length})` },
            { id: 'success', label: 'Exitosos' },
            { id: 'error', label: 'Errores' },
            { id: 'warning', label: 'Advertencias' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterStatus(tab.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                filterStatus === tab.id
                  ? 'bg-[#6012C3] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[550px]">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-3.5 w-24">Hora</th>
                <th className="py-3 px-3.5 w-24">Estado</th>
                <th className="py-3 px-3.5 w-36">Operación</th>
                <th className="py-3 px-3.5 w-36">Product ID</th>
                <th className="py-3 px-3.5 min-w-[250px]">Mensaje / Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No hay registros de actividad en esta sesión.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSuccess = log.status === 'success';
                  const isErr = log.status === 'error';
                  const isWarn = log.status === 'warning';

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-400">{log.timestamp}</td>
                      <td className="py-2.5 px-3.5">
                        {isSuccess && (
                          <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Éxito</span>
                          </span>
                        )}
                        {isErr && (
                          <span className="inline-flex items-center space-x-1 text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            <span>Error</span>
                          </span>
                        )}
                        {isWarn && (
                          <span className="inline-flex items-center space-x-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Aviso</span>
                          </span>
                        )}
                        {!isSuccess && !isErr && !isWarn && (
                          <span className="inline-flex items-center space-x-1 text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-semibold">
                            <Info className="w-3 h-3 text-slate-500" />
                            <span>Info</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 font-medium text-slate-800">{log.operation}</td>
                      <td className="py-2.5 px-3.5 font-mono text-slate-600">
                        {log.productId ? log.productId : '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-slate-700 text-xs">{log.message}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
