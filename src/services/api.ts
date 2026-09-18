import {
  ShopConnectionInfo,
  SessionStats,
  ShopifyProduct,
  PreviewRow,
  PreviewSummary,
  ExecutionResult,
  SessionLog,
  SEOAuditRow,
  SEOAuditSummary,
} from '../types/seo';

export async function getSessionStatus(): Promise<{
  connected: boolean;
  shop?: ShopConnectionInfo;
  stats?: SessionStats;
}> {
  const res = await fetch('/api/shopify/status');
  if (!res.ok) throw new Error('Error al consultar estado de sesión.');
  return res.json();
}

export async function connectShopify(
  storeDomain: string,
  accessToken: string
): Promise<{ success: boolean; shop: ShopConnectionInfo }> {
  const res = await fetch('/api/shopify/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeDomain, accessToken }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'No fue posible conectar con Shopify.');
  }
  return data;
}

export async function connectDemoShop(): Promise<{ success: boolean; shop: ShopConnectionInfo }> {
  const res = await fetch('/api/shopify/demo-connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'No fue posible iniciar la tienda de prueba.');
  }
  return data;
}

export async function disconnectShopify(): Promise<void> {
  const res = await fetch('/api/shopify/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Error al desconectar.');
}

export async function getProductById(productId: string): Promise<ShopifyProduct> {
  const res = await fetch(`/api/shopify/product/${encodeURIComponent(productId)}`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al buscar el producto en Shopify.');
  }
  return data.product;
}

export async function updateProductSEO(payload: {
  productId: string;
  handle?: string;
  seoTitle?: string;
  seoDescription?: string;
  previousHandle?: string;
}): Promise<ShopifyProduct & { redirectCreated?: boolean; redirectWarning?: string }> {
  const res = await fetch('/api/shopify/update-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'No fue posible actualizar el producto en Shopify.');
  }
  return { ...data.product, redirectCreated: data.redirectCreated, redirectWarning: data.redirectWarning };
}

export async function previewBulkRows(rows: any[]): Promise<{
  summary: PreviewSummary;
  previewRows: PreviewRow[];
}> {
  const res = await fetch('/api/shopify/preview-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al procesar la vista previa masiva.');
  }
  return { summary: data.summary, previewRows: data.previewRows };
}

export async function executeBulkUpdate(items: any[]): Promise<{
  summary: { total: number; success: number; errors: number; skipped: number };
  results: ExecutionResult[];
}> {
  const res = await fetch('/api/shopify/execute-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al ejecutar las actualizaciones masivas.');
  }
  return { summary: data.summary, results: data.results };
}

export async function scanSEOAudit(): Promise<{
  summary: SEOAuditSummary;
  products: SEOAuditRow[];
}> {
  const res = await fetch('/api/shopify/seo-audit/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al auditar productos en Shopify.');
  }
  return { summary: data.summary, products: data.products };
}

export async function getSessionLogs(): Promise<SessionLog[]> {
  const res = await fetch('/api/shopify/logs');
  const data = await res.json();
  if (!res.ok || !data.success) return [];
  return data.logs || [];
}

export async function addSessionLog(
  operation: string,
  status: 'success' | 'error' | 'warning' | 'info',
  message: string,
  productId?: string
): Promise<void> {
  try {
    await fetch('/api/shopify/add-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, status, message, productId }),
    });
  } catch {
    // safe silent fallback
  }
}

export async function clearSessionLogs(): Promise<void> {
  await fetch('/api/shopify/logs', { method: 'DELETE' });
}

// ==========================================
// ALT TEXT AI API CLIENT
// ==========================================

export async function getAltTextDashboard(): Promise<{
  stats: import('../types/seo').AltTextStats;
  providerStatus: {
    localConfigured: boolean;
    geminiConfigured: boolean;
    claudeConfigured: boolean;
    openaiConfigured: boolean;
    deepseekConfigured: boolean;
    defaultProvider: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek';
  };
}> {
  const res = await fetch('/api/shopify/alt-text/dashboard');
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al obtener estadísticas de Alt Text.');
  }
  return data;
}

export async function getAltTextProviderStatus(): Promise<{
  localConfigured: boolean;
  geminiConfigured: boolean;
  claudeConfigured: boolean;
  openaiConfigured: boolean;
  deepseekConfigured: boolean;
}> {
  const res = await fetch('/api/shopify/alt-text/provider-status');
  const data = await res.json();
  return data;
}

export async function saveSessionGeminiKey(apiKey: string): Promise<{ success: boolean; configured: boolean; message: string }> {
  const res = await fetch('/api/shopify/alt-text/gemini-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al guardar clave de Gemini.');
  }
  return data;
}

