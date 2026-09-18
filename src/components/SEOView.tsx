import React, { useState, useMemo, useEffect } from 'react';
import { ShopConnectionInfo, SEOAuditRow, SEOAuditSummary } from '../types/seo';
import { scanSEOAudit } from '../services/api';
import { downloadSEOAuditSelectionCSV } from '../utils/fileParser';
import { SingleProductEditor } from './SingleProductEditor';
import { BulkUploadView } from './BulkUploadView';
import {
  ClipboardCheck,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Filter,
  Download,
  Pencil,
  Table2,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface SEOViewProps {
  shop: ShopConnectionInfo;
  onNavigateLogs: () => void;
  onExecutionCompleted?: () => void;
}

type SEOSubTab = 'audit' | 'single' | 'bulk';
type AuditStatusFilter = 'all' | 'error' | 'warning' | 'ok';

// Catalogs can run into the thousands of products — rendering every row at
// once freezes the tab, so the audit table is paginated client-side.
const AUDIT_PAGE_SIZE = 50;
// Rendering an editable input+textarea trio per row in the bulk-edit bridge
// scales badly past a few hundred rows, so cap that specific action.
const BULK_EDIT_TABLE_MAX_ROWS = 200;

export const SEOView: React.FC<SEOViewProps> = ({ shop, onNavigateLogs, onExecutionCompleted }) => {
  const [subTab, setSubTab] = useState<SEOSubTab>('audit');

  // Audit state
  const [auditRows, setAuditRows] = useState<SEOAuditRow[]>([]);
  const [auditSummary, setAuditSummary] = useState<SEOAuditSummary | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [statusFilter, setStatusFilter] = useState<AuditStatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);

  // Bridges into the other two sub-tabs
  const [editProductId, setEditProductId] = useState<string | undefined>(undefined);
  const [bulkInitialRows, setBulkInitialRows] = useState<
    Array<{ productId: string; handle: string; seoTitle: string; seoDescription: string }> | undefined
  >(undefined);

  const handleScan = async () => {
    setIsScanning(true);
    setScanError(null);
    try {
      const res = await scanSEOAudit();
      setAuditRows(res.products);
      setAuditSummary(res.summary);
      setHasScanned(true);
      setSelectedIds(new Set());
      setPage(0);
    } catch (err: any) {
      setScanError(err.message || 'Error al auditar los productos de la tienda.');
    } finally {
      setIsScanning(false);
    }
  };

  const filteredRows = useMemo(() => {
    return auditRows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const haystack = `${row.title} ${row.handle} ${row.numericId}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [auditRows, statusFilter, searchTerm]);

  // Reset to page 1 whenever the filtered set changes shape (new filter/search)
  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedRows = useMemo(
    () => filteredRows.slice(currentPage * AUDIT_PAGE_SIZE, (currentPage + 1) * AUDIT_PAGE_SIZE),
    [filteredRows, currentPage]
  );

  const toggleSelect = (numericId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(numericId)) next.delete(numericId);
      else next.add(numericId);
      return next;
    });
  };

  // The header checkbox only selects/deselects the rows on the current page —
  // selecting all 6000+ filtered rows at once would make the bulk-edit bridge
  // unusable (see BULK_EDIT_TABLE_MAX_ROWS below).
  const toggleSelectAllOnPage = () => {
    setSelectedIds((prev) => {
      const allOnPageSelected = pagedRows.length > 0 && pagedRows.every((r) => prev.has(r.numericId));
      const next = new Set(prev);
      pagedRows.forEach((r) => {
        if (allOnPageSelected) next.delete(r.numericId);
        else next.add(r.numericId);
      });
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredRows.map((r) => r.numericId)));
  };

  const selectedRows = auditRows.filter((r) => selectedIds.has(r.numericId));
  const bulkEditLimitExceeded = selectedRows.length > BULK_EDIT_TABLE_MAX_ROWS;

  const handleEditProduct = (numericId: string) => {
    setEditProductId(numericId);
    setSubTab('single');
  };

  const handleBulkEditSelected = () => {
    if (bulkEditLimitExceeded) return;
    setBulkInitialRows(
      selectedRows.map((r) => ({
        productId: r.numericId,
        handle: r.handle,
        seoTitle: r.seoTitle,
        seoDescription: r.seoDescription,
      }))
    );
    setSubTab('bulk');
  };

  const handleDownloadSelectedCSV = () => {
    downloadSEOAuditSelectionCSV(selectedRows);
  };

  const subTabs: Array<{ id: SEOSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'audit', label: 'Auditoría', icon: ClipboardCheck },
    { id: 'single', label: 'Editar producto', icon: Pencil },
    { id: 'bulk', label: 'Actualización masiva', icon: Table2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">SEO</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Audita el catálogo directamente desde Shopify y edita producto por producto o en lote.
        </p>
      </div>

      {/* Sub-tab pills */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-xs inline-flex flex-wrap gap-1.5">
        {subTabs.map((t) => {
          const Icon = t.icon;
          const isActive = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer ${
                isActive ? 'bg-[#6012C3] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === 'audit' && (
        <div className="space-y-5">
          {/* Scan control */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Auditoría SEO del catálogo</h2>
                <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
                  Recorre todos los productos de la tienda directamente desde Shopify (sin IA) y detecta handles
                  inválidos, SEO Title y Meta Description faltantes o fuera de la longitud recomendada.
                </p>
              </div>
              <button
                type="button"
                onClick={handleScan}
                disabled={isScanning}
                className="px-5 py-2.5 bg-[#6012C3] hover:bg-[#4b0d9c] text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Escaneando tienda...' : hasScanned ? 'Volver a escanear' : 'Escanear tienda'}</span>
              </button>
            </div>

            {isScanning && (
              <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center space-x-2">
                <Info className="w-4 h-4 text-[#6012C3] shrink-0" />
                <span>
                  Recorriendo el catálogo completo con paginación. En tiendas grandes esto puede tardar varios
                  segundos.
                </span>
              </div>
            )}

            {scanError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{scanError}</span>
              </div>
            )}

            {auditSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-medium text-slate-500 block">Total productos</span>
                  <span className="text-xl font-bold text-slate-800 mt-1 block">{auditSummary.total}</span>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                  <span className="text-[11px] font-medium text-emerald-700 block">Sin problemas</span>
                  <span className="text-xl font-bold text-emerald-900 mt-1 block">{auditSummary.ok}</span>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <span className="text-[11px] font-medium text-amber-700 block">Advertencias</span>
                  <span className="text-xl font-bold text-amber-900 mt-1 block">{auditSummary.warnings}</span>
                </div>
                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                  <span className="text-[11px] font-medium text-rose-700 block">Errores</span>
                  <span className="text-xl font-bold text-rose-900 mt-1 block">{auditSummary.errors}</span>
                </div>
              </div>
            )}
          </div>

          {hasScanned && (
            <>
              {/* Filters + search + selection toolbar */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center space-x-1">
                      <Filter className="w-3 h-3" />
                      <span>Filtrar:</span>
                    </span>
                    {(
                      [
                        { id: 'all', label: `Todos (${auditRows.length})` },
                        { id: 'error', label: `Errores (${auditSummary?.errors ?? 0})` },
                        { id: 'warning', label: `Advertencias (${auditSummary?.warnings ?? 0})` },
                        { id: 'ok', label: `OK (${auditSummary?.ok ?? 0})` },
                      ] as Array<{ id: AuditStatusFilter; label: string }>
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                          statusFilter === f.id ? 'bg-[#6012C3] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Search className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar producto, handle o ID..."
                      className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#6012C3]"
                    />
                  </div>
                </div>

                {filteredRows.length > AUDIT_PAGE_SIZE && (
                  <div className="text-[11px] text-slate-500">
                    Mostrando {pagedRows.length} de {filteredRows.length} resultados filtrados ·{' '}
                    <button type="button" onClick={selectAllFiltered} className="text-[#6012C3] font-semibold hover:underline cursor-pointer">
                      Seleccionar los {filteredRows.length} filtrados
                    </button>
                  </div>
                )}

                {selectedIds.size > 0 && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-purple-900">{selectedIds.size} producto(s) seleccionado(s)</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleBulkEditSelected}
                        disabled={bulkEditLimitExceeded}
                        title={
                          bulkEditLimitExceeded
                            ? `Selecciona como máximo ${BULK_EDIT_TABLE_MAX_ROWS} productos para editarlos en tabla. Usa "Descargar CSV" para lotes más grandes.`
                            : undefined
                        }
                        className="px-3 py-1.5 bg-[#6012C3] hover:bg-[#4b0d9c] text-white font-semibold rounded-lg flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Table2 className="w-3.5 h-3.5" />
                        <span>Editar en tabla</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadSelectedCSV}
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-lg flex items-center space-x-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-[#6012C3]" />
                        <span>Descargar CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="px-3 py-1.5 text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                      >
                        Limpiar selección
                      </button>
                    </div>
                  </div>
                )}

                {bulkEditLimitExceeded && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start space-x-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span>
                      Seleccionaste {selectedRows.length} productos. "Editar en tabla" solo admite hasta{' '}
                      {BULK_EDIT_TABLE_MAX_ROWS} a la vez (más de eso vuelve a congelar la pantalla). Usa "Descargar
                      CSV" para lotes más grandes y súbelo de vuelta en "Actualización masiva".
                    </span>
                  </div>
                )}
              </div>

              {/* Audit table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto max-h-[560px]">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="py-3 px-3.5 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={pagedRows.length > 0 && pagedRows.every((r) => selectedIds.has(r.numericId))}
                            onChange={toggleSelectAllOnPage}
                            title="Seleccionar esta página"
                            className="cursor-pointer"
                          />
                        </th>
                        <th className="py-3 px-3.5 w-12 text-center">Estado</th>
                        <th className="py-3 px-3.5 min-w-[200px]">Producto</th>
                        <th className="py-3 px-3.5 min-w-[220px]">SEO Title</th>
                        <th className="py-3 px-3.5 min-w-[220px]">Meta Description</th>
                        <th className="py-3 px-3.5 min-w-[200px]">Problemas detectados</th>
                        <th className="py-3 px-3.5 w-24 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            No hay productos en esta categoría.
                          </td>
                        </tr>
                      ) : (
                        pagedRows.map((row) => {
                          const isError = row.status === 'error';
                          const isWarning = row.status === 'warning';
                          return (
                            <tr
                              key={row.numericId}
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isError ? 'bg-rose-50/30' : isWarning ? 'bg-amber-50/20' : ''
                              }`}
                            >
                              <td className="py-3 px-3.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(row.numericId)}
                                  onChange={() => toggleSelect(row.numericId)}
                                  className="cursor-pointer"
                                />
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                {isError && <XCircle className="w-4 h-4 text-rose-600 inline" />}
                                {isWarning && <AlertTriangle className="w-4 h-4 text-amber-500 inline" />}
                                {!isError && !isWarning && <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />}
                              </td>
                              <td className="py-3 px-3.5">
                                <p className="font-semibold text-slate-900">{row.title}</p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {row.handle} · ID: {row.numericId}
                                </p>
                              </td>
                              <td className="py-3 px-3.5">
                                {row.seoTitle ? (
                                  <>
                                    <p className="text-slate-700">{row.seoTitle}</p>
                                    <p className="text-[10px] text-slate-400">{row.seoTitle.length} caracteres</p>
                                  </>
                                ) : (
                                  <span className="text-slate-400 italic">Sin SEO Title</span>
                                )}
                              </td>
                              <td className="py-3 px-3.5">
                                {row.seoDescription ? (
                                  <>
                                    <p className="text-slate-700 line-clamp-2">{row.seoDescription}</p>
                                    <p className="text-[10px] text-slate-400">{row.seoDescription.length} caracteres</p>
                                  </>
                                ) : (
                                  <span className="text-slate-400 italic">Sin Meta Description</span>
                                )}
                              </td>
                              <td className="py-3 px-3.5">
                                {row.messages.length === 0 ? (
                                  <span className="text-emerald-600 font-medium">Sin problemas</span>
                                ) : (
                                  <div className="space-y-0.5">
                                    {row.messages.map((m, i) => (
                                      <span
                                        key={i}
                                        className={`block text-[10px] leading-tight ${
                                          isError ? 'text-rose-600 font-medium' : 'text-amber-700'
                                        }`}
                                      >
                                        • {m}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleEditProduct(row.numericId)}
                                  className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-[#6012C3] font-semibold rounded-lg inline-flex items-center space-x-1 cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  <span>Editar</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination — keeps the DOM small even for catalogs with thousands of products */}
                {filteredRows.length > 0 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-xs text-slate-500">
                    <span>
                      Página {currentPage + 1} de {totalPages} · {filteredRows.length} producto(s) filtrado(s)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg flex items-center space-x-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Anterior</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1}
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg flex items-center space-x-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
                      >
                        <span>Siguiente</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {!hasScanned && !isScanning && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-2">
              <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600">Aún no has ejecutado la auditoría</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Haz clic en "Escanear tienda" para revisar todos tus productos y detectar problemas de SEO sin
                necesidad de subir ningún archivo.
              </p>
            </div>
          )}
        </div>
      )}

      {subTab === 'single' && (
        <SingleProductEditor shop={shop} onProductUpdated={onExecutionCompleted} initialProductId={editProductId} />
      )}

      {subTab === 'bulk' && (
        <BulkUploadView
          shop={shop}
          onExecutionCompleted={onExecutionCompleted}
          onNavigate={(tab) => {
            if (tab === 'logs') onNavigateLogs();
          }}
          initialRows={bulkInitialRows}
        />
      )}
    </div>
  );
};
