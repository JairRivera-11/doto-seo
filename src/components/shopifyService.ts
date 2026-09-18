/**
 * Shopify Admin GraphQL Client for Doto SEO
 * API Version: 2025-01 (Current Stable)
 * 
 * Strict Security Rules:
 * - Credentials are kept ONLY in memory during the active session.
 * - No tokens logged or included in error messages.
 * - Only read_products and write_products scopes are used.
 * - Modifies ONLY handle, seo.title, and seo.description.
 */

export interface ShopifyCredentials {
  shopDomain: string; // e.g. "my-store.myshopify.com"
  accessToken: string; // e.g. "shpat_..."
}

export interface ShopifyProductSEO {
  id: string;
  numericId: string;
  title: string;
  handle: string;
  seoTitle: string;
  seoDescription: string;
}

export interface SEOUpdatePayload {
  numericId: string;
  handle?: string;
  seoTitle?: string;
  seoDescription?: string;
}

export interface BulkPreviewRow {
  rowNumber: number;
  productId: string;
  currentTitle?: string;
  currentHandle?: string;
  newHandle?: string;
  currentSeoTitle?: string;
  newSeoTitle?: string;
  currentSeoDescription?: string;
  newSeoDescription?: string;
  status: 'valid' | 'warning' | 'error' | 'no_change';
  messages: string[];
  fieldsToUpdate: string[];
}

export interface BulkExecutionResult {
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
}

const SHOPIFY_API_VERSION = '2025-01';

/**
 * Normalize store domain to ensure it has .myshopify.com and no protocols
 */
export function normalizeShopDomain(input: string): string {
  let cleaned = input.trim().toLowerCase();
  cleaned = cleaned.replace(/^https?:\/\//, '');
  cleaned = cleaned.replace(/\/.*$/, '');
  if (!cleaned.includes('.')) {
    cleaned = `${cleaned}.myshopify.com`;
  }
  return cleaned;
}

/**
 * Format numeric ID into Shopify Global ID (GID)
 */
export function formatProductGid(id: string | number): string {
  const strId = String(id).trim();
  if (strId.startsWith('gid://shopify/Product/')) {
    return strId;
  }
  const numericOnly = strId.replace(/\D/g, '');
  return `gid://shopify/Product/${numericOnly}`;
}

/**
 * Extract numeric ID from Shopify GID or raw string
 */
export function extractNumericId(idOrGid: string): string {
  const match = idOrGid.match(/gid:\/\/shopify\/Product\/(\d+)/);
  if (match) return match[1];
  return idOrGid.replace(/\D/g, '');
}

/**
 * Validate handle slug format according to Shopify rules
 */
export function validateHandleFormat(handle: string): { isValid: boolean; error?: string } {
  if (!handle || typeof handle !== 'string') {
    return { isValid: false, error: 'El Handle no puede estar vacío.' };
  }
  const trimmed = handle.trim();
  if (trimmed.length < 1) {
    return { isValid: false, error: 'El Handle no puede estar vacío.' };
  }
  // Shopify handles allow lowercase letters, numbers, and hyphens. Cannot start or end with hyphen.
  const handleRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!handleRegex.test(trimmed)) {
    return {
      isValid: false,
      error: 'Formato de handle inválido. Solo debe contener letras minúsculas, números y guiones sencillos (sin espacios ni caracteres especiales).',
    };
  }
  if (trimmed.length > 255) {
    return { isValid: false, error: 'El handle excede los 255 caracteres permitidos por Shopify.' };
  }
  return { isValid: true };
}

/**
 * Generic GraphQL requester with rate-limit retry support
 */
