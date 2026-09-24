export interface ShopConnectionInfo {
  name: string;
  domain: string;
  url?: string;
  connectedAt: string;
  isDemo: boolean;
}

export interface SessionStats {
  processed: number;
  found: number;
  pendingChanges: number;
  successful: number;
  errors: number;
}

export interface ShopifyProduct {
  id: string;
  numericId: string;
  title: string;
  handle: string;
  seoTitle: string;
  seoDescription: string;
}

export interface PreviewRow {
  rowNumber: number;
  productId: string;
  productTitle: string;
  currentHandle: string;
  newHandle: string;
  currentSeoTitle: string;
  newSeoTitle: string;
  currentSeoDescription: string;
  newSeoDescription: string;
  status: 'valid' | 'warning' | 'error' | 'no_change';
  messages: string[];
  fieldsToUpdate: string[];
}

export interface PreviewSummary {
  totalRows: number;
  valid: number;
  warnings: number;
  errors: number;
  noChange: number;
  toUpdate: number;
}

export interface SEOAuditRow {
  id: string;
  numericId: string;
  title: string;
  handle: string;
  seoTitle: string;
  seoDescription: string;
  status: 'ok' | 'warning' | 'error';
  messages: string[];
}

export interface SEOAuditSummary {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
}

export interface ExecutionResult {
  productId: string;
  productTitle: string;
  status: 'success' | 'error' | 'skipped';
  previousHandle: string;
  newHandle: string;
  previousSeoTitle: string;
  newSeoTitle: string;
  previousSeoDescription: string;
  newSeoDescription: string;
  updatedFields: string[];
  errorMessage?: string;
  processedAt: string;
  redirectCreated?: boolean;
  redirectWarning?: string;
}

export interface SessionLog {
  id: string;
  timestamp: string;
  productId?: string;
  operation: string;
  status: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export type ActiveTab = 'dashboard' | 'seo' | 'audit' | 'alt_text' | 'templates' | 'logs' | 'ai_settings';

export type CatalogAuditIssueType = 'vendor' | 'price_zero' | 'price_placeholder' | 'description';

export interface CatalogAuditVariant {
  sku: string;
  variantTitle: string;
  price: number;
}

export interface CatalogAuditFlaggedVariant {
  variantId: string;
  sku: string;
  variantTitle: string;
  price: number;
  issue: 'price_zero' | 'price_placeholder';
}

export interface CatalogAuditRow {
  id: string;
  numericId: string;
  title: string;
  handle: string;
  vendor: string;
  description: string;
  variants: CatalogAuditVariant[];
  flaggedVariants: CatalogAuditFlaggedVariant[];
  issues: CatalogAuditIssueType[];
  messages: string[];
}

export interface CatalogAuditSummary {
  total: number;
  ok: number;
  withIssues: number;
  vendorIssues: number;
  priceIssues: number;
  descriptionIssues: number;
}

export interface CatalogBulkPreviewRow {
  rowNumber: number;
  productId: string;
  productTitle: string;
  currentVendor: string;
  newVendor: string;
  sku: string;
  variantId: string | null;
  currentPrice: number | null;
  newPrice: number | null;
  currentDescription: string;
  newDescription: string;
  status: 'valid' | 'warning' | 'error' | 'no_change';
  messages: string[];
  fieldsToUpdate: string[];
}

export interface CatalogBulkPreviewSummary {
  totalRows: number;
  valid: number;
  warnings: number;
  errors: number;
  noChange: number;
  toUpdate: number;
}

export interface CatalogBulkExecutionResult {
  productId: string;
  productTitle: string;
  status: 'success' | 'error' | 'skipped';
  previousVendor: string;
  newVendor: string;
  sku: string;
  previousPrice: number | null;
  newPrice: number | null;
  previousDescription: string;
  newDescription: string;
  updatedFields: string[];
  errorMessage?: string;
  processedAt: string;
}

export type VisionProviderType = 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek';

export interface VisionContext {
  productId: string;
  productTitle: string;
  productType?: string;
  vendor?: string;
  description?: string;
  tags?: string[];
  features?: Record<string, string>;
  imagePosition?: number;
  totalImages?: number;
}

export interface AltTextGenerationResult {
  alt_text: string;
  is_decorative: boolean;
  confidence: number; // 0 - 1
  reason: string;
  provider: VisionProviderType;
}

export type AltTextMediaStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'updated'
  | 'error'
  | 'decorative';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ProductMediaItem {
  id: string; // Unique row key or mediaId
  mediaId: string;
  productId: string;
  productTitle: string;
  productType?: string;
  vendor?: string;
  description?: string;
  imageUrl: string;
  currentAlt: string;
  generatedAlt?: string;
  isDecorative?: boolean;
  position?: number;
  width?: number;
  height?: number;
  confidence?: number;
  confidenceLevel?: ConfidenceLevel;
  reason?: string;
  provider?: VisionProviderType;
  status: AltTextMediaStatus;
  isManuallyEdited?: boolean;
  errorMessage?: string;
  updatedAt?: string;
}

export interface AltTextStats {
  analyzedProducts: number;
  analyzedImages: number;
  imagesWithAlt: number;
  imagesWithoutAlt: number;
  generatedCount: number;
  pendingApproval: number;
  updatedCount: number;
  errorsCount: number;
  coveragePercent: number;
}

export type AltTextFilter =
  | 'all'
  | 'without_alt'
  | 'generated'
  | 'high_confidence'
  | 'medium_confidence'
  | 'low_confidence'
  | 'approved'
  | 'rejected'
  | 'updated'
  | 'decorative'
  | 'error';

export type AltTextSort = 'missing_first' | 'recent' | 'category' | 'id';
