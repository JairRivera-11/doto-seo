import { getIronSession, IronSession } from 'iron-session';
import type { IncomingMessage, ServerResponse } from 'http';
import { ShopifyProductSEO } from '../src/components/shopifyService.ts';

export interface InMemSession {
  shopDomain: string;
  accessToken: string;
  shopName: string;
  shopUrl?: string;
  connectedAt: string;
  isDemo: boolean;
}

export interface SessionLogEntry {
  id: string;
  timestamp: string;
  productId?: string;
  operation: string;
  status: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

export interface SessionStatsData {
  processed: number;
  found: number;
  pendingChanges: number;
  successful: number;
  errors: number;
}

export interface AltTextMediaRecordLike {
  id: string;
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
  position: number;
  width?: number;
  height?: number;
  confidence?: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  reason?: string;
  provider?: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek';
  status: 'pending' | 'approved' | 'rejected' | 'updated' | 'error' | 'decorative';
  isManuallyEdited?: boolean;
  errorMessage?: string;
}

/**
 * Everything the app needs to remember for a session now lives here instead
 * of in module-level `let` variables - Vercel runs each request on a
 * possibly-different, ephemeral serverless instance, so process memory
 * cannot be the source of truth. This whole object is sealed into a single
 * encrypted, httpOnly cookie (iron-session) - no external store, matching
 * the app's existing "never persisted outside the active session" privacy
 * model, just moved from server RAM to the user's own browser cookie.
 *
 * Kept deliberately small (a browser cookie caps out around 4KB sealed):
 * - `logs` is capped far below its old 500-entry limit (see MAX_LOGS).
 * - Demo catalog edits are stored as small overrides merged onto a fixed
 *   seed at read time, not as a full copy of the demo catalog.
 * - The Alt Text AI working list (which can be huge for a real store) is
 *   NOT stored here at all - the client already holds it in React state
 *   after scanning, and every Alt Text route now takes the relevant items
 *   in the request body and returns the result, remembering nothing
 *   between calls (see server.ts's Alt Text routes).
 */
export interface AppSessionData {
  shop?: InMemSession;
  stats?: SessionStatsData;
  logs?: SessionLogEntry[];
  demoProductOverrides?: Record<string, Partial<ShopifyProductSEO>>;
  demoMediaOverrides?: Record<string, Partial<AltTextMediaRecordLike>>;
  demoCatalogAuditOverrides?: Record<string, Partial<CatalogAuditProductLike>>;
  aiKeys?: {
    gemini?: string;
    claude?: string;
    openai?: string;
    deepseek?: string;
  };
  deepseekReasoningEffort?: 'none' | 'high';
  selectedAIProvider?: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek' | null;
}

const SESSION_PASSWORD = process.env.SESSION_SECRET;
if (!SESSION_PASSWORD || SESSION_PASSWORD.length < 32) {
  throw new Error(
    'SESSION_SECRET debe estar definida en .env (o en las variables de entorno de Vercel) con al menos 32 caracteres. ' +
      'Genera una con: openssl rand -base64 32'
  );
}

export function getSession(
  req: IncomingMessage,
  res: ServerResponse
): Promise<IronSession<AppSessionData>> {
  return getIronSession<AppSessionData>(req, res, {
    cookieName: 'doto_seo_session',
    password: SESSION_PASSWORD,
    cookieOptions: {
      // Vercel serves everything over HTTPS; local dev is plain http://, where
      // a `secure` cookie would silently never be sent back by the browser.
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  });
}

/**
 * Always use this instead of calling `session.save()` directly. iron-session
 * throws synchronously if the sealed cookie would exceed the browser's ~4KB
 * limit, instead of truncating - confirmed by hand-testing a heavy session
 * (all 4 AI keys + several logged operations hit 4704 bytes and crashed the
 * process outright). This shrinks the least-important field (logs) and
 * retries a few times before giving up, so a request never crashes the
 * whole server over a cookie a few bytes too big.
 */
export async function saveSession(session: IronSession<AppSessionData>): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await session.save();
      return;
    } catch (err: any) {
      const isSizeError = /cookie length is too big|too big/i.test(err?.message || '');
      if (!isSizeError) throw err;
      if (session.logs && session.logs.length > 0) {
        // Drop the oldest half (rounded down to at least 1) and try again.
        const keep = Math.max(0, Math.floor(session.logs.length / 2));
        session.logs = session.logs.slice(0, keep);
        continue;
      }
      // No logs left to drop and it's still too big - give up quietly rather
      // than crash the request; the session simply won't persist this write.
      console.error('[session] Cookie still too large after dropping all logs - not persisting this write.', err?.message);
      return;
    }
  }
}

