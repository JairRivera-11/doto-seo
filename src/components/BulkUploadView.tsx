import React, { useState, useRef, useEffect } from 'react';
import { PreviewRow, PreviewSummary, ExecutionResult, ShopConnectionInfo, ActiveTab } from '../types/seo';
import { parseUploadFile, downloadExecutionReport, downloadCSVTemplate, downloadExcelTemplate } from '../utils/fileParser';
import { previewBulkRows, executeBulkUpdate } from '../services/api';
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
  Sparkles,
  Info,
  Check,
  Filter,
  Activity,
} from 'lucide-react';

interface BulkUploadViewProps {
  shop: ShopConnectionInfo;
  onExecutionCompleted?: () => void;
  onNavigate?: (tab: ActiveTab) => void;
  // Pre-selected rows coming from the SEO Audit tab (bypasses the file dropzone
  // and opens straight into an editable preview instead of a CSV/Excel upload).
  initialRows?: Array<{ productId: string; handle: string; seoTitle: string; seoDescription: string }>;
}

export const BulkUploadView: React.FC<BulkUploadViewProps> = ({ shop, onExecutionCompleted, onNavigate, initialRows }) => {
  // File state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<{
    productIdCol?: string;
    handleCol?: string;
    seoTitleCol?: string;
    seoDescCol?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewSummary, setPreviewSummary] = useState<PreviewSummary | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
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
  const [executionResults, setExecutionResults] = useState<ExecutionResult[]>([]);

  // Editable bulk-edit mode, entered when arriving from the SEO Audit tab's
  // "Editar en tabla" action instead of a CSV/Excel upload.
  const [isEditableMode, setIsEditableMode] = useState(false);
  const [editableValues, setEditableValues] = useState<
    Record<string, { handle: string; seoTitle: string; seoDescription: string }>
  >({});
  const [isRevalidating, setIsRevalidating] = useState(false);

  // Drag & drop handlers
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
      // 1. Parse CSV/Excel into structured rows
      const { rows, columnMapping } = await parseUploadFile(file);
      setDetectedColumns(columnMapping);

      if (rows.length === 0) {
        throw new Error('No se detectaron registros válidos en el archivo.');
      }

      // 2. Fetch current store state and compute validation diff
      const previewData = await previewBulkRows(rows);
      setPreviewSummary(previewData.summary);
      setPreviewRows(previewData.previewRows);
    } catch (err: any) {
      setParseError(err.message || 'Error al procesar el archivo.');
    } finally {
      setIsParsing(false);
    }
  };

  // Reset entire workflow
  const handleReset = () => {
    setSelectedFile(null);
    setParseError(null);
    setExecutionError(null);
    setDetectedColumns(null);
    setPreviewSummary(null);
    setPreviewRows([]);
    setExecutionSummary(null);
    setExecutionResults([]);
    setIsEditableMode(false);
    setEditableValues({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Build an initial preview straight from rows selected in the SEO Audit tab
  // (no file involved) — reuses the same server-side previewBulkRows validation.
  const runAuditPreview = async (rows: Array<{ productId: string; handle: string; seoTitle: string; seoDescription: string }>) => {
    setIsEditableMode(true);
    setParseError(null);
    setExecutionError(null);
    setPreviewSummary(null);
    setPreviewRows([]);
    setExecutionSummary(null);
    setExecutionResults([]);
    setIsParsing(true);

    const initialEditable: Record<string, { handle: string; seoTitle: string; seoDescription: string }> = {};
    rows.forEach((r) => {
      initialEditable[r.productId] = { handle: r.handle, seoTitle: r.seoTitle, seoDescription: r.seoDescription };
    });
    setEditableValues(initialEditable);

    try {
      const requestRows = rows.map((r, index) => ({
        rowNumber: index + 1,
        productId: r.productId,
        handle: r.handle,
        seoTitle: r.seoTitle,
        seoDescription: r.seoDescription,
      }));
      const previewData = await previewBulkRows(requestRows);
      setPreviewSummary(previewData.summary);
      setPreviewRows(previewData.previewRows);
    } catch (err: any) {
      setParseError(err.message || 'Error al preparar la edición en lote desde la Auditoría.');
    } finally {
      setIsParsing(false);
    }
  };

  useEffect(() => {
    if (initialRows && initialRows.length > 0) {
      runAuditPreview(initialRows);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows]);

  const updateEditableField = (
    productId: string,
    field: 'handle' | 'seoTitle' | 'seoDescription',
    value: string
  ) => {
    setEditableValues((prev) => {
      const current = prev[productId] || { handle: '', seoTitle: '', seoDescription: '' };
      return { ...prev, [productId]: { ...current, [field]: value } };
    });
  };

  // Re-run server-side validation (format, length, handle-collision-in-file)
  // against the values the user just edited in the preview table.
  const handleRevalidate = async () => {
    setIsRevalidating(true);
    setParseError(null);
    try {
      const requestRows = previewRows.map((r) => ({
        rowNumber: r.rowNumber,
        productId: r.productId,
        handle: editableValues[r.productId]?.handle ?? r.newHandle,
        seoTitle: editableValues[r.productId]?.seoTitle ?? r.newSeoTitle,
        seoDescription: editableValues[r.productId]?.seoDescription ?? r.newSeoDescription,
      }));
      const previewData = await previewBulkRows(requestRows);
      setPreviewSummary(previewData.summary);
      setPreviewRows(previewData.previewRows);
    } catch (err: any) {
      setParseError(err.message || 'Error al revalidar los cambios.');
    } finally {
      setIsRevalidating(false);
    }
  };

  // Run execution
  const handleExecute = async () => {
    setShowConfirmModal(false);
    setIsExecuting(true);
    setExecutionError(null);
    setProgressCount(0);

    try {
      // Filter rows that actually need updates
      const itemsToUpdate = previewRows
        .filter((r) => r.status === 'valid' || r.status === 'warning')
        .map((r) => ({
          productId: r.productId,
          productTitle: r.productTitle,
          currentHandle: r.currentHandle,
          newHandle: r.newHandle,
          currentSeoTitle: r.currentSeoTitle,
          newSeoTitle: r.newSeoTitle,
          currentSeoDescription: r.currentSeoDescription,
          newSeoDescription: r.newSeoDescription,
          fieldsToUpdate: r.fieldsToUpdate,
        }));

      if (itemsToUpdate.length === 0) {
        throw new Error('No hay productos con cambios válidos para actualizar.');
      }

      // Progress animation simulation during batch network processing
      const interval = setInterval(() => {
        setProgressCount((prev) => {
          if (prev >= itemsToUpdate.length - 1) {
            clearInterval(interval);
            return prev;
          }
          return prev + Math.ceil(itemsToUpdate.length / 10);
        });
      }, 300);

      const res = await executeBulkUpdate(itemsToUpdate);
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

  // Filtered rows for the preview table
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
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Actualización masiva
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Importa un archivo CSV o Excel (.xlsx, .xls) para auditar y actualizar de forma masiva Handle, SEO Title y Meta Description.
          </p>
        </div>

        {/* Quick template download buttons */}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={downloadCSVTemplate}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-[#6012C3]" />
            <span>Plantilla CSV</span>
          </button>
          <button
            type="button"
            onClick={downloadExcelTemplate}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Plantilla Excel (.xlsx)</span>
          </button>
        </div>
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
                !previewSummary && !executionSummary
                  ? 'bg-[#6012C3] text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {!previewSummary && !executionSummary ? '1' : '✓'}
            </div>
            <div>
              <p className="font-bold leading-tight">Paso 1: {isEditableMode ? 'Origen' : 'Archivo'}</p>
              <p className="text-[11px] opacity-80">
                {isEditableMode
                  ? 'Productos seleccionados en Auditoría'
                  : !selectedFile
                  ? 'Selecciona CSV o Excel'
                  : selectedFile.name}
              </p>
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
                {previewSummary
                  ? `${previewSummary.toUpdate} cambios detectados`
                  : 'Validación y auditoría'}
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
      {!isEditableMode && !previewSummary && !isExecuting && !executionSummary && (
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
            <h3 className="text-base font-bold text-slate-800">
              Haz clic o arrastra tu archivo aquí
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Formatos soportados: <span className="font-semibold text-slate-700">.csv, .xlsx, .xls</span>
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
              <span className="bg-white px-2 py-1 rounded-md border border-slate-200">Product ID (Obligatorio)</span>
              <span className="bg-white px-2 py-1 rounded-md border border-slate-200">URL Handle</span>
              <span className="bg-white px-2 py-1 rounded-md border border-slate-200">SEO Title</span>
              <span className="bg-white px-2 py-1 rounded-md border border-slate-200">Meta Description</span>
            </div>
          </div>

          {/* Parsing spinner */}
          {isParsing && (
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center space-x-3">
              <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>Analizando archivo y consultando productos en Shopify...</span>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Error en la lectura del archivo</p>
                <p className="text-rose-700 mt-0.5">{parseError}</p>
              </div>
            </div>
          )}

          {/* Helper instructions card */}
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-600 space-y-2">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
              <Info className="w-4 h-4 text-[#6012C3]" />
              <span>Reglas de validación antes de actualizar</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-500 pl-1 text-[11px]">
              <li>
                <strong>Celdas vacías:</strong> Si dejas una celda en blanco en el archivo, ese campo <strong>NO se modificará</strong> en Shopify.
              </li>
              <li>
                <strong>Modo Solo Cambios:</strong> Si el valor propuesto es exactamente igual al actual en Shopify, se clasifica como <em>"Sin cambios"</em> y no consume operaciones innecesarias.
              </li>
              <li>
                <strong>Validación de Handles:</strong> Se comprueba que el nuevo handle no esté asignado a otro producto en la tienda para prevenir colisiones de URL.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Loading / error state while preparing an audit-driven bulk edit */}
      {isEditableMode && !previewSummary && !isExecuting && !executionSummary && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          {isParsing && (
            <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs flex items-center space-x-3">
              <div className="w-4 h-4 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />
              <span>Preparando edición en lote a partir de la Auditoría...</span>
            </div>
          )}
          {parseError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Error al preparar la edición en lote</p>
                <p className="text-rose-700 mt-0.5">{parseError}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview Section */}
      {previewSummary && !executionSummary && !isExecuting && (
        <div className="space-y-6">
          {/* Summary Box */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <FileSpreadsheet className="w-4 h-4 text-[#6012C3]" />
                  <span>
                    {isEditableMode ? 'Origen: Auditoría SEO (edición en lote)' : `Archivo cargado: ${selectedFile?.name}`}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                  Resumen de Validación Previa
                </h2>
              </div>

              <div className="flex items-center space-x-2">
                {isEditableMode && (
                  <button
                    type="button"
                    onClick={handleRevalidate}
                    disabled={isRevalidating}
                    className="px-3.5 py-2 text-xs font-semibold text-[#6012C3] hover:text-[#4b0d9c] bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isRevalidating ? (
                      <div className="w-3.5 h-3.5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Revalidar cambios</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isEditableMode ? 'Cancelar edición en lote' : 'Cambiar archivo'}</span>
                </button>

                <button
                  id="btn-confirm-bulk-trigger"
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

            {/* Execution Error Banner if any */}
            {executionError && (
              <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs flex items-start space-x-3 shadow-2xs">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Error durante la ejecución en Shopify</p>
                  <p className="text-rose-800 mt-1 leading-relaxed">{executionError}</p>
                  <p className="text-[11px] text-rose-600 mt-2">
                    Verifica la conexión con Shopify o consulta el detalle en la pestaña de Historial de Sesión.
                  </p>
                </div>
              </div>
            )}

            {/* Action Required Banner: Explicit warning that changes are NOT yet applied */}
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
                      <strong>{previewSummary.toUpdate} productos con cambios listos</strong>. Para guardar
                      estos valores directamente en tu tienda Shopify, debes hacer clic en el botón de confirmación.
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
                  <h4 className="font-bold text-slate-900 uppercase tracking-wide">
                    0 productos por actualizar
                  </h4>
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

            {/* Detected Columns Badges */}
            {detectedColumns && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-500 text-[11px] uppercase tracking-wider mr-1">
                  Mapeo detectado:
                </span>
                <span className="inline-flex items-center space-x-1 text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>ID: <strong>{detectedColumns.productIdCol}</strong></span>
                </span>
                <span
                  className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border ${
                    detectedColumns.handleCol
                      ? 'text-slate-700 bg-white border-slate-200'
                      : 'text-slate-400 bg-slate-100 border-slate-200'
                  }`}
                >
                  {detectedColumns.handleCol ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <span className="text-[10px]">⚪</span>
                  )}
                  <span>Handle: <strong>{detectedColumns.handleCol || 'Omitido'}</strong></span>
                </span>
                <span
                  className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border ${
                    detectedColumns.seoTitleCol
                      ? 'text-slate-700 bg-white border-slate-200'
                      : 'text-slate-400 bg-slate-100 border-slate-200'
                  }`}
                >
                  {detectedColumns.seoTitleCol ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <span className="text-[10px]">⚪</span>
                  )}
                  <span>SEO Title: <strong>{detectedColumns.seoTitleCol || 'Omitido'}</strong></span>
                </span>
                <span
                  className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md border ${
                    detectedColumns.seoDescCol
                      ? 'text-slate-700 bg-white border-slate-200'
                      : 'text-slate-400 bg-slate-100 border-slate-200'
                  }`}
                >
                  {detectedColumns.seoDescCol ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <span className="text-[10px]">⚪</span>
                  )}
                  <span>Meta Desc: <strong>{detectedColumns.seoDescCol || 'Omitido'}</strong></span>
                </span>
              </div>
            )}

            {/* Metric counters */}
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

            {/* Filter buttons */}
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
                    filterTab === tab.id
                      ? 'bg-[#6012C3] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
                          {/* Estado badge */}
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

                          {/* Product ID */}
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

                          {/* Product Title */}
                          <td className="py-3 px-3.5 font-medium text-slate-900">
                            {row.productTitle}
                          </td>

                          {/* Campos modificados */}
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
                                    {f === 'handle' ? 'Handle' : f === 'seoTitle' ? 'SEO Title' : 'Meta Description'}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>

                          {/* Valor actual */}
                          <td className="py-3 px-3.5 space-y-1 text-[11px]">
                            {row.currentHandle && (
                              <div>
                                <span className="text-slate-400 font-mono">handle: </span>
                                <span className="font-mono text-slate-700">{row.currentHandle}</span>
                              </div>
                            )}
                            {row.currentSeoTitle && (
                              <div>
                                <span className="text-slate-400">title: </span>
                                <span className="text-slate-700">{row.currentSeoTitle}</span>
                              </div>
                            )}
                            {row.currentSeoDescription && (
                              <div className="line-clamp-2 text-slate-500">
                                <span className="text-slate-400">desc: </span>
                                {row.currentSeoDescription}
                              </div>
                            )}
                          </td>

                          {/* Nuevo valor */}
                          <td className="py-3 px-3.5 text-[11px] min-w-[240px]">
                            {isEditableMode ? (
                              <div className="space-y-1.5">
                                <div>
                                  <label className="text-slate-400 font-mono block text-[10px]">handle</label>
                                  <input
                                    type="text"
                                    value={editableValues[row.productId]?.handle ?? row.newHandle}
                                    onChange={(e) =>
                                      updateEditableField(
                                        row.productId,
                                        'handle',
                                        e.target.value.toLowerCase().replace(/\s+/g, '-')
                                      )
                                    }
                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-[#6012C3] focus:border-[#6012C3]"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 block text-[10px]">SEO Title</label>
                                  <input
                                    type="text"
                                    value={editableValues[row.productId]?.seoTitle ?? row.newSeoTitle}
                                    onChange={(e) => updateEditableField(row.productId, 'seoTitle', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-[11px] focus:outline-none focus:ring-1 focus:ring-[#6012C3] focus:border-[#6012C3]"
                                  />
                                </div>
                                <div>
                                  <label className="text-slate-400 block text-[10px]">Meta Description</label>
                                  <textarea
                                    rows={2}
                                    value={editableValues[row.productId]?.seoDescription ?? row.newSeoDescription}
                                    onChange={(e) => updateEditableField(row.productId, 'seoDescription', e.target.value)}
                                    className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-[11px] resize-y focus:outline-none focus:ring-1 focus:ring-[#6012C3] focus:border-[#6012C3]"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {row.newHandle && row.newHandle !== row.currentHandle && (
                                  <div>
                                    <span className="text-slate-400 font-mono">handle: </span>
                                    <span className="font-mono text-[#6012C3] font-bold">{row.newHandle}</span>
                                  </div>
                                )}
                                {row.newSeoTitle && row.newSeoTitle !== row.currentSeoTitle && (
                                  <div>
                                    <span className="text-slate-400">title: </span>
                                    <span className="text-[#6012C3] font-semibold">{row.newSeoTitle}</span>
                                  </div>
                                )}
                                {row.newSeoDescription && row.newSeoDescription !== row.currentSeoDescription && (
                                  <div className="line-clamp-2 text-[#4b0d9c]">
                                    <span className="text-slate-400">desc: </span>
                                    {row.newSeoDescription}
                                  </div>
                                )}
                                {row.fieldsToUpdate.length === 0 && (
                                  <span className="text-slate-400 italic">Identico al actual</span>
                                )}
                              </div>
                            )}
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
            <h3 className="text-xl font-bold text-slate-900">
              Procesando actualizaciones en Shopify...
            </h3>
            <p className="text-xs text-slate-500">
              Controlando la tasa de concurrencia y límites de API de Shopify GraphQL de manera segura.
            </p>
          </div>

          {/* Progress bar */}
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span>Procesando {progressCount} / {previewSummary?.toUpdate}</span>
              <span>
                {Math.round((progressCount / (previewSummary?.toUpdate || 1)) * 100)}%
              </span>
            </div>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
              <div
                className="h-full bg-[#6012C3] transition-all duration-300 rounded-full"
                style={{
                  width: `${Math.min(100, Math.round((progressCount / (previewSummary?.toUpdate || 1)) * 100))}%`,
                }}
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
                <h2 className="text-xl font-bold text-slate-900 mt-0.5">
                  Resultados de la Actualización
                </h2>
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
                  onClick={() => downloadExecutionReport(executionResults)}
                  className="px-4 py-2 bg-[#6012C3] hover:bg-[#4b0d9c] text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar reporte CSV</span>
                </button>

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

            {/* Status confirmation banner */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Operación finalizada:</strong> Se actualizaron {executionSummary.success} producto(s) en Shopify. Los registros detallados se han guardado en la bitácora de sesión.
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

            {/* Results statistics banner */}
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

          {/* Results table */}
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
                            <span className="font-medium text-[#6012C3]">
                              {r.updatedFields
                                .map((f) => (f === 'handle' ? 'Handle' : f === 'seoTitle' ? 'SEO Title' : 'Meta Description'))
                                .join(', ')}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 space-y-0.5">
                          {r.errorMessage ? (
                            <span className="block text-rose-600 font-medium text-[11px]">{r.errorMessage}</span>
                          ) : !r.redirectCreated && !r.redirectWarning ? (
                            <span className="text-slate-400">—</span>
                          ) : null}
                          {r.redirectCreated && (
                            <span className="block text-emerald-600 text-[11px]">✓ Redirect 301 creado</span>
                          )}
                          {r.redirectWarning && (
                            <span className="block text-amber-600 text-[11px]">⚠ Redirect no creado: {r.redirectWarning}</span>
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

      {/* Confirmation Modal required by specifications */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="w-12 h-12 rounded-xl bg-[#6012C3]/10 text-[#6012C3] flex items-center justify-center">
              <UploadCloud className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">
                Confirmar actualización masiva
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Se actualizarán <strong>{previewSummary?.toUpdate}</strong> productos en Shopify. Esta acción modificará únicamente <strong>Handle, SEO Title y Meta Description</strong>.
              </p>
            </div>

            <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 text-xs text-purple-900 space-y-1">
              <p>• Productos válidos: <strong>{previewSummary?.valid}</strong></p>
              <p>• Con advertencias de longitud: <strong>{previewSummary?.warnings}</strong></p>
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
                id="btn-confirm-bulk-execution"
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