async function executeGraphQL<T>(
  credentials: ShopifyCredentials,
  query: string,
  variables: Record<string, any> = {},
  retries = 3
): Promise<T> {
  const shop = normalizeShopDomain(credentials.shopDomain);
  const endpoint = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': credentials.accessToken,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      // Handle 429 Too Many Requests (Rate limit hit)
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseFloat(retryAfter) * 1000 : Math.pow(2, attempt) * 600;
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error('Credenciales inválidas o sin permisos suficientes (se requieren read_products y write_products).');
      }

      if (!response.ok) {
        throw new Error(`Shopify API respondió con código de estado HTTP ${response.status}.`);
      }

      const json = await response.json();

      if (json.errors && json.errors.length > 0) {
        const firstError = json.errors[0]?.message || 'Error en la respuesta de Shopify.';
        // Sanitize any accidental token echo
        const sanitized = firstError.replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
        throw new Error(sanitized);
      }

      return json.data as T;
    } catch (err: any) {
      if (attempt >= retries) {
        // Sanitize error message to ensure no credentials leak
        const msg = (err.message || 'Error de conexión con Shopify')
          .replace(credentials.accessToken, '[REDACTED]')
          .replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
        throw new Error(msg);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 400));
    }
  }

  throw new Error('Excedido el número máximo de reintentos con Shopify API.');
}

/**
 * Test Shopify connection & scopes
 */
export async function testShopifyConnection(credentials: ShopifyCredentials): Promise<{
  name: string;
  myshopifyDomain: string;
  url?: string;
}> {
  const query = `
    query testConnection {
      shop {
        name
        myshopifyDomain
        primaryDomain {
          url
        }
      }
    }
  `;

  try {
    const data = await executeGraphQL<{
      shop: {
        name: string;
        myshopifyDomain: string;
        primaryDomain?: { url: string };
      };
    }>(credentials, query);

    if (!data?.shop?.name) {
      throw new Error('Respuesta inválida de la tienda Shopify.');
    }

    return {
      name: data.shop.name,
      myshopifyDomain: data.shop.myshopifyDomain,
      url: data.shop.primaryDomain?.url,
    };
  } catch (error: any) {
    const safeMsg = (error.message || 'No fue posible conectar con Shopify.')
      .replace(credentials.accessToken, '[REDACTED]');
    throw new Error(safeMsg);
  }
}

/**
 * Get single product by numeric ID or GID
 */
export async function getProductById(
  credentials: ShopifyCredentials,
  id: string
): Promise<ShopifyProductSEO | null> {
  const gid = formatProductGid(id);
  const query = `
    query getProductSEO($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        seo {
          title
          description
        }
      }
    }
  `;

  const data = await executeGraphQL<{
    product: {
      id: string;
      title: string;
      handle: string;
      seo?: {
        title?: string;
        description?: string;
      };
    } | null;
  }>(credentials, query, { id: gid });

  if (!data?.product) {
    return null;
  }

  return {
    id: data.product.id,
    numericId: extractNumericId(data.product.id),
    title: data.product.title,
    handle: data.product.handle || '',
    seoTitle: data.product.seo?.title || '',
    seoDescription: data.product.seo?.description || '',
  };
}

/**
 * Batch fetch multiple products by IDs using Shopify GraphQL `nodes` query
 */
export async function getProductsByIds(
  credentials: ShopifyCredentials,
  ids: string[]
): Promise<Map<string, ShopifyProductSEO>> {
  const resultMap = new Map<string, ShopifyProductSEO>();
  if (!ids.length) return resultMap;

  // Process in chunks of 50 to respect GraphQL query complexity limits
  const CHUNK_SIZE = 50;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const slice = ids.slice(i, i + CHUNK_SIZE);
    const gids = slice.map(formatProductGid);

    const query = `
      query getMultipleProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            title
            handle
            seo {
              title
              description
            }
          }
        }
      }
    `;

    const data = await executeGraphQL<{
      nodes: Array<{
        id: string;
        title: string;
        handle: string;
        seo?: {
          title?: string;
          description?: string;
        };
      } | null>;
    }>(credentials, query, { ids: gids });

    if (data?.nodes) {
      data.nodes.forEach((node) => {
        if (node && node.id) {
          const numId = extractNumericId(node.id);
          resultMap.set(numId, {
            id: node.id,
            numericId: numId,
            title: node.title,
            handle: node.handle || '',
            seoTitle: node.seo?.title || '',
            seoDescription: node.seo?.description || '',
          });
        }
      });
    }

    // Small delay between batch chunks to be polite to Shopify rate limits
    if (i + CHUNK_SIZE < ids.length) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  return resultMap;
}

const SEO_AUDIT_PAGE_SIZE = 250;
const SEO_AUDIT_MAX_PAGES = 40; // safety cap (~10,000 products) to avoid runaway scans