export async function saveSessionClaudeKey(apiKey: string): Promise<{ success: boolean; configured: boolean; message: string }> {
  const res = await fetch('/api/shopify/alt-text/claude-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al guardar clave de Claude.');
  }
  return data;
}

export async function saveSessionOpenAIKey(apiKey: string): Promise<{ success: boolean; configured: boolean; message: string }> {
  const res = await fetch('/api/shopify/alt-text/openai-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al guardar clave de OpenAI.');
  }
  return data;
}

export async function saveSessionDeepSeekKey(apiKey: string): Promise<{ success: boolean; configured: boolean; message: string }> {
  const res = await fetch('/api/shopify/alt-text/deepseek-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al guardar clave de DeepSeek.');
  }
  return data;
}

export async function saveDeepSeekReasoningEffort(
  reasoningEffort: 'none' | 'high'
): Promise<{ success: boolean; reasoningEffort: 'none' | 'high' }> {
  const res = await fetch('/api/shopify/alt-text/deepseek-reasoning', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reasoningEffort }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al ajustar el modo de razonamiento de DeepSeek.');
  }
  return data;
}

// ==========================================
// AI SETTINGS API CLIENT
// ==========================================

export async function getAISettings(): Promise<{
  selectedProvider: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek';
  hasExplicitSelection: boolean;
  localConfigured: boolean;
  geminiConfigured: boolean;
  claudeConfigured: boolean;
  openaiConfigured: boolean;
  deepseekConfigured: boolean;
  qwen2vlConfigured: boolean;
  deepseekReasoningEffort: 'none' | 'high';
}> {
  const res = await fetch('/api/shopify/ai-settings');
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al consultar la configuración de IA.');
  }
  return data;
}

export async function selectAIProvider(provider: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek'): Promise<{
  selectedProvider: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek';
  localConfigured: boolean;
  geminiConfigured: boolean;
  claudeConfigured: boolean;
  openaiConfigured: boolean;
  deepseekConfigured: boolean;
}> {
  const res = await fetch('/api/shopify/ai-settings/provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al seleccionar el proveedor de IA.');
  }
  return data;
}

export async function scanAltTextMedia(options: {
  mode?: 'all' | 'selected' | 'csv';
  productIds?: string[];
  csvRows?: any[];
  onlyWithoutAlt?: boolean;
  regenerateExisting?: boolean;
  sortBy?: 'missing_first' | 'category' | 'id';
}): Promise<{
  media: import('../types/seo').ProductMediaItem[];
  stats: import('../types/seo').AltTextStats;
}> {
  const res = await fetch('/api/shopify/alt-text/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al escanear imágenes de Shopify.');
  }
  return { media: data.media, stats: data.stats };
}

// The server keeps no memory of the Alt Text working list between calls
// (see server/session.ts) - the client (AltTextView.tsx) is the only place
// holding it, and passes its current list along on every call below so the
// server has something to work with for that one request.

export async function generateAltTextBatch(payload: {
  items: import('../types/seo').ProductMediaItem[];
  mediaIds?: string[];
  provider?: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek';
  regenerateExisting?: boolean;
}): Promise<{
  generatedCount: number;
  errorCount: number;
  media: import('../types/seo').ProductMediaItem[];
  stats: import('../types/seo').AltTextStats;
}> {
  const res = await fetch('/api/shopify/alt-text/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al generar Alt Text con IA.');
  }
  return data;
}

export async function applyAltTextItemAction(payload: {
  item: import('../types/seo').ProductMediaItem;
  action: 'approve' | 'reject' | 'edit' | 'decorative';
  newAlt?: string;
}): Promise<{
  item: import('../types/seo').ProductMediaItem;
}> {
  const res = await fetch('/api/shopify/alt-text/item-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al aplicar acción sobre imagen.');
  }
  return data;
}

export async function approveAllAltText(items: import('../types/seo').ProductMediaItem[]): Promise<{
  approvedCount: number;
  media: import('../types/seo').ProductMediaItem[];
  stats: import('../types/seo').AltTextStats;
}> {
  const res = await fetch('/api/shopify/alt-text/approve-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al aprobar textos alternativos.');
  }
  return data;
}

export async function updateAltTextInShopify(
  items: Array<{ productId: string; mediaId: string; newAlt: string }>,
  allItems: import('../types/seo').ProductMediaItem[]
): Promise<{
  updatedCount: number;
  errorCount: number;
  stats: import('../types/seo').AltTextStats;
  media: import('../types/seo').ProductMediaItem[];
  results: Array<{ productId: string; mediaId: string; status: 'success' | 'error'; error?: string }>;
}> {
  const res = await fetch('/api/shopify/alt-text/update-shopify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, allItems }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Error al actualizar Alt Text en Shopify.');
  }
  return data;
}
