import React, { useEffect, useMemo, useState } from 'react';
import { ShopConnectionInfo, CatalogAuditRow, CatalogAuditSummary, ActiveTab } from '../types/seo';
import { scanCatalogAudit } from '../services/api';
import { downloadCatalogAuditCSV } from '../utils/fileParser';
import { CatalogBulkUploadView } from './CatalogBulkUploadView';
import {
  ShieldAlert,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Filter,
  Download,
  ExternalLink,
  Info,
  ChevronLeft,
  ChevronRight,
  Tag,
  DollarSign,
  FileText,
  ClipboardCheck,
  Table2,
} from 'lucide-react';

interface AuditViewProps {
  shop: ShopConnectionInfo;
  onNavigateLogs: () => void;
  onExecutionCompleted?: () => void;
}

type AuditSubTab = 'scan' | 'bulk';
type AuditFilter = 'all' | 'vendor' | 'price' | 'description' | 'ok';

// Catalogs can run into the thousands of products — rendering every row at
// once freezes the tab, so the audit table is paginated client-side (same
// approach as the SEO audit table in SEOView.tsx).
const AUDIT_PAGE_SIZE = 50;

export const AuditView: React.FC<AuditViewProps> = ({ shop, onNavigateLogs, onExecutionCompleted }) => {
  const [subTab, setSubTab] = useState<AuditSubTab>('scan');
  const [rows, setRows] = useState<CatalogAuditRow[]>([]);
  const [summary, setSummary] = useState<CatalogAuditSummary | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasScanned, setHasScanned] = useState(false);
  const [filter, setFilter] = useState<AuditFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);

  const handleScan = async () => {
    setIsScanning(true);
    setScanError(null);
    try {
      const res = await scanCatalogAudit();
      setRows(res.products);
      setSummary(res.summary);
      setHasScanned(true);
      setPage(0);
    } catch (err: any) {
      setScanError(err.message || 'Error al auditar el catálogo de la tienda.');
    } finally {
      setIsScanning(false);
    }
  };

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filter === 'ok' && row.issues.length !== 0) return false;
      if (filter === 'vendor' && !row.issues.includes('vendor')) return false;
      if (filter === 'price' && !row.issues.includes('price_zero') && !row.issues.includes('price_placeholder')) return false;
      if (filter === 'description' && !row.issues.includes('description')) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const haystack = `${row.title} ${row.handle} ${row.numericId} ${row.vendor}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [rows, filter, searchTerm]);

  // Reset to page 1 whenever the filtered set changes shape (new filter/search)
  useEffect(() => {
    setPage(0);
  }, [filter, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedRows = useMemo(
    () => filteredRows.slice(currentPage * AUDIT_PAGE_SIZE, (currentPage + 1) * AUDIT_PAGE_SIZE),
    [filteredRows, currentPage]
  );

  const formatMoney = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

  const adminProductUrl = (numericId: string) => `https://${shop.domain}/admin/products/${numericId}`;

  const subTabs: Array<{ id: AuditSubTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'scan', label: 'Auditoría', icon: ClipboardCheck },
    { id: 'bulk', label: 'Actualización masiva', icon: Table2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Auditoría</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Detecta productos con marca "BASE" o vacía, precios en $0, $999,999 o $9,999,999, y productos sin
          descripción — directamente desde Shopify.
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

      {subTab === 'scan' && (
      <div className="space-y-6">
      {/* Scan control */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Auditoría de catálogo</h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-xl">
              Recorre todos los productos de la tienda y detecta datos de catálogo incompletos o con valores de
              relleno. El escaneo es de solo lectura — para corregir lo detectado, usa la pestaña{' '}
              <button
                type="button"
                onClick={() => setSubTab('bulk')}
                className="font-semibold text-[#6012C3] hover:underline cursor-pointer"
              >
                "Actualización masiva"
              </button>{' '}
              o edita el producto directamente en el Admin de Shopify.
            </p>
          </div>
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="px-5 py-2.5 bg-[#6012C3] hover:bg-[#4b0d9c] text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Escaneando catálogo...' : hasScanned ? 'Volver a escanear' : 'Escanear catálogo'}</span>
          </button>
        </div>

        {isScanning && (
          <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-center space-x-2">
            <Info className="w-4 h-4 text-[#6012C3] shrink-0" />
            <span>
              Recorriendo el catálogo completo con paginación. En tiendas grandes esto puede tardar varios segundos.
            </span>
          </div>
        )}

        {scanError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{scanError}</span>
          </div>
        )}

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-medium text-slate-500 block">Total productos</span>
              <span className="text-xl font-bold text-slate-800 mt-1 block">{summary.total}</span>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <span className="text-[11px] font-medium text-emerald-700 block">Sin problemas</span>
              <span className="text-xl font-bold text-emerald-900 mt-1 block">{summary.ok}</span>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <span className="text-[11px] font-medium text-amber-700 block">Marca BASE/vacía</span>
              <span className="text-xl font-bold text-amber-900 mt-1 block">{summary.vendorIssues}</span>
            </div>
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
              <span className="text-[11px] font-medium text-rose-700 block">Precio $0 / $999,999 / $9,999,999</span>
              <span className="text-xl font-bold text-rose-900 mt-1 block">{summary.priceIssues}</span>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-100 rounded-xl">
              <span className="text-[11px] font-medium text-orange-700 block">Sin descripción</span>
              <span className="text-xl font-bold text-orange-900 mt-1 block">{summary.descriptionIssues}</span>
            </div>
          </div>
        )}
      </div>

      {hasScanned && (
        <>
          {/* Filters + search + export */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center space-x-1">
                  <Filter className="w-3 h-3" />
                  <span>Filtrar:</span>
                </span>
                {(
                  [
                    { id: 'all', label: `Todos (${rows.length})` },
                    { id: 'vendor', label: `Marca (${summary?.vendorIssues ?? 0})` },
                    { id: 'price', label: `Precio (${summary?.priceIssues ?? 0})` },
                    { id: 'description', label: `Sin descripción (${summary?.descriptionIssues ?? 0})` },
                    { id: 'ok', label: `Sin problemas (${summary?.ok ?? 0})` },
                  ] as Array<{ id: AuditFilter; label: string }>
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      filter === f.id ? 'bg-[#6012C3] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar producto, marca o ID..."
                    className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#6012C3]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => downloadCatalogAuditCSV(filteredRows)}
                  disabled={filteredRows.length === 0}
                  className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-lg flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-[#6012C3]" />
                  <span>Descargar CSV</span>
                </button>
              </div>
            </div>

            {filteredRows.length > AUDIT_PAGE_SIZE && (
              <div className="text-[11px] text-slate-500">
                Mostrando {pagedRows.length} de {filteredRows.length} resultados filtrados.
              </div>
            )}
          </div>

          {/* Audit table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[560px]">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3.5 w-12 text-center">Estado</th>
                    <th className="py-3 px-3.5 min-w-[200px]">Producto</th>
                    <th className="py-3 px-3.5 min-w-[120px]">Marca</th>
                    <th className="py-3 px-3.5 min-w-[130px]">Precio</th>
                    <th className="py-3 px-3.5 min-w-[110px]">Descripción</th>
                    <th className="py-3 px-3.5 min-w-[200px]">Problemas detectados</th>
                    <th className="py-3 px-3.5 w-28 text-center">Acciones</th>
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
                      const hasIssues = row.issues.length > 0;
                      return (
                        <tr
                          key={row.numericId}
                          className={`hover:bg-slate-50/80 transition-colors ${hasIssues ? 'bg-amber-50/20' : ''}`}
                        >
                          <td className="py-3 px-3.5 text-center">
                            {hasIssues ? (
                              <AlertTriangle className="w-4 h-4 text-amber-500 inline" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 inline" />
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            <p className="font-semibold text-slate-900">{row.title}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {row.handle} · ID: {row.numericId}
                            </p>
                          </td>
                          <td className="py-3 px-3.5">
                            {row.issues.includes('vendor') ? (
                              <span className="inline-flex items-center space-x-1 text-amber-700 font-medium">
                                <Tag className="w-3 h-3" />
                                <span>{row.vendor.trim() === '' ? '(Vacía)' : row.vendor}</span>
                              </span>
                            ) : (
                              <span className="text-slate-700">{row.vendor}</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            {row.flaggedVariants.length > 0 ? (
                              <div className="space-y-0.5">
                                {row.flaggedVariants.map((v) => (
                                  <div
                                    key={v.variantId}
                                    className="inline-flex items-center space-x-1 text-rose-700 font-medium"
                                  >
                                    <DollarSign className="w-3 h-3 shrink-0" />
                                    <span>
                                      {v.sku || v.variantTitle || 'SKU —'}: {formatMoney(v.price)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : row.variants.length === 1 ? (
                              <span className="text-slate-700">{formatMoney(row.variants[0].price)}</span>
                            ) : (
                              <span className="text-slate-700">{row.variants.length} variantes</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            {row.issues.includes('description') ? (
                              <span className="inline-flex items-center space-x-1 text-orange-700 font-medium">
                                <FileText className="w-3 h-3" />
                                <span>Sin descripción</span>
                              </span>
                            ) : (
                              <span className="text-emerald-600">Completa</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5">
                            {row.messages.length === 0 ? (
                              <span className="text-emerald-600 font-medium">Sin problemas</span>
                            ) : (
                              <div className="space-y-0.5">
                                {row.messages.map((m, i) => (
                                  <span key={i} className="block text-[10px] leading-tight text-amber-700">
                                    • {m}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            {shop.isDemo ? (
                              <span className="text-[10px] text-slate-400 italic">Demo</span>
                            ) : (
                              <a
                                href={adminProductUrl(row.numericId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-[#6012C3] font-semibold rounded-lg inline-flex items-center space-x-1 cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Ver en Shopify</span>
                              </a>
                            )}
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
          <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Aún no has ejecutado la auditoría de catálogo</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Haz clic en "Escanear catálogo" para revisar marca, precio y descripción en todos tus productos, sin
            necesidad de subir ningún archivo.
          </p>
        </div>
      )}
      </div>
      )}

      {subTab === 'bulk' && (
        <CatalogBulkUploadView
          onExecutionCompleted={onExecutionCompleted}
          onNavigate={(tab: ActiveTab) => {
            if (tab === 'logs') onNavigateLogs();
          }}
        />
      )}
    </div>
  );
};