export function freshStats(): SessionStatsData {
  return { processed: 0, found: 0, pendingChanges: 0, successful: 0, errors: 0 };
}

// Cookies have a hard ~4KB ceiling once sealed, and iron-session THROWS
// (synchronously, from inside the async save()) if that's exceeded rather
// than truncating - confirmed by hand: a session with all 4 AI keys plus a
// handful of logged operations reached 4704 bytes and crashed the whole
// Node process on an uncaught exception. Two defenses, not just one:
// keep logs small going in (cap + truncate each message), AND make
// `saveSession` below shrink and retry instead of ever letting that throw
// reach the caller - a serverless function crashing a whole request over a
// cookie a few bytes too big would be a much worse failure mode than
// quietly dropping its oldest log entries.
const MAX_LOGS = 6;
const MAX_LOG_MESSAGE_LENGTH = 200;

export function addLog(
  session: IronSession<AppSessionData>,
  operation: string,
  status: 'success' | 'error' | 'warning' | 'info',
  message: string,
  productId?: string
) {
  const log: SessionLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toLocaleTimeString('es-MX', { hour12: false }),
    productId,
    operation,
    status,
    message: message.length > MAX_LOG_MESSAGE_LENGTH ? `${message.slice(0, MAX_LOG_MESSAGE_LENGTH)}…` : message,
  };
  if (!session.logs) session.logs = [];
  session.logs.unshift(log);
  if (session.logs.length > MAX_LOGS) {
    session.logs = session.logs.slice(0, MAX_LOGS);
  }
}

// ==========================================
// DEMO CATALOG (fixed seeds + small per-session overrides)
// ==========================================

export const DEMO_PRODUCTS_SEED: Record<string, ShopifyProductSEO> = {
  '1234567890123': {
    id: 'gid://shopify/Product/1234567890123',
    numericId: '1234567890123',
    title: 'Samsung Galaxy S25 Ultra 512GB',
    handle: 'samsung-galaxy-s25-ultra-512gb',
    seoTitle: 'Samsung Galaxy S25 Ultra 512GB | Doto',
    seoDescription: 'Compra el nuevo Samsung Galaxy S25 Ultra con cámara de 200MP y Snapdragon 8 Elite al mejor precio en Doto.',
  },
  '9876543210987': {
    id: 'gid://shopify/Product/9876543210987',
    numericId: '9876543210987',
    title: 'Apple iPhone 16 Pro Max 256GB Titanio Natural',
    handle: 'apple-iphone-16-pro-max-256gb-titanio-natural',
    seoTitle: 'iPhone 16 Pro Max 256GB - Oferta Doto',
    seoDescription: 'Descubre el nuevo Apple iPhone 16 Pro Max con chip A18 Pro y botón de Control de Cámara. Envíos gratis a todo México.',
  },
  '4567890123456': {
    id: 'gid://shopify/Product/4567890123456',
    numericId: '4567890123456',
    title: 'Sony WH-1000XM5 Audífonos Inalámbricos Noise Cancelling',
    handle: 'sony-wh-1000xm5-audifonos-inalambricos',
    seoTitle: 'Sony WH-1000XM5 Audífonos Cancelación de Ruido',
    seoDescription: 'Audífonos inalámbricos Sony WH-1000XM5 con cancelación de ruido líder en la industria y hasta 30 horas de batería.',
  },
  '7890123456789': {
    id: 'gid://shopify/Product/7890123456789',
    numericId: '7890123456789',
    title: 'Xiaomi 14 Ultra 512GB Blanco Fotografía Leica',
    handle: 'xiaomi-14-ultra-512gb-blanco-leica',
    seoTitle: 'Xiaomi 14 Ultra Leica 512GB | Doto',
    seoDescription: 'El smartphone definitivo para fotografía con óptica Leica Summilux y sensor de 1 pulgada. Cómpralo con garantía en Doto.',
  },
  '3344556677889': {
    id: 'gid://shopify/Product/3344556677889',
    numericId: '3344556677889',
    title: 'Nintendo Switch OLED Modelo Blanco',
    handle: 'nintendo-switch-oled-blanco',
    seoTitle: 'Consola Nintendo Switch OLED Blanco en Oferta',
    seoDescription: 'Consola Nintendo Switch con pantalla OLED vibrante de 7 pulgadas, soporte ajustable y 64 GB de almacenamiento.',
  },
};

