import React, { useState, useEffect, useMemo } from 'react';
import {
  ShopConnectionInfo,
  ProductMediaItem,
  AltTextStats,
} from '../types/seo';
import {
  getAltTextDashboard,
  scanAltTextMedia,
  generateAltTextBatch,
  applyAltTextItemAction,
  approveAllAltText,
  updateAltTextInShopify,
  saveSessionGeminiKey,
  saveSessionClaudeKey,
  saveSessionOpenAIKey,
  saveSessionDeepSeekKey,
} from '../services/api';
import { downloadAltTextReport, downloadAltTextTemplateCsv } from '../utils/fileParser';
import {
  Sparkles,
  ShieldCheck,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Eye,
  Check,
  X,
  Edit3,
  Download,
  Upload,
  ArrowRight,
  Info,
  Lock,
  KeyRound,
  LayoutGrid,
  List,
  ChevronRight,
  HelpCircle,
  Tag,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface AltTextViewProps {
  shop: ShopConnectionInfo;
  onNavigateLogs?: () => void;
  onNavigateSettings?: () => void;
}

type KeyedProvider = 'gemini' | 'claude' | 'openai' | 'deepseek';

const KEY_MODAL_META: Record<
  KeyedProvider,
  {
    label: string;
    subtitle: string;
    placeholder: string;
    saveKey: (key: string) => Promise<{ success: boolean; configured: boolean; message: string }>;
  }
> = {
  gemini: {
    label: 'Gemini',
    subtitle: 'Google GenAI SDK (gemini-3.7-flash)',
    placeholder: 'AIzaSy...',
    saveKey: saveSessionGeminiKey,
  },
  claude: {
    label: 'Claude',
    subtitle: 'Anthropic SDK (claude-sonnet-5)',
    placeholder: 'sk-ant-...',
    saveKey: saveSessionClaudeKey,
  },
  openai: {
    label: 'ChatGPT',
    subtitle: 'OpenAI SDK (gpt-5.6-terra)',
    placeholder: 'sk-...',
    saveKey: saveSessionOpenAIKey,
  },
  deepseek: {
    label: 'DeepSeek',
    subtitle: 'DeepSeek API (deepseek-flash)',
    placeholder: 'sk-...',
    saveKey: saveSessionDeepSeekKey,
  },
};

// Mirrors the server's recalculateAltTextStats (server/session.ts) - needed
// client-side only for the single-item action, whose server response has no
// full-catalog context to compute aggregate stats from.
function computeLocalAltTextStats(list: ProductMediaItem[]): AltTextStats {
  const uniqueProducts = new Set(list.map((m) => m.productId));
  const total = list.length;
  const withAlt = list.filter((m) => m.currentAlt && m.currentAlt.trim().length > 0).length;
  const withoutAlt = total - withAlt;
  const generated = list.filter((m) => m.generatedAlt && m.generatedAlt.trim().length > 0).length;
  const pending = list.filter((m) => m.status === 'pending' && m.generatedAlt).length;
  const updated = list.filter((m) => m.status === 'updated').length;
  const errors = list.filter((m) => m.status === 'error').length;
  const coveragePercent = total > 0 ? Math.round((withAlt / total) * 100) : 100;

  return {
    analyzedProducts: uniqueProducts.size,
    analyzedImages: total,
    imagesWithAlt: withAlt,
    imagesWithoutAlt: withoutAlt,
    generatedCount: generated,
    pendingApproval: pending,
    updatedCount: updated,
    errorsCount: errors,
    coveragePercent,
  };
}

function getProviderLabel(p: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek'): string {
  switch (p) {
    case 'claude':
      return 'Claude Sonnet 5';
    case 'qwen2vl':
      return 'Qwen2-VL';
    case 'gemini':
      return 'Google Gemini';
    case 'openai':
      return 'ChatGPT (gpt-5.6-terra)';
    case 'deepseek':
      return 'DeepSeek (V4.1 Flash)';
    default:
      return 'IA Local';
  }
}

export const AltTextView: React.FC<AltTextViewProps> = ({ shop, onNavigateSettings }) => {
  // Stats & Items State
  const [stats, setStats] = useState<AltTextStats>({
    analyzedProducts: 0,
    analyzedImages: 0,
    imagesWithAlt: 0,
    imagesWithoutAlt: 0,
    generatedCount: 0,
    pendingApproval: 0,
    updatedCount: 0,
    errorsCount: 0,
    coveragePercent: 0,
  });
  const [mediaItems, setMediaItems] = useState<ProductMediaItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Provider & Configuration
  const [provider, setProvider] = useState<'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek'>('claude');
  const [configuredProviders, setConfiguredProviders] = useState<Record<KeyedProvider, boolean>>({
    gemini: false,
    claude: false,
    openai: false,
    deepseek: false,
  });
  // One generic key-entry modal shared by every provider that needs a key,
  // instead of a near-duplicate modal per provider.
  const [activeKeyModal, setActiveKeyModal] = useState<KeyedProvider | null>(null);
  const [keyModalInput, setKeyModalInput] = useState('');

  // Scan Parameters
  const [scanMode, setScanMode] = useState<'all' | 'selected' | 'csv'>('all');
  const [productIdsInput, setProductIdsInput] = useState('');
  const [onlyWithoutAlt, setOnlyWithoutAlt] = useState(true);
  const [regenerateExisting, setRegenerateExisting] = useState(false);
  const [sortBy, setSortBy] = useState<'missing_first' | 'category' | 'id'>('missing_first');

  // UI View & Filter State
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'pending' | 'approved' | 'updated' | 'decorative'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewImageModal, setPreviewImageModal] = useState<{ url: string; title: string; alt: string } | null>(null);

  // Loading & Progress States
  const [isScanning, setIsScanning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUpdatingShopify, setIsUpdatingShopify] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inline editing state: mediaId -> current text
  const [editingAlts, setEditingAlts] = useState<Record<string, string>>({});

  // Initial Load
  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await getAltTextDashboard();
      if (data.stats) setStats(data.stats);
      if (data.providerStatus) {
        setConfiguredProviders({
          gemini: data.providerStatus.geminiConfigured,
          claude: data.providerStatus.claudeConfigured,
          openai: data.providerStatus.openaiConfigured,
          deepseek: data.providerStatus.deepseekConfigured,
        });
        // Default this tool's provider to whatever was chosen in Configuración de IA,
        // so switching it there is enough - no need to also flip it here.
        setProvider(data.providerStatus.defaultProvider);
      }
      // Trigger automatic initial scan to populate workspace immediately
      handleScan();
    } catch {
      // Fallback
    }
  };

  const handleSaveKeyModalInput = async () => {
    if (!activeKeyModal) return;
    try {
      const res = await KEY_MODAL_META[activeKeyModal].saveKey(keyModalInput.trim());
      setConfiguredProviders((prev) => ({ ...prev, [activeKeyModal]: res.configured }));
      setActiveKeyModal(null);
      setKeyModalInput('');
      setActionSuccessMessage(res.message);
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || `Error al guardar clave de ${KEY_MODAL_META[activeKeyModal].label}.`);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setErrorMessage(null);
    try {
      const parsedIds =
        scanMode === 'selected'
          ? productIdsInput
              .split(/[\n,;]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;

      const res = await scanAltTextMedia({
        mode: scanMode,
        productIds: parsedIds,
        onlyWithoutAlt,
        regenerateExisting,
        sortBy,
      });

      setMediaItems(res.media);
      setStats(res.stats);
      setSelectedIds(new Set(res.media.map((m) => m.id || m.mediaId)));

      // Initialize inline editing buffer
      const buffer: Record<string, string> = {};
      res.media.forEach((m) => {
        const id = m.id || m.mediaId;
        buffer[id] = m.generatedAlt || m.currentAlt || '';
      });
      setEditingAlts(buffer);

      setActionSuccessMessage(
        `Escaneo exitoso: ${res.stats.analyzedProducts} productos y ${res.stats.analyzedImages} imágenes detectadas.`
      );
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error durante el escaneo de Shopify.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleGenerateAI = async () => {
    if (provider in KEY_MODAL_META) {
      const keyedProvider = provider as KeyedProvider;
      if (!configuredProviders[keyedProvider]) {
        setActiveKeyModal(keyedProvider);
        return;
      }
    }

    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const targetIds: string[] = Array.from(selectedIds);
      const res = await generateAltTextBatch({
        items: mediaItems,
        mediaIds: targetIds.length > 0 ? targetIds : undefined,
        provider,
        regenerateExisting,
      });

      setMediaItems(res.media);
      setStats(res.stats);

      // Refresh editing buffer
      const buffer: Record<string, string> = {};
      res.media.forEach((m) => {
        const id = m.id || m.mediaId;
        buffer[id] = m.generatedAlt || m.currentAlt || '';
      });
      setEditingAlts(buffer);

      const providerLabel = getProviderLabel(provider);

      if (res.errorCount > 0 && res.generatedCount === 0) {
        // Every attempted image failed - this is NOT a success, so don't show
        // the green banner claiming otherwise. Surface a real error detail
        // (e.g. an invalid API Key or an unreachable local Ollama server)
        // instead of a silent "0 imágenes procesadas".
        const failedItem = res.media.find((m) => m.status === 'error' && m.errorMessage);
        setErrorMessage(
          `${providerLabel} no pudo generar ninguna imagen (${res.errorCount} error${res.errorCount === 1 ? '' : 'es'}).` +
            (failedItem ? ` ${failedItem.errorMessage}` : ' Revisa la configuración del proveedor en Configuración de IA.')
        );
      } else if (res.errorCount > 0) {
        setActionSuccessMessage(
          `Generación con ${providerLabel}: ${res.generatedCount} imágenes procesadas, ${res.errorCount} con error (revisa el detalle en cada tarjeta).`
        );
        setTimeout(() => setActionSuccessMessage(null), 6000);
      } else {
        setActionSuccessMessage(
          `Generación completada con ${providerLabel}: ${res.generatedCount} imágenes procesadas.`
        );
        setTimeout(() => setActionSuccessMessage(null), 5000);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al generar Alt Text.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveAll = async () => {
    try {
      const res = await approveAllAltText(mediaItems);
      setMediaItems(res.media);
      setStats(res.stats);
      setActionSuccessMessage(`${res.approvedCount} textos alternativos aprobados para sincronización.`);
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al aprobar textos alternativos.');
    }
  };

  const handleItemAction = async (
    mediaId: string,
    action: 'approve' | 'reject' | 'edit' | 'decorative',
    newAlt?: string
  ) => {
    const current = mediaItems.find((item) => item.id === mediaId || item.mediaId === mediaId);
    if (!current) return;

    try {
      const res = await applyAltTextItemAction({ item: current, action, newAlt });
      const updatedList = mediaItems.map((item) =>
        item.id === mediaId || item.mediaId === mediaId ? res.item : item
      );
      setMediaItems(updatedList);
      // This is a single-item action - the server has no memory of the full
      // catalog to recompute aggregate stats from, so they're derived here
      // instead (every other action below still gets its stats from the
      // server, which does have the full list for that one request).
      setStats(computeLocalAltTextStats(updatedList));
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al actualizar acción de la imagen.');
    }
  };

  const handleCommitShopify = async () => {
    setIsUpdatingShopify(true);
    setShowConfirmModal(false);
    setErrorMessage(null);

    try {
      // Build items to update
      const itemsToUpdate = mediaItems
        .filter((m) => m.status === 'approved')
        .map((m) => ({
          productId: m.productId,
          mediaId: m.id || m.mediaId,
          newAlt: editingAlts[m.id || m.mediaId] !== undefined ? editingAlts[m.id || m.mediaId] : (m.generatedAlt || ''),
        }));

      if (itemsToUpdate.length === 0) {
        setErrorMessage('No hay imágenes aprobadas para actualizar. Aprueba primero los textos propuestos.');
        setIsUpdatingShopify(false);
        return;
      }

      const res = await updateAltTextInShopify(itemsToUpdate, mediaItems);
      setMediaItems(res.media);
      setStats(res.stats);

      setActionSuccessMessage(
        `Actualización completada: ${res.updatedCount} textos alternativos aplicados en Shopify.`
      );
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al actualizar Shopify.');
    } finally {
      setIsUpdatingShopify(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((m) => m.id || m.mediaId)));
    }
  };

  // Filtered & Searched List
  const filteredItems = useMemo(() => {
    return mediaItems.filter((item) => {
      // Status Filter
      if (statusFilter === 'missing') {
        if (item.currentAlt && item.currentAlt.trim().length > 0) return false;
      } else if (statusFilter === 'pending') {
        if (item.status !== 'pending') return false;
      } else if (statusFilter === 'approved') {
        if (item.status !== 'approved') return false;
      } else if (statusFilter === 'updated') {
        if (item.status !== 'updated') return false;
      } else if (statusFilter === 'decorative') {
        if (!item.isDecorative && item.status !== 'decorative') return false;
      }

      // Search query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesTitle = item.productTitle?.toLowerCase().includes(q);
        const matchesId = item.productId?.includes(q);
        const matchesAlt = (item.generatedAlt || item.currentAlt || '').toLowerCase().includes(q);
        if (!matchesTitle && !matchesId && !matchesAlt) return false;
      }

      return true;
    });
  }, [mediaItems, statusFilter, searchTerm]);

  const approvedCount = mediaItems.filter((m) => m.status === 'approved').length;
  const pendingCount = mediaItems.filter((m) => m.status === 'pending' && m.generatedAlt).length;

  return (
    <div className="space-y-6">
      {/* Module Title Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#6012C3]/10 text-[#6012C3] flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Alt Text AI — Optimización Visual & Accesibilidad
              </h1>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-[#6012C3] border border-purple-200">
                Shopify Media API
              </span>
            </div>
            <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
              Detecta imágenes de productos sin texto alternativo y genera descripciones descriptivas, naturales y optimizadas para SEO.
              <strong className="text-slate-800 font-semibold"> Las imágenes nunca se reemplazan, descargan ni alteran;</strong> solo se actualiza el atributo de texto alternativo en Shopify.
            </p>
          </div>

          {/* Privacy & Safe Mutation Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-medium border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>100% Inocuo: Cero Alteración de Archivos</span>
            </div>
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>{shop.isDemo ? 'Modo Tienda Demo' : shop.storeDomain}</span>
            </div>
          </div>
        </div>

        {/* Action alerts */}
        {actionSuccessMessage && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center space-x-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Control Panel: Provider Selector & Scan Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Provider Selector (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-[#6012C3]" />
              <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                Motor de Inteligencia Artificial
              </h2>
            </div>
            <span className="text-[11px] font-medium text-slate-500">{getProviderLabel(provider)}</span>
          </div>

          {onNavigateSettings && (
            <button
              onClick={onNavigateSettings}
              className="text-[11px] text-[#6012C3] font-semibold hover:underline cursor-pointer -mt-2"
            >
              Administrar proveedores y API Keys en Configuración de IA →
            </button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Option A: Claude (Sonnet 5) - fully independent from Qwen2-VL. */}
            <button
              id="btn-provider-claude"
              onClick={() => {
                setProvider('claude');
                if (!configuredProviders.claude) setActiveKeyModal('claude');
              }}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                provider === 'claude'
                  ? 'border-[#6012C3] bg-[#6012C3]/5 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-900">Claude Sonnet 5</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Modelo general de Anthropic para texto, razonamiento y análisis de imágenes.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <KeyRound className="w-3 h-3 text-[#6012C3]" />
                  <span>{configuredProviders.claude ? 'Clave activa en RAM' : 'Configurar API Key'}</span>
                </span>
                <span className="text-[#6012C3] font-semibold">Editar</span>
              </div>
            </button>

            {/* Option B: Qwen2-VL - free, local via Ollama, independent of Claude's API/key. */}
            <button
              id="btn-provider-qwen2vl"
              onClick={() => setProvider('qwen2vl')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                provider === 'qwen2vl'
                  ? 'border-[#6012C3] bg-[#6012C3]/5 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-900">Qwen2-VL</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    Recomendado
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Modelo de visión dedicado a Alt Text, vía Ollama local. Gratis e independiente de Claude - no usa
                  su API Key ni cuenta de Anthropic.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center space-x-1 text-[10px] text-slate-500">
                <Lock className="w-3 h-3 text-emerald-600" />
                <span>Sin API Key - requiere Ollama local</span>
              </div>
            </button>

            {/* Option C: Google Gemini */}
            <button
              id="btn-provider-gemini"
              onClick={() => {
                setProvider('gemini');
                if (!configuredProviders.gemini) setActiveKeyModal('gemini');
              }}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                provider === 'gemini'
                  ? 'border-[#6012C3] bg-[#6012C3]/5 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-900">Google Gemini</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Análisis visual multimodal avanzado para imágenes de producto complejas o de múltiples ángulos.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <KeyRound className="w-3 h-3 text-[#6012C3]" />
                  <span>{configuredProviders.gemini ? 'Clave activa en RAM' : 'Configurar API Key'}</span>
                </span>
                <span className="text-[#6012C3] font-semibold">Editar</span>
              </div>
            </button>

            {/* Option D: ChatGPT (gpt-5.6-terra - gpt-4o was retired from the API in feb-2026) */}
            <button
              id="btn-provider-openai"
              onClick={() => {
                setProvider('openai');
                if (!configuredProviders.openai) setActiveKeyModal('openai');
              }}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                provider === 'openai'
                  ? 'border-[#6012C3] bg-[#6012C3]/5 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-900">ChatGPT</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Modelo multimodal vigente de OpenAI (gpt-5.6-terra). gpt-4o fue retirado de la API en feb-2026.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <KeyRound className="w-3 h-3 text-[#6012C3]" />
                  <span>{configuredProviders.openai ? 'Clave activa en RAM' : 'Configurar API Key'}</span>
                </span>
                <span className="text-[#6012C3] font-semibold">Editar</span>
              </div>
            </button>

            {/* Option E: DeepSeek (V4.1 Flash - V3/R1 are text-only, can't see images) */}
            <button
              id="btn-provider-deepseek"
              onClick={() => {
                setProvider('deepseek');
                if (!configuredProviders.deepseek) setActiveKeyModal('deepseek');
              }}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                provider === 'deepseek'
                  ? 'border-[#6012C3] bg-[#6012C3]/5 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-900">DeepSeek</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  V4.1 Flash - el único modelo de DeepSeek con visión real. El switch de razonamiento (equivalente a
                  R1) se ajusta en Configuración de IA.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center space-x-1">
                  <KeyRound className="w-3 h-3 text-[#6012C3]" />
                  <span>{configuredProviders.deepseek ? 'Clave activa en RAM' : 'Configurar API Key'}</span>
                </span>
                <span className="text-[#6012C3] font-semibold">Editar</span>
              </div>
            </button>

            {/* Option F: Local AI */}
            <button
              id="btn-provider-local"
              onClick={() => setProvider('local')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                provider === 'local'
                  ? 'border-[#6012C3] bg-[#6012C3]/5 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-900">IA Local (Alternativa)</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Procesamiento local 100% privado. La imagen no sale de tu servidor ni se envía a terceros.
                </p>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center space-x-1 text-[10px] text-slate-500">
                <Lock className="w-3 h-3 text-emerald-600" />
                <span>Privacidad garantizada</span>
              </div>
            </button>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start space-x-2">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              <strong>Estilo SEO:</strong> Genera descripciones concisas (80-125 caracteres), en español neutro, sin relleno de palabras clave y enfocadas en valor visual y accesibilidad según lineamientos oficiales.
            </p>
          </div>
        </div>

        {/* Scan & Detection Configuration (6 cols) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-[#6012C3]" />
              <h2 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                Configuración de Detección en Shopify
              </h2>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={downloadAltTextTemplateCsv}
                className="text-[11px] text-[#6012C3] hover:underline flex items-center space-x-1"
              >
                <Download className="w-3 h-3" />
                <span>Descargar plantilla CSV</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Alcance del Escaneo
              </label>
              <select
                value={scanMode}
                onChange={(e) => setScanMode(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6012C3]"
              >
                <option value="all">Todo el catálogo (Completo)</option>
                <option value="selected">Productos específicos (por ID)</option>
                <option value="csv">Importar lista desde CSV</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Filtro de Detección
              </label>
              <div className="space-y-1">
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyWithoutAlt}
                    onChange={(e) => setOnlyWithoutAlt(e.target.checked)}
                    className="rounded text-[#6012C3] focus:ring-[#6012C3]"
                  />
                  <span>Solo imágenes sin Alt</span>
                </label>
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regenerateExisting}
                    onChange={(e) => setRegenerateExisting(e.target.checked)}
                    className="rounded text-[#6012C3] focus:ring-[#6012C3]"
                  />
                  <span>Regenerar existentes</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Orden de Trabajo
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6012C3]"
              >
                <option value="missing_first">Sin Alt Text primero</option>
                <option value="id">Por Product ID</option>
                <option value="category">Por Categoría / Tipo</option>
              </select>
            </div>
          </div>

          {/* Conditional Product ID Input */}
          {scanMode === 'selected' && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Shopify Product IDs (separados por coma o salto de línea)
              </label>
              <textarea
                value={productIdsInput}
                onChange={(e) => setProductIdsInput(e.target.value)}
                placeholder="1234567890123, 9876543210987, 4567890123456"
                rows={2}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6012C3]"
              />
            </div>
          )}

          {/* Scan Action Button */}
          <div className="flex items-center justify-end space-x-3 pt-1">
            <button
              id="btn-scan-catalog"
              onClick={handleScan}
              disabled={isScanning}
              className="px-5 py-2.5 bg-[#6012C3] hover:bg-[#4d0e9e] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Consultando Shopify Admin API...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Escanear Imágenes de Productos</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics & Coverage Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Productos
          </span>
          <span className="text-xl font-bold text-slate-800 mt-1 block">
            {stats.analyzedProducts}
          </span>
          <span className="text-[10px] text-slate-500">en sesión</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Total Imágenes
          </span>
          <span className="text-xl font-bold text-slate-800 mt-1 block">
            {stats.analyzedImages}
          </span>
          <span className="text-[10px] text-slate-500">detectadas</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Sin Alt Text
          </span>
          <span className="text-xl font-bold text-rose-600 mt-1 block">
            {stats.imagesWithoutAlt}
          </span>
          <span className="text-[10px] text-rose-500 font-medium">requieren optimización</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Cobertura Alt Text
          </span>
          <div className="flex items-baseline space-x-1 mt-1">
            <span className="text-xl font-bold text-emerald-700">
              {stats.coveragePercent}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${stats.coveragePercent}%` }}
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Listas / Pendientes
          </span>
          <span className="text-xl font-bold text-[#6012C3] mt-1 block">
            {pendingCount}
          </span>
          <span className="text-[10px] text-purple-600 font-medium">para aprobación</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
            Actualizadas
          </span>
          <span className="text-xl font-bold text-emerald-600 mt-1 block">
            {stats.updatedCount}
          </span>
          <span className="text-[10px] text-emerald-600 font-medium">en Shopify</span>
        </div>
      </div>

      {/* Batch Actions & Filtering Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Status filter pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `Todas (${mediaItems.length})` },
              { id: 'missing', label: `Sin Alt Text (${mediaItems.filter((m) => !m.currentAlt).length})` },
              { id: 'pending', label: `Generadas (${pendingCount})` },
              { id: 'approved', label: `Aprobadas (${approvedCount})` },
              { id: 'updated', label: `Actualizadas (${mediaItems.filter((m) => m.status === 'updated').length})` },
              { id: 'decorative', label: `Decorativas (${mediaItems.filter((m) => m.isDecorative).length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search box & View switch */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar producto, ID o texto..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6012C3] w-48 sm:w-60"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Vista en Cuadrícula"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Vista en Tabla"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={toggleSelectAll}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center space-x-1.5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedIds.size > 0 && selectedIds.size === filteredItems.length}
                onChange={() => {}}
                className="rounded text-[#6012C3] focus:ring-[#6012C3]"
              />
              <span>
                {selectedIds.size === filteredItems.length ? 'Deseleccionar todas' : 'Seleccionar todas'} ({selectedIds.size})
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Generate Alt Text */}
            <button
              id="btn-generate-ai-batch"
              onClick={handleGenerateAI}
              disabled={isGenerating || filteredItems.length === 0}
              className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-[#6012C3] border border-purple-200 text-xs font-bold rounded-xl transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>
                {isGenerating
                  ? 'Generando con IA...'
                  : selectedIds.size > 0
                  ? `Generar para (${selectedIds.size}) seleccionadas`
                  : 'Generar para sin Alt Text'}
              </span>
            </button>

            {/* Approve All */}
            <button
              onClick={handleApproveAll}
              disabled={pendingCount === 0}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Aprobar generadas ({pendingCount})</span>
            </button>

            {/* Commit to Shopify */}
            <button
              id="btn-update-shopify-alt"
              onClick={() => setShowConfirmModal(true)}
              disabled={isUpdatingShopify || approvedCount === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Actualizar en Shopify ({approvedCount} aprobadas)</span>
            </button>

            {/* Export Report */}
            <button
              onClick={() => downloadAltTextReport(mediaItems)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium rounded-xl transition-all flex items-center space-x-1"
              title="Descargar Reporte CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Exportar CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Items View: Grid or Table */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            No se encontraron imágenes con los filtros seleccionados
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Prueba ajustando el término de búsqueda o presiona &ldquo;Escanear Imágenes de Productos&rdquo; para sincronizar la galería de tu catálogo.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredItems.map((item) => {
            const id = item.id || item.mediaId;
            const currentEdit = editingAlts[id] !== undefined ? editingAlts[id] : (item.generatedAlt || item.currentAlt || '');
            const charCount = currentEdit.length;
            const isSelected = selectedIds.has(id);

            // Character count visual rules (Ideal: 80 - 125 chars)
            const isIdealLength = charCount >= 80 && charCount <= 125;
            const isTooShort = charCount > 0 && charCount < 50;
            const isTooLong = charCount > 125;

            return (
              <div
                key={id}
                className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col overflow-hidden shadow-xs ${
                  isSelected ? 'border-[#6012C3] ring-1 ring-[#6012C3]/30' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Card Header: Product info & selection checkbox */}
                <div className="p-3.5 bg-slate-50/80 border-b border-slate-100 flex items-start justify-between gap-2">
                  <div className="flex items-start space-x-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(id)}
                      className="mt-0.5 rounded text-[#6012C3] focus:ring-[#6012C3]"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate" title={item.productTitle}>
                        {item.productTitle}
                      </h4>
                      <div className="flex items-center space-x-2 text-[10px] text-slate-500 mt-0.5">
                        <span className="font-mono">ID: {item.productId}</span>
                        {item.productType && (
                          <>
                            <span>•</span>
                            <span className="truncate">{item.productType}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {item.status === 'updated' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Actualizado
                      </span>
                    )}
                    {item.status === 'approved' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                        Aprobado
                      </span>
                    )}
                    {item.status === 'pending' && item.generatedAlt && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-[#6012C3] border border-purple-200">
                        Propuesto
                      </span>
                    )}
                    {item.status === 'rejected' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                        Rechazado
                      </span>
                    )}
                    {item.isDecorative && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        Decorativa
                      </span>
                    )}
                    {!item.currentAlt && !item.generatedAlt && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        Sin Alt Text
                      </span>
                    )}
                  </div>
                </div>

                {/* Media Image Area & Meta */}
                <div className="relative bg-slate-100 flex items-center justify-center p-3 h-48 group">
                  <img
                    src={item.imageUrl}
                    alt={item.currentAlt || item.productTitle}
                    className="max-h-full max-w-full object-contain rounded-lg shadow-2xs"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=400&q=80';
                    }}
                  />

                  {/* Position Pill Overlay */}
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/60 text-white rounded-md text-[10px] font-medium backdrop-blur-xs">
                    Pos #{item.position} {item.position === 1 ? '• Principal' : ''}
                  </div>

                  {/* Zoom Overlay Button */}
                  <button
                    onClick={() =>
                      setPreviewImageModal({
                        url: item.imageUrl,
                        title: item.productTitle,
                        alt: currentEdit || item.currentAlt || 'Sin Alt Text',
                      })
                    }
                    className="absolute bottom-2.5 right-2.5 p-1.5 bg-white/90 hover:bg-white text-slate-800 rounded-lg text-xs shadow-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-semibold">Ver grande</span>
                  </button>
                </div>

                {/* Alt Text Comparison & Inline Editor */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2.5">
                    {/* Current Alt State */}
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        <span>Alt Text Actual en Shopify</span>
                        {item.currentAlt ? (
                          <span className="text-emerald-700 font-semibold">{item.currentAlt.length} car.</span>
                        ) : (
                          <span className="text-rose-600 font-semibold">Vacío</span>
                        )}
                      </div>
                      <p className="text-xs p-2 bg-slate-50 rounded-lg text-slate-600 italic border border-slate-100 min-h-[34px] leading-relaxed">
                        {item.currentAlt ? `"${item.currentAlt}"` : '<Sin texto alternativo configurado>'}
                      </p>
                    </div>

                    {/* Proposed / Editable Alt Text */}
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        <span className="flex items-center space-x-1">
                          <Sparkles className="w-3 h-3 text-[#6012C3]" />
                          <span>Texto Alternativo Propuesto</span>
                        </span>
                        <div className="flex items-center space-x-1.5">
                          {isIdealLength && (
                            <span className="text-[10px] font-semibold text-emerald-600">
                              Ideal ({charCount} car.)
                            </span>
                          )}
                          {isTooShort && (
                            <span className="text-[10px] font-semibold text-amber-600">
                              Breve ({charCount} car.)
                            </span>
                          )}
                          {isTooLong && (
                            <span className="text-[10px] font-semibold text-amber-700">
                              Extenso ({charCount} car.)
                            </span>
                          )}
                          {charCount === 0 && (
                            <span className="text-[10px] text-slate-400">0 car.</span>
                          )}
                        </div>
                      </div>

                      <textarea
                        rows={3}
                        value={currentEdit}
                        onChange={(e) => {
                          const val = e.target.value;
                          setEditingAlts((prev) => ({ ...prev, [id]: val }));
                          // Auto update item state
                          item.generatedAlt = val;
                          item.isManuallyEdited = true;
                          item.status = 'approved';
                        }}
                        placeholder="Descripción objetiva de la imagen (80 a 125 caracteres)..."
                        className={`w-full p-2 text-xs rounded-xl border focus:outline-none focus:ring-2 leading-relaxed transition-all ${
                          isIdealLength
                            ? 'border-emerald-200 focus:ring-emerald-500 bg-emerald-50/20'
                            : isTooLong
                            ? 'border-amber-300 focus:ring-amber-500 bg-amber-50/20'
                            : 'border-slate-200 focus:ring-[#6012C3] bg-white'
                        }`}
                      />
                    </div>

                    {/* AI Confidence and Rules Indicators */}
                    {item.confidence !== undefined && (
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                        <span className="flex items-center space-x-1">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              item.confidence >= 0.85
                                ? 'bg-emerald-500'
                                : item.confidence >= 0.7
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                          />
                          <span>
                            Confianza: {Math.round(item.confidence * 100)}% (
                            {item.confidence >= 0.85 ? 'Alta' : item.confidence >= 0.7 ? 'Media' : 'Revisión'}
                            )
                          </span>
                        </span>
                        <span className="font-mono text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                          {item.provider ? getProviderLabel(item.provider) : 'IA Local'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions for single item */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleItemAction(id, 'decorative')}
                      className={`text-[11px] px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                        item.isDecorative
                          ? 'bg-slate-800 text-white font-semibold'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                      }`}
                      title="Marcar como imagen decorativa (alt='')"
                    >
                      Decorativa
                    </button>

                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleItemAction(id, 'reject')}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Rechazar texto propuesto"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleItemAction(id, 'approve', currentEdit)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                          item.status === 'approved'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{item.status === 'approved' ? 'Aprobado' : 'Aprobar'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === filteredItems.length}
                      onChange={toggleSelectAll}
                      className="rounded text-[#6012C3] focus:ring-[#6012C3]"
                    />
                  </th>
                  <th className="p-3.5 w-20">Imagen</th>
                  <th className="p-3.5 w-48">Producto</th>
                  <th className="p-3.5 w-52">Alt Text Actual</th>
                  <th className="p-3.5">Alt Text Propuesto (Editable)</th>
                  <th className="p-3.5 w-28">Confianza</th>
                  <th className="p-3.5 w-32">Estado</th>
                  <th className="p-3.5 w-28 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const id = item.id || item.mediaId;
                  const currentEdit = editingAlts[id] !== undefined ? editingAlts[id] : (item.generatedAlt || item.currentAlt || '');
                  const isSelected = selectedIds.has(id);

                  return (
                    <tr key={id} className={`hover:bg-slate-50/60 transition-colors ${isSelected ? 'bg-purple-50/20' : ''}`}>
                      <td className="p-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(id)}
                          className="rounded text-[#6012C3] focus:ring-[#6012C3]"
                        />
                      </td>
                      <td className="p-3.5">
                        <div
                          onClick={() =>
                            setPreviewImageModal({
                              url: item.imageUrl,
                              title: item.productTitle,
                              alt: currentEdit || item.currentAlt || 'Sin Alt Text',
                            })
                          }
                          className="w-14 h-14 bg-slate-100 rounded-lg p-1 flex items-center justify-center cursor-pointer border border-slate-200 overflow-hidden hover:opacity-80"
                        >
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-800 line-clamp-1">{item.productTitle}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {item.productId}</div>
                        <div className="text-[10px] text-slate-500">Pos #{item.position}</div>
                      </td>
                      <td className="p-3.5">
                        {item.currentAlt ? (
                          <div className="text-slate-600 line-clamp-2 italic">&ldquo;{item.currentAlt}&rdquo;</div>
                        ) : (
                          <span className="text-rose-500 font-semibold text-[11px]">&lt;Sin Alt Text&gt;</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        <input
                          type="text"
                          value={currentEdit}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditingAlts((prev) => ({ ...prev, [id]: val }));
                            item.generatedAlt = val;
                            item.isManuallyEdited = true;
                            item.status = 'approved';
                          }}
                          placeholder="Texto descriptivo objetivo..."
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6012C3]"
                        />
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                          <span>{currentEdit.length} caracteres</span>
                          {currentEdit.length >= 80 && currentEdit.length <= 125 ? (
                            <span className="text-emerald-600 font-semibold">Ideal (80-125)</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-3.5">
                        {item.confidence !== undefined ? (
                          <div className="flex items-center space-x-1">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                item.confidence >= 0.85
                                  ? 'bg-emerald-500'
                                  : item.confidence >= 0.7
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                            />
                            <span className="font-semibold">{Math.round(item.confidence * 100)}%</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3.5">
                        {item.status === 'updated' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            Actualizado
                          </span>
                        )}
                        {item.status === 'approved' && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            Aprobado
                          </span>
                        )}
                        {item.status === 'pending' && item.generatedAlt && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-[#6012C3]">
                            Pendiente
                          </span>
                        )}
                        {item.isDecorative && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                            Decorativa
                          </span>
                        )}
                        {!item.currentAlt && !item.generatedAlt && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            Falta Alt
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleItemAction(id, 'approve', currentEdit)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="Aprobar"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleItemAction(id, 'reject')}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Rechazar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal before Updating Shopify */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                Confirmar actualización de Alt Text en Shopify
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Estás a punto de actualizar el atributo <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono font-bold">alt</code> de <strong>{approvedCount} imágenes</strong> aprobadas en tu tienda Shopify.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="flex items-center space-x-2 font-semibold text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Garantía de Seguridad Doto SEO</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-500">
                <li>No se alteran archivos ni dimensiones de imagen.</li>
                <li>No se modifican URLs públicas de CDN.</li>
                <li>Únicamente se actualiza el campo de texto alternativo vía GraphQL <code className="text-slate-700">productUpdateMedia</code>.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isUpdatingShopify}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-shopify-push"
                onClick={handleCommitShopify}
                disabled={isUpdatingShopify}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                {isUpdatingShopify ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Actualizando en Shopify...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Aplicar Cambios en Shopify</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generic API Key Configuration Modal (RAM ONLY) - shared by every
          provider that needs a key (Gemini, Claude, ChatGPT, DeepSeek). */}
      {activeKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-[#6012C3] flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Configurar {KEY_MODAL_META[activeKeyModal].label} API Key
                  </h3>
                  <span className="text-[10px] text-slate-500">{KEY_MODAL_META[activeKeyModal].subtitle}</span>
                </div>
              </div>
              <button
                onClick={() => setActiveKeyModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Ingresa tu API Key de {KEY_MODAL_META[activeKeyModal].label} para habilitar el modelo de visión
              multimodal.
            </p>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold">
                <Lock className="w-3.5 h-3.5 text-amber-700" />
                <span>Política Estricta de Privacidad</span>
              </div>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                La API Key se almacena <strong>únicamente en memoria RAM</strong> durante la sesión activa en el servidor. Nunca se guarda en base de datos, discos, localStorage ni registros de log.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                API Key de {KEY_MODAL_META[activeKeyModal].label}
              </label>
              <input
                type="password"
                value={keyModalInput}
                onChange={(e) => setKeyModalInput(e.target.value)}
                placeholder={KEY_MODAL_META[activeKeyModal].placeholder}
                className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6012C3]"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setActiveKeyModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                id={`btn-save-${activeKeyModal}-key`}
                onClick={handleSaveKeyModalInput}
                className="px-5 py-2 text-xs font-bold text-white bg-[#6012C3] hover:bg-[#4d0e9e] rounded-xl transition-all shadow-xs cursor-pointer"
              >
                Guardar en Memoria de Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImageModal && (
        <div
          onClick={() => setPreviewImageModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-3 shadow-2xl border border-slate-200 overflow-hidden cursor-default"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-900 truncate max-w-md">
                {previewImageModal.title}
              </h4>
              <button
                onClick={() => setPreviewImageModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-100 rounded-xl p-4 flex items-center justify-center max-h-[60vh] overflow-hidden">
              <img
                src={previewImageModal.url}
                alt={previewImageModal.alt}
                className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Texto Alternativo Actual / Propuesto
              </span>
              <p className="text-xs text-slate-800 leading-relaxed italic">
                &ldquo;{previewImageModal.alt}&rdquo;
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