/**
 * Fetch every product in the store (title/handle/seo) by paging through
 * Shopify's `products` connection until `pageInfo.hasNextPage` is false.
 * Used by the SEO Audit — unlike `getProductsMedia`'s "all" branch, this
 * genuinely walks the full catalog rather than stopping at the first page.
 */
export async function getAllProductsSEO(
  credentials: ShopifyCredentials
): Promise<ShopifyProductSEO[]> {
  const products: ShopifyProductSEO[] = [];
  let cursor: string | null = null;
  let page = 0;

  const query = `
    query getAllProductsSEO($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            handle
            seo {
              title
              description
            }
          }
        }
      }
    }
  `;

  while (page < SEO_AUDIT_MAX_PAGES) {
    page++;
    const data = await executeGraphQL<{
      products: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        edges: Array<{
          node: {
            id: string;
            title: string;
            handle: string;
            seo?: { title?: string; description?: string };
          };
        }>;
      };
    }>(credentials, query, { first: SEO_AUDIT_PAGE_SIZE, after: cursor });

    const edges = data?.products?.edges || [];
    edges.forEach(({ node }) => {
      products.push({
        id: node.id,
        numericId: extractNumericId(node.id),
        title: node.title,
        handle: node.handle || '',
        seoTitle: node.seo?.title || '',
        seoDescription: node.seo?.description || '',
      });
    });

    const pageInfo = data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;

    // Small delay between pages to be polite to Shopify rate limits
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return products;
}

export interface SEOAuditEvaluation {
  status: 'ok' | 'warning' | 'error';
  messages: string[];
}

const SEO_AUDIT_TITLE_MAX_LENGTH = 70;
const SEO_AUDIT_DESCRIPTION_MAX_LENGTH = 160;

/**
 * Evaluate a product's SEO fields using the same rules already enforced by
 * the bulk preview/execute flow (handle format, 70/160 char soft limits),
 * plus missing-field checks that only make sense for a live, file-less audit.
 */
export function evaluateProductSEO(product: ShopifyProductSEO): SEOAuditEvaluation {
  const messages: string[] = [];
  let status: 'ok' | 'warning' | 'error' = 'ok';

  const handleCheck = validateHandleFormat(product.handle);
  if (!handleCheck.isValid) {
    status = 'error';
    messages.push(`Handle inválido: ${handleCheck.error}`);
  }

  const seoTitle = (product.seoTitle || '').trim();
  if (!seoTitle) {
    if (status !== 'error') status = 'warning';
    messages.push('Sin SEO Title.');
  } else if (seoTitle.length > SEO_AUDIT_TITLE_MAX_LENGTH) {
    if (status !== 'error') status = 'warning';
    messages.push(`SEO Title tiene ${seoTitle.length} caracteres (se recomiendan máximo ${SEO_AUDIT_TITLE_MAX_LENGTH}).`);
  }

  const seoDescription = (product.seoDescription || '').trim();
  if (!seoDescription) {
    if (status !== 'error') status = 'warning';
    messages.push('Sin Meta Description.');
  } else if (seoDescription.length > SEO_AUDIT_DESCRIPTION_MAX_LENGTH) {
    if (status !== 'error') status = 'warning';
    messages.push(`Meta Description tiene ${seoDescription.length} caracteres (se recomiendan máximo ${SEO_AUDIT_DESCRIPTION_MAX_LENGTH}).`);
  }

  return { status, messages };
}

/**
 * Check if a handle is already taken by a different product in Shopify
 */
export async function checkHandleOccupied(
  credentials: ShopifyCredentials,
  handle: string,
  currentProductNumericId: string
): Promise<{ isOccupied: boolean; occupiedByTitle?: string; occupiedById?: string }> {
  const query = `
    query checkHandle($handle: String!) {
      productByHandle(handle: $handle) {
        id
        title
      }
    }
  `;

  try {
    const data = await executeGraphQL<{
      productByHandle: {
        id: string;
        title: string;
      } | null;
    }>(credentials, query, { handle });

    if (!data?.productByHandle) {
      return { isOccupied: false };
    }

    const occupiedNumId = extractNumericId(data.productByHandle.id);
    if (occupiedNumId === currentProductNumericId) {
      return { isOccupied: false }; // It belongs to the same product, so it's valid
    }

    return {
      isOccupied: true,
      occupiedByTitle: data.productByHandle.title,
      occupiedById: occupiedNumId,
    };
  } catch {
    return { isOccupied: false };
  }
}