/** Merged view (seed + this session's edits) - use for reads/validation. */
export function getDemoProducts(session: IronSession<AppSessionData>): Map<string, ShopifyProductSEO> {
  const overrides = session.demoProductOverrides || {};
  const map = new Map<string, ShopifyProductSEO>();
  for (const [id, seed] of Object.entries(DEMO_PRODUCTS_SEED)) {
    map.set(id, { ...seed, ...(overrides[id] || {}) });
  }
  return map;
}

/** Persist an edit to one demo product as a small override (not a full-catalog copy). */
export function setDemoProductOverride(session: IronSession<AppSessionData>, id: string, updated: ShopifyProductSEO) {
  if (!session.demoProductOverrides) session.demoProductOverrides = {};
  session.demoProductOverrides[id] = {
    handle: updated.handle,
    seoTitle: updated.seoTitle,
    seoDescription: updated.seoDescription,
  };
}

export const DEMO_PRODUCT_MEDIA_SEED: AltTextMediaRecordLike[] = [
  {
    id: 'gid://shopify/MediaImage/90101',
    mediaId: '90101',
    productId: '1234567890123',
    productTitle: 'Samsung Galaxy S25 Ultra 512GB',
    vendor: 'Samsung',
    productType: 'Celulares',
    description: 'Smartphone Samsung Galaxy S25 Ultra con cámara de 200MP y procesador Snapdragon 8 Elite.',
    imageUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=800&q=80',
    currentAlt: 'Samsung Galaxy S25 Ultra 512GB negro visto de frente',
    position: 1,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90102',
    mediaId: '90102',
    productId: '1234567890123',
    productTitle: 'Samsung Galaxy S25 Ultra 512GB',
    vendor: 'Samsung',
    productType: 'Celulares',
    description: 'Smartphone Samsung Galaxy S25 Ultra con cámara de 200MP y procesador Snapdragon 8 Elite.',
    imageUrl: 'https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 2,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90103',
    mediaId: '90103',
    productId: '1234567890123',
    productTitle: 'Samsung Galaxy S25 Ultra 512GB',
    vendor: 'Samsung',
    productType: 'Celulares',
    description: 'Smartphone Samsung Galaxy S25 Ultra con cámara de 200MP y procesador Snapdragon 8 Elite.',
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 3,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90201',
    mediaId: '90201',
    productId: '9876543210987',
    productTitle: 'Apple iPhone 16 Pro Max 256GB Titanio Natural',
    vendor: 'Apple',
    productType: 'Celulares',
    description: 'Apple iPhone 16 Pro Max con chip A18 Pro, botón de Control de Cámara y acabado en titanio natural.',
    imageUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 1,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90202',
    mediaId: '90202',
    productId: '9876543210987',
    productTitle: 'Apple iPhone 16 Pro Max 256GB Titanio Natural',
    vendor: 'Apple',
    productType: 'Celulares',
    description: 'Apple iPhone 16 Pro Max con chip A18 Pro, botón de Control de Cámara y acabado en titanio natural.',
    imageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80',
    currentAlt: 'iPhone 16 Pro Max pantalla frontal Super Retina XDR',
    position: 2,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90203',
    mediaId: '90203',
    productId: '9876543210987',
    productTitle: 'Apple iPhone 16 Pro Max 256GB Titanio Natural',
    vendor: 'Apple',
    productType: 'Celulares',
    description: 'Apple iPhone 16 Pro Max con chip A18 Pro, botón de Control de Cámara y acabado en titanio natural.',
    imageUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 3,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90301',
    mediaId: '90301',
    productId: '4567890123456',
    productTitle: 'Sony WH-1000XM5 Audífonos Inalámbricos Noise Cancelling',
    vendor: 'Sony',
    productType: 'Audio',
    description: 'Audífonos over-ear Sony WH-1000XM5 con cancelación de ruido activa inteligente y audio Hi-Res.',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 1,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90302',
    mediaId: '90302',
    productId: '4567890123456',
    productTitle: 'Sony WH-1000XM5 Audífonos Inalámbricos Noise Cancelling',
    vendor: 'Sony',
    productType: 'Audio',
    description: 'Audífonos over-ear Sony WH-1000XM5 con cancelación de ruido activa inteligente y audio Hi-Res.',
    imageUrl: 'https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 2,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90401',
    mediaId: '90401',
    productId: '7890123456789',
    productTitle: 'Xiaomi 14 Ultra 512GB Blanco Fotografía Leica',
    vendor: 'Xiaomi',
    productType: 'Celulares',
    description: 'Smartphone de alta gama Xiaomi 14 Ultra con sensor de una pulgada y óptica cuádruple Leica.',
    imageUrl: 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 1,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90402',
    mediaId: '90402',
    productId: '7890123456789',
    productTitle: 'Xiaomi 14 Ultra 512GB Blanco Fotografía Leica',
    vendor: 'Xiaomi',
    productType: 'Celulares',
    description: 'Smartphone de alta gama Xiaomi 14 Ultra con sensor de una pulgada y óptica cuádruple Leica.',
    imageUrl: 'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 2,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90501',
    mediaId: '90501',
    productId: '3344556677889',
    productTitle: 'Nintendo Switch OLED Modelo Blanco',
    vendor: 'Nintendo',
    productType: 'Videojuegos',
    description: 'Consola híbrida Nintendo Switch OLED con pantalla de 7 pulgadas y base con puerto LAN.',
    imageUrl: 'https://images.unsplash.com/photo-1578303512597-81e6cc155b3e?auto=format&fit=crop&w=800&q=80',
    currentAlt: 'Nintendo Switch OLED en dock blanco con Joy-Cons',
    position: 1,
    status: 'pending',
  },
  {
    id: 'gid://shopify/MediaImage/90502',
    mediaId: '90502',
    productId: '3344556677889',
    productTitle: 'Nintendo Switch OLED Modelo Blanco',
    vendor: 'Nintendo',
    productType: 'Videojuegos',
    description: 'Consola híbrida Nintendo Switch OLED con pantalla de 7 pulgadas y base con puerto LAN.',
    imageUrl: 'https://images.unsplash.com/photo-1612287233207-67440426d030?auto=format&fit=crop&w=800&q=80',
    currentAlt: '',
    position: 2,
    status: 'pending',
  },
];

