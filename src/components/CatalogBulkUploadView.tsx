import React, { useRef, useState } from 'react';
import { CatalogBulkPreviewRow, CatalogBulkPreviewSummary, CatalogBulkExecutionResult, ActiveTab } from '../types/seo';
import {
  parseCatalogAuditUploadFile,
  downloadCatalogAuditCSVTemplate,
  downloadCatalogAuditExcelTemplate,
} from '../utils/fileParser';
import { previewCatalogAuditBulk, executeCatalogAuditBulk } from '../services/api';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowRight,
  Download,
  RotateCcw,
  Info,
  Check,
  Filter,
  Activity,
} from 'lucide-react';

interface CatalogBulkUploadViewProps {
  onExecutionCompleted?: () => void;
  onNavigate?: (tab: ActiveTab) => void;
}

const fieldLabel = (f: string) => (f === 'vendor' ? 'Marca' : f === 'price' ? 'Precio' : 'Descripción');

const formatMoney = (n: number | null) =>
  n === null ? '—' : `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

export const CatalogBulkUploadView: React.FC<CatalogBulkUploadViewProps> = ({ onExecutionCompleted, onNavigate }) => {
  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<{
    productIdCol?: string;
    vendorCol?: string;
    priceCol?: string;
    descriptionCol?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewSummary, setPreviewSummary] = useState<CatalogBulkPreviewSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<CatalogBulkPreviewRow[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'toUpdate' | 'warnings' | 'errors' | 'noChange'>('all');

  // Execution state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progressCount, setProgressCount] = useState(0);
  const [executionSummary, setExecutionSummary] = useState<{
    total: number;
    success: number;
    errors: number;
    skipped: number;
  } | null>(null);
  const [executionResults, setExecutionResults] = useState<CatalogBulkExecutionResult[]>([]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setParseError(null);
    setExecutionError(null);
    setDetectedColumns(null);
    setPreviewSummary(null);
    setPreviewRows([]);
    setExecutionSummary(null);
    setExecutionResults([]);
    setIsParsing(true);

    try {
      const { rows, columnMapping } = await parseCatalogAuditUploadFile(file);
      setDetectedColumns(columnMapping);

      if (rows.length === 0) {
        throw new Error('No se detectaron registros válidos en el archivo.');
      }

      const previewData = await previewCatalogAuditBulk(rows);
      setPreviewSummary(previewData.summary);
      setPreviewRows(previewData.previewRows);
    } catch (err: any) {
      setParseError(err.message || 'Error al procesar el archivo.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setParseError(null);
    setExecutionError(null);
    setDetectedColumns(null);
    setPreviewSummary(null);
    setPreviewRows([]);
    setExecutionSummary(null);
    setExecutionResults([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExecute = async () => {
    setShowConfirmModal(false);
    setIsExecuting(true);
    setExecutionError(null);
    setProgressCount(0);

    try {
      const itemsToUpdate = previewRows
        .filter((r) => r.status === 'valid' || r.status === 'warning')
        .map((r) => ({
          productId: r.productId,
          productTitle: r.productTitle,
          currentVendor: r.currentVendor,
          newVendor: r.newVendor,
          currentMinPrice: r.currentMinPrice,
          currentMaxPrice: r.currentMaxPrice,
          newPrice: r.newPrice,
          currentDescription: r.currentDescription,
          newDescription: r.newDescription,
          fieldsToUpdate: r.fieldsToUpdate,
        }));

      if (itemsToUpdate.length === 0) {
        throw new Error('No hay productos con cambios válidos para actualizar.');
      }

      // Fake progress animation while the real request is in flight — the
      // server doesn't stream real progress, so this just fills the bar in
      // ~10 steps. It must never reach/overshoot the real total: for large
      // batches the step size (ceil(total/10)) can jump past `total - 1` in
      // one tick, which used to freeze the bar showing e.g. "520 / 515"
      // (101%) for however long the real request kept running.
      const interval = setInterval(() => {
        setProgressCount((prev) => {
          const next = prev + Math.ceil(itemsToUpdate.length / 10);
          if (next >= itemsToUpdate.length) {
            clearInterval(interval);
            return itemsToUpdate.length - 1;
          }
          return next;
        });
      }, 300);

      const res = await executeCatalogAuditBulk(itemsToUpdate);
      clearInterval(interval);
      setProgressCount(itemsToUpdate.length);

      setExecutionSummary(res.summary);
      setExecutionResults(res.results);

      if (onExecutionCompleted) {
        onExecutionCompleted();
      }
    } catch (err: any) {
      setExecutionError(err.message || 'Error al ejecutar las actualizaciones en Shopify.');
    } finally {
      setIsExecuting(false);
    }
  };

  const displayedPreviewRows = previewRows.filter((r) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'toUpdate') return r.status === 'valid' || r.status === 'warning';
    if (filterTab === 'warnings') return r.status === 'warning';
    if (filterTab === 'errors') return r.status === 'error';
    if (filterTab === 'noChange') return r.status === 'no_change';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Actualización masiva de catálogo</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Importa un archivo CSV o Excel (.xlsx, .xls) para corregir en lote Marca, Precio y/o Descripción,
            dependiendo de lo que cada producto necesite.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={downloadCatalogAuditCSVTemplate}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-[#6012C3]" />
            <span>Plantilla CSV</span>
          </button>
          <button
            type="button"
            onClick={downloadCatalogAuditExcelTemplate}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Plantilla Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Explicit scope warning: unlike the SEO module, this DOES write catalog data */}
      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <span>
          A diferencia del módulo de SEO, esta sección <strong>sí modifica datos reales del catálogo</strong> (Marca,
          Precio y Descripción). Revisa siempre la vista previa antes de confirmar.
        </span>
      </div>

      {/* Step workflow indicator */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div
            className={`flex items-center space-x-3 p-2.5 rounded-xl border ${
              !previewSummary && !executionSummary
                ? 'bg-purple-50/70 border-[#6012C3]/30 text-[#6012C3] font-semibold'
                : 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                !previewSummary && !executionSummary ? 'bg-[#6012C3] text-white' : 'bg-emerald-600 text-white'
              }`}
            >
              {!previewSummary && !executionSummary ? '1' : '✓'}
            </div>
            <div>
              <p className="font-bold leading-tight">Paso 1: Archivo</p>
              <p className="text-[11px] opacity-80">{!selectedFile ? 'Selecciona CSV o Excel' : selectedFile.name}</p>
            </div>
          </div>

          <div
            className={`flex items-center space-x-3 p-2.5 rounded-xl border ${
              previewSummary && !executionSummary
                ? 'bg-amber-50/80 border-amber-300 text-amber-900 font-semibold shadow-2xs'
                : executionSummary
                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                previewSummary && !executionSummary
                  ? 'bg-amber-600 text-white animate-pulse'
                  : executionSummary
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {executionSummary ? '✓' : '2'}
            </div>
            <div>
              <p className="font-bold leading-tight">Paso 2: Vista previa</p>
              <p className="text-[11px] opacity-80">
                {previewSummary ? `${previewSummary.toUpdate} cambios detectados` : 'Validación y semáforo'}
              </p>
            </div>
          </div>

          <div
            className={`flex items-center space-x-3 p-2.5 rounded-xl border ${
              executionSummary
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-900 font-semibold'
                : isExecuting
                ? 'bg-purple-50 border-purple-300 text-purple-900 font-semibold'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                executionSummary
                  ? 'bg-emerald-600 text-white'
                  : isExecuting
                  ? 'bg-[#6012C3] text-white animate-spin'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {executionSummary ? '✓' : '3'}
            </div>
            <div>
              <p className="font-bold leading-tight">Paso 3: Aplicar en Shopify</p>
              <p className="text-[11px] opacity-80">
                {executionSummary
                  ? `Completado (${executionSummary.success} exitosos)`
                  : isExecuting
                  ? 'Guardando cambios...'
                  : 'Pendiente de confirmación'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Dropzone */}
      {!previewSummary && !isExecuting && !executionSummary && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-[#6012C3] rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all bg-slate-50/50 hover:bg-[#6012C3]/5 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, .xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="w-16 h-16 rounded-2xl bg-[#6012C3]/10 text-[#6012C3] flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Haz clic o arrastra tu archivo aquí</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Formatos soportados: <span className="font-semibold text-slate-700">.csv, .xlsx, .xls</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
              <span className="bg-white px-2 py-1 rounded-md border border-slate-200">Product ID (Obligatorio)</span>
              <span className="bg-white px-2 py-1 rounded-md border border-slate-200">Marca</span>
              <span className="bg-white px-2 py-1 rounded-md border border-slate-200">Precio</span>
              <span className="bg-white px-2 py-1 rounded-md border border-slate-200">Descripción</span>
            </div>
          </div>

          {isParsing && (
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center space-x-3">
              <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>Analizando archivo y consultando productos en Shopify...</span>
            </div>
          )}

          {parseError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Error en la lectura del archivo</p>
                <p className="text-rose-700 mt-0.5">{parseError}</p>
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-2">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
              <Info className="w-4 h-4 text-[#6012C3]" />
              <span>Reglas de validación antes de actualizar</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1 text-[11px]">
              <li>
                <strong>Celdas vacías:</strong> Si dejas una celda en blanco en el archivo, ese campo{' '}
                <strong>NO se modificará</strong> en Shopify — solo se actualiza lo que necesites corregir.
              </li>
              <li>
                <strong>Modo Solo Cambios:</strong> Si el valor propuesto es exactamente igual al actual en Shopify,
                se clasifica como <em>"Sin cambios"</em> y no consume operaciones innecesarias.
              </li>
              <li>
                <strong>Precio por variante:</strong> Si un producto tiene varias variantes con precios distintos, el
                nuevo precio se aplica por igual a todas ellas.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Preview Section */}
      {previewSummary && !executionSummary && !isExecuting && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-[#6012C3]" />
                  <span>Archivo cargado: {selectedFile?.name}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">Resumen de Validación Previa</h2>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Cambiar archivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={previewSummary.toUpdate === 0}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#6012C3] hover:bg-[#4b0d9c] rounded-xl transition-all shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <span>Actualizar productos ({previewSummary.toUpdate})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {executionError && (
              <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs flex items-start space-x-3 shadow-2xs">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Error durante la ejecución en Shopify</p>
                  <p className="text-rose-800 mt-1 leading-relaxed">{executionError}</p>
                </div>
              </div>
            )}

            {previewSummary.toUpdate > 0 ? (
              <div className="p-4 bg-amber-50/90 border-2 border-amber-300 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                      ⚠️ Vista previa de seguridad — Ningún producto ha sido modificado aún
                    </h4>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      Se validaron <strong>{previewSummary.totalRows} filas</strong> del archivo y se encontraron{' '}
                      <strong>{previewSummary.toUpdate} productos con cambios listos</strong>. Para guardar estos
                      valores directamente en tu tienda Shopify, debes hacer clic en el botón de confirmación.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  className="px-5 py-2.5 bg-[#6012C3] hover:bg-[#4b0d9c] text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center space-x-2 shrink-0 cursor-pointer"
                >
                  <span>Confirmar y Actualizar Ahora ({previewSummary.toUpdate})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-4 bg-slate-100 border border-slate-300 rounded-2xl flex items-start space-x-3 text-xs text-slate-700 shadow-xs">
                <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-slate-900 uppercase tracking-wide">0 productos por actualizar</h4>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    No se detectaron campos con valores diferentes a los existentes en Shopify.
                    {previewSummary.noChange > 0 &&
                      ` ${previewSummary.noChange} producto(s) ya tienen exactamente los mismos datos en tu tienda.`}
                    {previewSummary.errors > 0 &&
                      ` ${previewSummary.errors} fila(s) contienen errores de identificación o formato (revisa el filtro de "Errores" abajo).`}
                  </p>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="mt-2.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg inline-flex items-center space-x-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Cargar otro archivo</span>
                  </button>
                </div>
              </div>
            )}

            {detectedColumns && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider mr-1">
                  Mapeo detectado:
                </span>
                <span className="inline-flex items-center space-x-1 text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>
                    ID: <strong>{detectedColumns.productIdCol}</strong>
                  </span>
                </span>
                {(
                  [
                    { key: 'vendorCol', label: 'Marca' },
                    { key: 'priceCol', label: 'Precio' },
                    { key: 'descriptionCol', label: 'Descripción' },
                  ] as const
                ).map(({ key, label }) => (
                  <span
                    key={key}
                    className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border ${
                      detectedColumns[key]
                        ? 'text-slate-700 bg-white border-slate-200'
                        : 'text-slate-400 bg-slate-100 border-slate-200'
                    }`}
                  >
                    {detectedColumns[key] ? <Check className="w-3 h-3 text-emerald-600" /> : <span className="text-[10px]">⚪</span>}
                    <span>
                      {label}: <strong>{detectedColumns[key] || 'Omitido'}</strong>
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Metric counters (semáforo) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl">
                <span className="text-[11px] font-medium text-purple-700 block">Productos a actualizar</span>
                <span className="text-xl font-bold text-purple-900 mt-1 block">{previewSummary.toUpdate}</span>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                <span className="text-[11px] font-medium text-emerald-700 block">Productos válidos</span>
                <span className="text-xl font-bold text-emerald-900 mt-1 block">{previewSummary.valid}</span>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <span className="text-[11px] font-medium text-amber-700 block">Advertencias</span>
                <span className="text-xl font-bold text-amber-900 mt-1 block">{previewSummary.warnings}</span>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                <span className="text-[11px] font-medium text-rose-700 block">Errores</span>
                <span className="text-xl font-bold text-rose-900 mt-1 block">{previewSummary.errors}</span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[11px] font-medium text-slate-500 block">Sin cambios</span>
                <span className="text-xl font-bold text-slate-700 mt-1 block">{previewSummary.noChange}</span>
              </div>
            </div>

            {/* Filter buttons (semáforo) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
              <span className="text-xs font-semibold text-slate-400 mr-2 flex items-center space-x-1">
                <Filter className="w-3 h-3" />
                <span>Filtrar:</span>
              </span>
              {[
                { id: 'all', label: `Todos (${previewRows.length})` },
                { id: 'toUpdate', label: `Por actualizar (${previewSummary.toUpdate})` },
                { id: 'warnings', label: `Advertencias (${previewSummary.warnings})` },
                { id: 'errors', label: `Errores (${previewSummary.errors})` },
                { id: 'noChange', label: `Sin cambios (${previewSummary.noChange})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    filterTab === tab.id ? 'bg-[#6012C3] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3.5 w-12 text-center">Estado</th>
                    <th className="py-3 px-3.5 w-36">Product ID</th>
                    <th className="py-3 px-3.5 min-w-[180px]">Producto</th>
                    <th className="py-3 px-3.5 min-w-[140px]">Campo(s)</th>
                    <th className="py-3 px-3.5 min-w-[220px]">Valor actual en Shopify</th>
                    <th className="py-3 px-3.5 min-w-[220px]">Nuevo valor propuesto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedPreviewRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        No hay productos en esta categoría.
                      </td>
                    </tr>
                  ) : (
                    displayedPreviewRows.map((row) => {
                      const isError = row.status === 'error';
                      const isWarning = row.status === 'warning';
                      const isNoChange = row.status === 'no_change';
                      const isValid = row.status === 'valid';

                      return (
                        <tr
                          key={`${row.rowNumber}-${row.productId}`}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isError ? 'bg-rose-50/30' : isWarning ? 'bg-amber-50/20' : ''
                          }`}
                        >
                          <td className="py-3 px-3.5 text-center">
                            {isValid && (
                              <span title="Listo para actualizar" className="inline-flex text-emerald-600 font-bold">
                                ✓
                              </span>
                            )}
                            {isWarning && (
                              <span title="Advertencia" className="inline-flex text-amber-500 font-bold">
                                ⚠
                              </span>
                            )}
                            {isError && (
                              <span title="Error" className="inline-flex text-rose-600 font-bold">
                                ❌
                              </span>
                            )}
                            {isNoChange && (
                              <span title="Sin cambios" className="inline-flex text-slate-400 font-bold">
                                ⚪
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3.5 font-mono text-slate-900 font-semibold">
                            {row.productId}
                            {row.messages.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {row.messages.map((m, i) => (
                                  <span
                                    key={i}
                                    className={`block text-[10px] leading-tight ${
                                      isError ? 'text-rose-600 font-medium' : isWarning ? 'text-amber-700' : 'text-slate-400'
                                    }`}
                                  >
                                    • {m}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3.5 font-medium text-slate-900">{row.productTitle}</td>

                          <td className="py-3 px-3.5">
                            {row.fieldsToUpdate.length === 0 ? (
                              <span className="text-slate-400 italic">Sin cambios</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {row.fieldsToUpdate.map((f) => (
                                  <span
                                    key={f}
                                    className="px-1.5 py-0.5 rounded bg-purple-50 text-[#6012C3] font-mono text-[10px] font-semibold border border-purple-200/60"
                                  >
                                    {fieldLabel(f)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3.5 space-y-1 text-[11px]">
                            {row.currentVendor && row.currentVendor !== '—' && (
                              <div>
                                <span className="text-slate-400">marca: </span>
                                <span className="text-slate-700">{row.currentVendor || '(Vacía)'}</span>
                              </div>
                            )}
                            {row.currentMinPrice !== null && (
                              <div>
                                <span className="text-slate-400">precio: </span>
                                <span className="text-slate-700">
                                  {row.currentMinPrice === row.currentMaxPrice
                                    ? formatMoney(row.currentMinPrice)
                                    : `${formatMoney(row.currentMinPrice)} – ${formatMoney(row.currentMaxPrice)}`}
                                </span>
                              </div>
                            )}
                            {row.currentDescription && row.currentDescription !== '—' && (
                              <div className="line-clamp-2 text-slate-500">
                                <span className="text-slate-400">desc: </span>
                                {row.currentDescription || '(Sin descripción)'}
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3.5 text-[11px] min-w-[220px] space-y-1">
                            {row.fieldsToUpdate.includes('vendor') && (
                              <div>
                                <span className="text-slate-400">marca: </span>
                                <span className="text-[#6012C3] font-bold">{row.newVendor}</span>
                              </div>
                            )}
                            {row.fieldsToUpdate.includes('price') && (
                              <div>
                                <span className="text-slate-400">precio: </span>
                                <span className="text-[#6012C3] font-bold">{formatMoney(row.newPrice)}</span>
                              </div>
                            )}
                            {row.fieldsToUpdate.includes('description') && (
                              <div className="line-clamp-2 text-[#4b0d9c]">
                                <span className="text-slate-400">desc: </span>
                                {row.newDescription}
                              </div>
                            )}
                            {row.fieldsToUpdate.length === 0 && <span className="text-slate-400 italic">Idéntico al actual</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Live Execution & Progress Bar */}
      {isExecuting && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-xs text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-[#6012C3]/10 text-[#6012C3] flex items-center justify-center mx-auto">
            <Clock className="w-7 h-7 animate-pulse" />
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-bold text-slate-900">Procesando actualizaciones en Shopify...</h3>
            <p className="text-xs text-slate-500">
              Controlando la tasa de concurrencia y límites de API de Shopify GraphQL de manera segura.
            </p>
            {(previewSummary?.toUpdate || 0) > 50 && (
              <p className="text-xs text-amber-700 font-medium">
                Lotes grandes ({previewSummary?.toUpdate} productos) pueden tardar varios minutos — no cierres esta
                pestaña.
              </p>
            )}
          </div>

          <div className="max-w-md mx-auto space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>
                Procesando {progressCount} / {previewSummary?.toUpdate}
              </span>
              <span>{Math.min(99, Math.round((progressCount / (previewSummary?.toUpdate || 1)) * 100))}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className="h-full bg-[#6012C3] transition-all duration-300 rounded-full"
                style={{ width: `${Math.min(100, Math.round((progressCount / (previewSummary?.toUpdate || 1)) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Execution Results Section */}
      {executionSummary && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-600 uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Procesamiento Finalizado</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">Resultados de la Actualización</h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('logs')}
                    className="px-3.5 py-2 text-xs font-semibold text-purple-800 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                  >
                    <Activity className="w-3.5 h-3.5 text-[#6012C3]" />
                    <span>Ver en Historial de Sesión</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Nueva carga</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Operación finalizada:</strong> Se actualizaron {executionSummary.success} producto(s) en
                  Shopify. Los registros detallados se han guardado en la bitácora de sesión.
                </span>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('logs')}
                  className="text-xs font-bold text-[#6012C3] hover:underline shrink-0 ml-3 cursor-pointer"
                >
                  Ir a Logs →
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                <div>
                  <span className="text-xs font-medium text-emerald-800">✓ Exitosos</span>
                  <span className="text-2xl font-bold text-emerald-950 block">{executionSummary.success}</span>
                </div>
              </div>

              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-3">
                <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
                <div>
                  <span className="text-xs font-medium text-rose-800">❌ Errores</span>
                  <span className="text-2xl font-bold text-rose-950 block">{executionSummary.errors}</span>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center space-x-3">
                <Info className="w-6 h-6 text-slate-500 shrink-0" />
                <div>
                  <span className="text-xs font-medium text-slate-600">⚪ Omitidos / Sin cambios</span>
                  <span className="text-2xl font-bold text-slate-800 block">{executionSummary.skipped}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3.5 w-36">Product ID</th>
                    <th className="py-3 px-3.5 min-w-[180px]">Producto</th>
                    <th className="py-3 px-3.5 w-28">Estado</th>
                    <th className="py-3 px-3.5 min-w-[150px]">Cambios</th>
                    <th className="py-3 px-3.5 min-w-[200px]">Detalle / Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {executionResults.map((r) => {
                    const isSuccess = r.status === 'success';
                    const isErr = r.status === 'error';
                    return (
                      <tr key={r.productId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3.5 font-mono text-slate-900 font-semibold">{r.productId}</td>
                        <td className="py-3 px-3.5 font-medium text-slate-900">{r.productTitle}</td>
                        <td className="py-3 px-3.5">
                          {isSuccess && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                              ✓ Actualizado
                            </span>
                          )}
                          {isErr && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800">
                              ❌ Error
                            </span>
                          )}
                          {!isSuccess && !isErr && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600">
                              Sin cambios
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          {r.updatedFields.length > 0 ? (
                            <span className="font-medium text-[#6012C3]">{r.updatedFields.map(fieldLabel).join(', ')}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5">
                          {r.errorMessage ? (
                            <span className="block text-rose-600 font-medium text-[11px]">{r.errorMessage}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="w-12 h-12 rounded-xl bg-[#6012C3]/10 text-[#6012C3] flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">Confirmar actualización masiva de catálogo</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Se actualizarán <strong>{previewSummary?.toUpdate}</strong> productos en Shopify. Esta acción puede
                modificar <strong>Marca, Precio y/o Descripción</strong> según lo detectado en cada fila.
              </p>
            </div>

            <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
              <p>
                • Productos válidos: <strong>{previewSummary?.valid}</strong>
              </p>
              <p>
                • Con advertencias: <strong>{previewSummary?.warnings}</strong>
              </p>
              <p>• Los productos con errores o sin cambios serán omitidos de forma segura.</p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecute}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#6012C3] hover:bg-[#4b0d9c] rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Confirmar actualización
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