/**
 * Update product SEO fields in Shopify using GraphQL productUpdate mutation
 * ONLY touches handle, seo.title, and seo.description if specified!
 */
export async function updateProductSEO(
  credentials: ShopifyCredentials,
  payload: SEOUpdatePayload
): Promise<{
  success: boolean;
  product?: ShopifyProductSEO;
  errorMessage?: string;
}> {
  const gid = formatProductGid(payload.numericId);

  const productInput: Record<string, any> = {
    id: gid,
  };

  if (payload.handle !== undefined && payload.handle !== null && payload.handle.trim() !== '') {
    productInput.handle = payload.handle.trim();
  }

  const seoInput: Record<string, string> = {};
  let hasSeoChanges = false;

  if (payload.seoTitle !== undefined && payload.seoTitle !== null) {
    seoInput.title = payload.seoTitle;
    hasSeoChanges = true;
  }

  if (payload.seoDescription !== undefined && payload.seoDescription !== null) {
    seoInput.description = payload.seoDescription;
    hasSeoChanges = true;
  }

  if (hasSeoChanges) {
    productInput.seo = seoInput;
  }

  // Safety check: Don't run mutation if no fields are being modified
  if (Object.keys(productInput).length <= 1) {
    return {
      success: true,
      errorMessage: 'Sin cambios para actualizar.',
    };
  }

  const mutation = `
    mutation updateProductSEO($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          handle
          seo {
            title
            description
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const data = await executeGraphQL<{
      productUpdate: {
        product: {
          id: string;
          title: string;
          handle: string;
          seo?: {
            title?: string;
            description?: string;
          };
        } | null;
        userErrors: Array<{
          field: string[];
          message: string;
        }>;
      };
    }>(credentials, mutation, { input: productInput });

    const userErrors = data?.productUpdate?.userErrors || [];
    if (userErrors.length > 0) {
      const errorMsg = userErrors.map((e) => e.message).join('. ');
      return {
        success: false,
        errorMessage: `Shopify rechazó la actualización: ${errorMsg}`,
      };
    }

    if (!data?.productUpdate?.product) {
      return {
        success: false,
        errorMessage: 'Shopify no retornó el producto actualizado.',
      };
    }

    const updated = data.productUpdate.product;
    return {
      success: true,
      product: {
        id: updated.id,
        numericId: extractNumericId(updated.id),
        title: updated.title,
        handle: updated.handle || '',
        seoTitle: updated.seo?.title || '',
        seoDescription: updated.seo?.description || '',
      },
    };
  } catch (error: any) {
    const safeError = (error.message || 'Error de conexión durante la actualización en Shopify.')
      .replace(credentials.accessToken, '[REDACTED]');
    return {
      success: false,
      errorMessage: safeError,
    };
  }
}

/**
 * Create a 301 redirect from an old product handle to the new one.
 *
 * Shopify only auto-generates redirects when a handle is changed from within
 * its own admin panel — NOT when changed via the API (confirmed by Shopify
 * staff: https://community.shopify.com/t/no-301-redirect-created-when-handle-updated-via-api/272598).
 * Since `updateProductSEO` above changes the handle via the API, every
 * handle change must explicitly create its own redirect here or the old
 * product URL starts 404ing. Requires the `write_online_store_navigation`
 * access scope in addition to read_products/write_products.
 */
export async function createUrlRedirect(
  credentials: ShopifyCredentials,
  oldHandle: string,
  newHandle: string
): Promise<{ success: boolean; skipped?: boolean; errorMessage?: string }> {
  const oldPath = `/products/${oldHandle.trim()}`;
  const newPath = `/products/${newHandle.trim()}`;

  if (!oldHandle.trim() || !newHandle.trim() || oldPath === newPath) {
    return { success: true, skipped: true };
  }

  const mutation = `
    mutation createProductHandleRedirect($input: UrlRedirectInput!) {
      urlRedirectCreate(urlRedirect: $input) {
        urlRedirect {
          id
          path
          target
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const data = await executeGraphQL<{
      urlRedirectCreate: {
        urlRedirect: { id: string; path: string; target: string } | null;
        userErrors: Array<{ field: string[]; message: string }>;
      };
    }>(credentials, mutation, { input: { path: oldPath, target: newPath } });

    const userErrors = data?.urlRedirectCreate?.userErrors || [];
    if (userErrors.length > 0) {
      const errorMsg = userErrors.map((e) => e.message).join('. ');
      return { success: false, errorMessage: `Shopify rechazó el redirect: ${errorMsg}` };
    }

    if (!data?.urlRedirectCreate?.urlRedirect) {
      return { success: false, errorMessage: 'Shopify no retornó el redirect creado.' };
    }

    return { success: true };
  } catch (error: any) {
    let safeError = (error.message || 'Error de conexión al crear el redirect.').replace(
      credentials.accessToken,
      '[REDACTED]'
    );
    if (/access denied|not authorized|scope/i.test(safeError)) {
      safeError =
        'La tienda no autorizó la creación del redirect. Agrega el scope "write_online_store_navigation" a tu Admin API access token e intenta de nuevo.';
    }
    return { success: false, errorMessage: safeError };
  }
}

export interface ShopifyMediaImageItem {
  id: string; // GID e.g. gid://shopify/MediaImage/12345678
  mediaId: string;
  productId: string; // numeric Product ID
  productTitle: string;
  productType?: string;
  vendor?: string;
  description?: string;
  imageUrl: string;
  currentAlt: string;
  position: number;
  width?: number;
  height?: number;
}

export function formatMediaGid(id: string | number): string {
  const strId = String(id).trim();
  if (strId.startsWith('gid://shopify/MediaImage/')) {
    return strId;
  }
  const numericOnly = strId.replace(/\D/g, '');
  return `gid://shopify/MediaImage/${numericOnly}`;
}

export function extractMediaNumericId(idOrGid: string): string {
  const match = idOrGid.match(/gid:\/\/shopify\/MediaImage\/(\d+)/);
  if (match) return match[1];
  return idOrGid.replace(/\D/g, '');
}

/**
 * Fetch products and their media images from Shopify Admin GraphQL API
 * Uses current Product and MediaImage GraphQL resources (API version 2025-01)
 */
export async function getProductsMedia(
  credentials: ShopifyCredentials,
  options: {
    limit?: number;
    productIds?: string[];
  } = {}
): Promise<{
  productsCount: number;
  mediaItems: ShopifyMediaImageItem[];
}> {
  const limit = options.limit || 50;
  const productIds = options.productIds && options.productIds.length > 0 ? options.productIds : null;

  const mediaItems: ShopifyMediaImageItem[] = [];
  let productsCount = 0;

  if (productIds) {
    // Query specific products by GIDs in chunks of 50
    const CHUNK_SIZE = 50;
    for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
      const slice = productIds.slice(i, i + CHUNK_SIZE);
      const gids = slice.map(formatProductGid);

      const query = `
        query getProductsMediaNodes($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              vendor
              productType
              description
              media(first: 30) {
                edges {
                  node {
                    id
                    mediaContentType
                    alt
                    ... on MediaImage {
                      id
                      alt
                      image {
                        url
                        altText
                        width
                        height
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const data = await executeGraphQL<{
        nodes: Array<{
          id: string;
          title: string;
          vendor?: string;
          productType?: string;
          description?: string;
          media?: {
            edges: Array<{
              node: {
                id: string;
                mediaContentType: string;
                alt?: string;
                image?: {
                  url: string;
                  altText?: string;
                  width?: number;
                  height?: number;
                };
              };
            }>;
          };
        } | null>;
      }>(credentials, query, { ids: gids });

      if (data?.nodes) {
        data.nodes.forEach((node) => {
          if (!node || !node.id) return;
          productsCount++;
          const numProdId = extractNumericId(node.id);
          const edges = node.media?.edges || [];

          edges.forEach((edge, index) => {
            const m = edge.node;
            if (m.mediaContentType === 'IMAGE' || m.image?.url) {
              const currentAlt = (m.alt || m.image?.altText || '').trim();
              mediaItems.push({
                id: m.id,
                mediaId: extractMediaNumericId(m.id) || m.id,
                productId: numProdId,
                productTitle: node.title,
                vendor: node.vendor,
                productType: node.productType,
                description: node.description,
                imageUrl: m.image?.url || '',
                currentAlt,
                position: index + 1,
                width: m.image?.width,
                height: m.image?.height,
              });
            }
          });
        });
      }

      if (i + CHUNK_SIZE < productIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  } else {
    // Query catalog products with media up to limit
    const query = `
      query getCatalogProductsWithMedia($first: Int!) {
        products(first: $first) {
          edges {
            node {
              id
              title
              vendor
              productType
              description
              media(first: 30) {
                edges {
                  node {
                    id
                    mediaContentType
                    alt
                    ... on MediaImage {
                      id
                      alt
                      image {
                        url
                        altText
                        width
                        height
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const data = await executeGraphQL<{
      products: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            vendor?: string;
            productType?: string;
            description?: string;
            media?: {
              edges: Array<{
                node: {
                  id: string;
                  mediaContentType: string;
                  alt?: string;
                  image?: {
                    url: string;
                    altText?: string;
                    width?: number;
                    height?: number;
                  };
                };
              }>;
            };
          };
        }>;
      };
    }>(credentials, query, { first: Math.min(limit, 100) });

    const edges = data?.products?.edges || [];
    productsCount = edges.length;

    edges.forEach((edge) => {
      const node = edge.node;
      const numProdId = extractNumericId(node.id);
      const mediaEdges = node.media?.edges || [];

      mediaEdges.forEach((mEdge, index) => {
        const m = mEdge.node;
        if (m.mediaContentType === 'IMAGE' || m.image?.url) {
          const currentAlt = (m.alt || m.image?.altText || '').trim();
          mediaItems.push({
            id: m.id,
            mediaId: extractMediaNumericId(m.id) || m.id,
            productId: numProdId,
            productTitle: node.title,
            vendor: node.vendor,
            productType: node.productType,
            description: node.description,
            imageUrl: m.image?.url || '',
            currentAlt,
            position: index + 1,
            width: m.image?.width,
            height: m.image?.height,
          });
        }
      });
    });
  }

  return {
    productsCount,
    mediaItems,
  };
}

/**
 * Update media Alt Text in Shopify using productUpdateMedia mutation
 * Strictly modifies ONLY the `alt` property of specified MediaImages.
 */
export async function updateMediaAltText(
  credentials: ShopifyCredentials,
  productId: string,
  mediaUpdates: Array<{ id: string; alt: string }>
): Promise<{
  success: boolean;
  updatedCount: number;
  errorMessage?: string;
}> {
  if (!mediaUpdates.length) {
    return { success: true, updatedCount: 0 };
  }

  const productGid = formatProductGid(productId);
  const mediaInput = mediaUpdates.map((m) => ({
    id: formatMediaGid(m.id),
    alt: m.alt,
  }));

  const mutation = `
    mutation updateProductMediaAlt($productId: ID!, $media: [UpdateMediaInput!]!) {
      productUpdateMedia(productId: $productId, media: $media) {
        media {
          id
          alt
          status
        }
        mediaUserErrors {
          field
          message
          code
        }
      }
    }
  `;

  try {
    const data = await executeGraphQL<{
      productUpdateMedia: {
        media: Array<{
          id: string;
          alt: string;
          status: string;
        }>;
        mediaUserErrors: Array<{
          field: string[];
          message: string;
          code: string;
        }>;
      };
    }>(credentials, mutation, {
      productId: productGid,
      media: mediaInput,
    });

    const userErrors = data?.productUpdateMedia?.mediaUserErrors || [];
    if (userErrors.length > 0) {
      const errorMsg = userErrors.map((e) => e.message).join('. ');
      return {
        success: false,
        updatedCount: 0,
        errorMessage: `Shopify rechazó la actualización de Alt Text: ${errorMsg}`,
      };
    }

    const updated = data?.productUpdateMedia?.media || [];
    return {
      success: true,
      updatedCount: updated.length,
    };
  } catch (error: any) {
    const safeError = (error.message || 'Error al actualizar Alt Text en Shopify.')
      .replace(credentials.accessToken, '[REDACTED]');
    return {
      success: false,
      updatedCount: 0,
      errorMessage: safeError,
    };
  }
}