/** Merged view (seed + this session's edits) - use for reads/scans. */
export function getDemoProductMedia(session: IronSession<AppSessionData>): AltTextMediaRecordLike[] {
  const overrides = session.demoMediaOverrides || {};
  return DEMO_PRODUCT_MEDIA_SEED.map((m) => ({ ...m, ...(overrides[m.id] || {}) }));
}

/** Persist an edit to one demo media item as a small override. */
export function setDemoMediaOverride(
  session: IronSession<AppSessionData>,
  id: string,
  patch: Partial<AltTextMediaRecordLike>
) {
  if (!session.demoMediaOverrides) session.demoMediaOverrides = {};
  session.demoMediaOverrides[id] = { ...session.demoMediaOverrides[id], ...patch };
}

// ==========================================
// DEMO CATALOG AUDIT (fixed seed + small per-session overrides, same
// merge-at-read pattern as DEMO_PRODUCTS_SEED above — edits come from the
// Audit module's "Actualización masiva" CSV/Excel upload)
// ==========================================

export interface CatalogAuditProductLike {
  id: string;
  numericId: string;
  title: string;
  handle: string;
  vendor: string;
  description: string;
  minPrice: number;
  maxPrice: number;
}

export const DEMO_CATALOG_AUDIT_SEED: CatalogAuditProductLike[] = [
  {
    id: 'gid://shopify/Product/1234567890123',
    numericId: '1234567890123',
    title: 'Samsung Galaxy S25 Ultra 512GB',
    handle: 'samsung-galaxy-s25-ultra-512gb',
    vendor: 'Samsung',
    description: 'Smartphone Samsung Galaxy S25 Ultra con cámara de 200MP y procesador Snapdragon 8 Elite.',
    minPrice: 32999,
    maxPrice: 32999,
  },
  {
    id: 'gid://shopify/Product/9876543210987',
    numericId: '9876543210987',
    title: 'Apple iPhone 16 Pro Max 256GB Titanio Natural',
    handle: 'apple-iphone-16-pro-max-256gb-titanio-natural',
    vendor: 'Apple',
    description: 'Apple iPhone 16 Pro Max con chip A18 Pro, botón de Control de Cámara y acabado en titanio natural.',
    minPrice: 34999,
    maxPrice: 34999,
  },
  {
    id: 'gid://shopify/Product/4567890123456',
    numericId: '4567890123456',
    title: 'Sony WH-1000XM5 Audífonos Inalámbricos Noise Cancelling',
    handle: 'sony-wh-1000xm5-audifonos-inalambricos',
    vendor: 'Sony',
    description: 'Audífonos over-ear Sony WH-1000XM5 con cancelación de ruido activa inteligente y audio Hi-Res.',
    minPrice: 8499,
    maxPrice: 8499,
  },
  {
    id: 'gid://shopify/Product/7890123456789',
    numericId: '7890123456789',
    title: 'Xiaomi 14 Ultra 512GB Blanco Fotografía Leica',
    handle: 'xiaomi-14-ultra-512gb-blanco-leica',
    vendor: 'Xiaomi',
    description: 'Smartphone de alta gama Xiaomi 14 Ultra con sensor de una pulgada y óptica cuádruple Leica.',
    minPrice: 27999,
    maxPrice: 27999,
  },
  {
    id: 'gid://shopify/Product/3344556677889',
    numericId: '3344556677889',
    title: 'Nintendo Switch OLED Modelo Blanco',
    handle: 'nintendo-switch-oled-blanco',
    vendor: 'Nintendo',
    description: 'Consola híbrida Nintendo Switch OLED con pantalla de 7 pulgadas y base con puerto LAN.',
    minPrice: 7999,
    maxPrice: 7999,
  },
  // Deliberate audit issues below, so the demo catalog is actually useful to try.
  {
    id: 'gid://shopify/Product/1112223334445',
    numericId: '1112223334445',
    title: 'Cargador USB-C 20W Genérico',
    handle: 'cargador-usb-c-20w-generico',
    vendor: 'BASE',
    description: 'Cargador rápido USB-C de 20W compatible con múltiples dispositivos.',
    minPrice: 299,
    maxPrice: 299,
  },
  {
    id: 'gid://shopify/Product/2223334445556',
    numericId: '2223334445556',
    title: 'Funda Silicón Transparente Universal',
    handle: 'funda-silicon-transparente-universal',
    vendor: '',
    description: 'Funda protectora de silicón transparente resistente a caídas.',
    minPrice: 149,
    maxPrice: 199,
  },
  {
    id: 'gid://shopify/Product/3334445556667',
    numericId: '3334445556667',
    title: 'Mica de Cristal Templado 9H',
    handle: 'mica-cristal-templado-9h',
    vendor: 'Doto Accesorios',
    description: '',
    minPrice: 99,
    maxPrice: 99,
  },
  {
    id: 'gid://shopify/Product/4445556667778',
    numericId: '4445556667778',
    title: 'Producto Recién Cargado Sin Precio Asignado',
    handle: 'producto-recien-cargado-sin-precio',
    vendor: 'Doto Accesorios',
    description:
      'Producto recién dado de alta por el equipo de compras, pendiente de fijar el precio final antes de publicarse.',
    minPrice: 0,
    maxPrice: 0,
  },
  {
    id: 'gid://shopify/Product/5556667778889',
    numericId: '5556667778889',
    title: 'Cable HDMI 2.1 8K Precio Referencia',
    handle: 'cable-hdmi-2-1-8k-precio-referencia',
    vendor: 'Doto Accesorios',
    description:
      'Cable HDMI 2.1 de alta velocidad, cargado con precio de referencia mientras se confirma el costo real con el proveedor.',
    minPrice: 999999,
    maxPrice: 999999,
  },
  {
    id: 'gid://shopify/Product/6667778889990',
    numericId: '6667778889990',
    title: 'Bocina Bluetooth Portátil Precio Referencia',
    handle: 'bocina-bluetooth-portatil-precio-referencia',
    vendor: 'Doto Accesorios',
    description:
      'Bocina Bluetooth portátil resistente al agua, cargada con precio de referencia mientras se confirma el costo real con el proveedor.',
    minPrice: 9999999,
    maxPrice: 9999999,
  },
];

/** Merged view (seed + this session's edits) - use for reads/scans/preview. */
export function getDemoCatalogAudit(session: IronSession<AppSessionData>): CatalogAuditProductLike[] {
  const overrides = session.demoCatalogAuditOverrides || {};
  return DEMO_CATALOG_AUDIT_SEED.map((p) => ({ ...p, ...(overrides[p.numericId] || {}) }));
}

/** Persist an edit to one demo catalog product as a small override (not a full-catalog copy). */
export function setDemoCatalogAuditOverride(
  session: IronSession<AppSessionData>,
  id: string,
  patch: Partial<CatalogAuditProductLike>
) {
  if (!session.demoCatalogAuditOverrides) session.demoCatalogAuditOverrides = {};
  session.demoCatalogAuditOverrides[id] = { ...session.demoCatalogAuditOverrides[id], ...patch };
}

export function recalculateAltTextStats(list: AltTextMediaRecordLike[]) {
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
