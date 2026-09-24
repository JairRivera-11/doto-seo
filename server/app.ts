import 'dotenv/config';
import express from 'express';
import {
  ShopifyCredentials,
  ShopifyProductSEO,
  testShopifyConnection,
  getProductById,
  getProductsByIds,
  getAllProductsSEO,
  evaluateProductSEO,
  getAllProductsCatalogAudit,
  evaluateCatalogAudit,
  CATALOG_AUDIT_PLACEHOLDER_PRICES,
  getCatalogAuditProductsByIds,
  updateProductCatalogFields,
  ShopifyCatalogAuditProduct,
  checkHandleOccupied,
  updateProductSEO,
  createUrlRedirect,
  validateHandleFormat,
  extractNumericId,
  normalizeShopDomain,
  getProductsMedia,
  updateMediaAltText,
  ShopifyMediaImageItem,
} from '../src/components/shopifyService.ts';
import {
  getVisionProvider,
  VisionProvider,
  VisionContext,
  AltTextGenerationResult,
} from './visionProviders.ts';
import {
  getSession,
  saveSession,
  addLog,
  freshStats,
  getDemoProducts,
  setDemoProductOverride,
  getDemoCatalogAudit,
  setDemoCatalogAuditOverride,
  setDemoCatalogAuditVariantPrice,
  CatalogAuditProductLike,
  getDemoProductMedia,
  setDemoMediaOverride,
  recalculateAltTextStats,
  AppSessionData,
  AltTextMediaRecordLike as AltTextMediaRecord,
} from './session.ts';
import type { IronSession } from 'iron-session';

function getAIProviderAvailability(session: IronSession<AppSessionData>) {
  // Same privacy model as the Shopify connection: no .env fallback - a key is
  // only "configured" if it was entered via the AI Settings module this
  // session, and it vanishes when the session cookie expires or is destroyed.
  const aiKeys = session.aiKeys || {};
  const geminiAvailable = !!aiKeys.gemini;
  const claudeAvailable = !!aiKeys.claude;
  const openaiAvailable = !!aiKeys.openai;
  const deepseekAvailable = !!aiKeys.deepseek;
  const fallbackProvider: 'local' | 'gemini' | 'claude' | 'openai' | 'deepseek' = claudeAvailable
    ? 'claude'
    : geminiAvailable
    ? 'gemini'
    : openaiAvailable
    ? 'openai'
    : deepseekAvailable
    ? 'deepseek'
    : 'local';
  const effectiveProvider = session.selectedAIProvider || fallbackProvider;
  return {
    geminiAvailable,
    claudeAvailable,
    openaiAvailable,
    deepseekAvailable,
    fallbackProvider,
    effectiveProvider,
  };
}

/**
 * Builds the Express app with every /api/shopify/* route registered, but
 * without starting a listener or wiring dev/static-file middleware - those
 * differ between the two ways this app runs (see the doc-comment in
 * server.ts and api/[...path].ts) and are layered on by each entry point.
 */
export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // ==========================================
  // SHOPIFY API ROUTES
  // ==========================================

  // Check current session status
  app.get('/api/shopify/status', async (req, res) => {
    const session = await getSession(req, res);
    if (!session.shop) {
      return res.json({ connected: false });
    }
    return res.json({
      connected: true,
      shop: {
        name: session.shop.shopName,
        domain: session.shop.shopDomain,
        url: session.shop.shopUrl,
        connectedAt: session.shop.connectedAt,
        isDemo: session.shop.isDemo,
      },
      stats: session.stats || freshStats(),
    });
  });

  // Connect to live Shopify store
  app.post('/api/shopify/connect', async (req, res) => {
    const session = await getSession(req, res);
    try {
      const { storeDomain, accessToken } = req.body;

      if (!storeDomain || !accessToken) {
        return res.status(400).json({
          success: false,
          error: 'Debe ingresar el dominio de la tienda y el Admin API Access Token.',
        });
      }

      const domain = normalizeShopDomain(storeDomain);
      const token = String(accessToken).trim();

      // Quick syntax checks
      if (!token.startsWith('shpat_') && !token.startsWith('shpca_') && token.length < 20) {
        return res.status(400).json({
          success: false,
          error: 'El token ingresado no parece ser un Admin API Access Token válido de Shopify (generalmente inicia con shpat_).',
        });
      }

      const credentials: ShopifyCredentials = {
        shopDomain: domain,
        accessToken: token,
      };

      // Test connection against Shopify Admin GraphQL API
      const shopInfo = await testShopifyConnection(credentials);

      // Store in the encrypted session cookie ONLY
      session.shop = {
        shopDomain: domain,
        accessToken: token,
        shopName: shopInfo.name,
        shopUrl: shopInfo.url || `https://${domain}`,
        connectedAt: new Date().toISOString(),
        isDemo: false,
      };
      session.stats = freshStats();

      addLog(session, 'Conexión', 'success', `Conectado exitosamente a la tienda: ${shopInfo.name} (${domain})`);
      await saveSession(session);

      return res.json({
        success: true,
        shop: {
          name: shopInfo.name,
          domain: session.shop.shopDomain,
          url: session.shop.shopUrl,
          connectedAt: session.shop.connectedAt,
          isDemo: false,
        },
      });
    } catch (error: any) {
      // Never leak tokens in error messages
      const sanitizedMessage = (error.message || 'No fue posible conectar con Shopify.')
        .replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');

      addLog(session, 'Conexión', 'error', `Fallo al conectar: ${sanitizedMessage}`);
      await saveSession(session);

      return res.status(400).json({
        success: false,
        error: sanitizedMessage,
      });
    }
  });

  // Connect in Demo Mode (for offline/instant testing with sample products)
  app.post('/api/shopify/demo-connect', async (req, res) => {
    const session = await getSession(req, res);
    session.shop = {
      shopDomain: 'doto-demo.myshopify.com',
      accessToken: 'demo-token-in-memory',
      shopName: 'Doto Electronics (Tienda de Prueba)',
      shopUrl: 'https://doto.com.mx',
      connectedAt: new Date().toISOString(),
      isDemo: true,
    };
    session.stats = freshStats();

    addLog(session, 'Conexión', 'info', 'Iniciada sesión en modo de prueba / demostración en memoria.');
    await saveSession(session);

    return res.json({
      success: true,
      shop: {
        name: session.shop.shopName,
        domain: session.shop.shopDomain,
        url: session.shop.shopUrl,
        connectedAt: session.shop.connectedAt,
        isDemo: true,
      },
    });
  });

  // Disconnect & completely clear the session cookie
  app.post('/api/shopify/disconnect', async (req, res) => {
    const session = await getSession(req, res);
    session.destroy();
    return res.json({ success: true, message: 'Sesión finalizada y credenciales eliminadas de memoria.' });
  });

  // Middleware to ensure session exists for product operations
  const requireSession = async (req: any, res: any, next: any) => {
    const session = await getSession(req, res);
    if (!session.shop) {
      return res.status(401).json({
        success: false,
        error: 'No hay una sesión activa de Shopify. Por favor conecte su tienda.',
      });
    }
    next();
  };

  // Get single product by ID
  app.get('/api/shopify/product/:id', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const rawId = req.params.id;
      const numId = extractNumericId(rawId);

      if (!numId) {
        return res.status(400).json({
          success: false,
          error: 'El Product ID proporcionado no contiene un formato numérico válido.',
        });
      }

      if (session.shop!.isDemo) {
        const product = getDemoProducts(session).get(numId);
        if (!product) {
          addLog(session, 'Búsqueda individual', 'warning', `Producto ${numId} no encontrado en catálogo demo.`, numId);
          await saveSession(session);
          return res.status(404).json({
            success: false,
            error: `No se encontró ningún producto con el Product ID: ${numId} en la tienda.`,
          });
        }
        session.stats!.found++;
        addLog(session, 'Búsqueda individual', 'success', `Producto localizado: ${product.title}`, numId);
        await saveSession(session);
        return res.json({ success: true, product });
      }

      const credentials: ShopifyCredentials = {
        shopDomain: session.shop!.shopDomain,
        accessToken: session.shop!.accessToken,
      };

      const product = await getProductById(credentials, numId);

      if (!product) {
        addLog(session, 'Búsqueda individual', 'warning', `Producto ${numId} no encontrado en Shopify.`, numId);
        await saveSession(session);
        return res.status(404).json({
          success: false,
          error: `No se encontró ningún producto con el Product ID: ${numId} en Shopify. Verifique que el ID corresponda a un producto publicado o existente.`,
        });
      }

      session.stats!.found++;
      addLog(session, 'Búsqueda individual', 'success', `Producto consultado: ${product.title}`, numId);
      await saveSession(session);
      return res.json({ success: true, product });
    } catch (error: any) {
      const sanitized = (error.message || 'Error al consultar producto en Shopify.')
        .replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      addLog(session, 'Búsqueda individual', 'error', sanitized);
      await saveSession(session);
      return res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Update single product SEO
  app.post('/api/shopify/update-product', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const { productId, handle, seoTitle, seoDescription, previousHandle } = req.body;
      const numId = extractNumericId(productId);

      if (!numId) {
        return res.status(400).json({
          success: false,
          error: 'Product ID requerido.',
        });
      }

      // Check if handle is being modified and validate format
      if (handle !== undefined && handle !== null && handle.trim() !== '') {
        const handleVal = validateHandleFormat(handle);
        if (!handleVal.isValid) {
          return res.status(400).json({
            success: false,
            error: handleVal.error,
          });
        }
      }

      if (session.shop!.isDemo) {
        const demoMap = getDemoProducts(session);
        const current = demoMap.get(numId);
        if (!current) {
          return res.status(404).json({ success: false, error: 'Producto no encontrado.' });
        }

        // Check if handle is occupied in demo store
        if (handle && handle.trim() !== '' && handle.trim() !== current.handle) {
          for (const [otherId, otherProd] of demoMap.entries()) {
            if (otherId !== numId && otherProd.handle.toLowerCase() === handle.trim().toLowerCase()) {
              return res.status(400).json({
                success: false,
                error: `El handle "${handle}" ya está en uso por otro producto: "${otherProd.title}".`,
              });
            }
          }
        }

        const updated: ShopifyProductSEO = {
          ...current,
          handle: handle !== undefined && handle.trim() !== '' ? handle.trim() : current.handle,
          seoTitle: seoTitle !== undefined ? seoTitle : current.seoTitle,
          seoDescription: seoDescription !== undefined ? seoDescription : current.seoDescription,
        };
        setDemoProductOverride(session, numId, updated);

        session.stats!.processed++;
        session.stats!.successful++;
        addLog(session, 'Actualización individual', 'success', `SEO actualizado exitosamente para: ${updated.title}`, numId);

        const handleChangedDemo = handle && handle.trim() !== '' && handle.trim() !== current.handle;
        if (handleChangedDemo) {
          addLog(
            session,
            'Redirect 301',
            'info',
            `Redirect simulado en modo demo: /products/${current.handle} → /products/${updated.handle}.`,
            numId
          );
        }

        await saveSession(session);
        return res.json({
          success: true,
          product: updated,
          redirectCreated: handleChangedDemo ? true : undefined,
        });
      }

      const credentials: ShopifyCredentials = {
        shopDomain: session.shop!.shopDomain,
        accessToken: session.shop!.accessToken,
      };

      // Check handle uniqueness if handle is being changed
      if (handle !== undefined && handle !== null && handle.trim() !== '') {
        const check = await checkHandleOccupied(credentials, handle.trim(), numId);
        if (check.isOccupied) {
          addLog(
            session,
            'Actualización individual',
            'error',
            `El handle "${handle}" ya pertenece a otro producto (${check.occupiedByTitle || check.occupiedById}).`,
            numId
          );
          await saveSession(session);
          return res.status(400).json({
            success: false,
            error: `El nuevo handle "${handle}" ya pertenece a otro producto en la tienda ("${check.occupiedByTitle || check.occupiedById}"). Shopify no permite handles duplicados.`,
          });
        }
      }

      const result = await updateProductSEO(credentials, {
        numericId: numId,
        handle,
        seoTitle,
        seoDescription,
      });

      if (!result.success) {
        session.stats!.processed++;
        session.stats!.errors++;
        addLog(session, 'Actualización individual', 'error', result.errorMessage || 'Rechazado por Shopify', numId);
        await saveSession(session);
        return res.status(400).json({
          success: false,
          error: result.errorMessage,
        });
      }

      session.stats!.processed++;
      session.stats!.successful++;
      addLog(
        session,
        'Actualización individual',
        'success',
        `SEO actualizado en Shopify para: ${result.product?.title || numId}`,
        numId
      );

      // Shopify does NOT auto-create a redirect when the handle changes via the
      // API (only when changed from its own admin panel), so we create one
      // explicitly here whenever the handle actually changed.
      let redirectCreated: boolean | undefined;
      let redirectWarning: string | undefined;
      const oldHandleForRedirect = (previousHandle || '').trim();
      const newHandleForRedirect = (result.product?.handle || '').trim();
      if (oldHandleForRedirect && newHandleForRedirect && oldHandleForRedirect !== newHandleForRedirect) {
        const redirectRes = await createUrlRedirect(credentials, oldHandleForRedirect, newHandleForRedirect);
        redirectCreated = redirectRes.success;
        if (redirectRes.success) {
          addLog(
            session,
            'Redirect 301',
            'success',
            `Redirect creado: /products/${oldHandleForRedirect} → /products/${newHandleForRedirect}.`,
            numId
          );
        } else {
          redirectWarning = redirectRes.errorMessage;
          addLog(
            session,
            'Redirect 301',
            'error',
            `No se pudo crear el redirect para /products/${oldHandleForRedirect}: ${redirectRes.errorMessage}`,
            numId
          );
        }
      }

      await saveSession(session);
      return res.json({
        success: true,
        product: result.product,
        redirectCreated,
        redirectWarning,
      });
    } catch (error: any) {
      const sanitized = (error.message || 'Error al actualizar producto en Shopify.')
        .replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      session.stats!.errors++;
      addLog(session, 'Actualización individual', 'error', sanitized);
      await saveSession(session);
      return res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Preview Bulk rows before any updates
  app.post('/api/shopify/preview-bulk', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const { rows } = req.body; // Array of { rowNumber, productId, handle, seoTitle, seoDescription }

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No se recibieron filas para validar.',
        });
      }

      // Collect numeric IDs and check for duplicates within the uploaded file
      const seenIds = new Set<string>();
      const duplicateIdsInFile = new Set<string>();
      const validIds: string[] = [];

      for (const row of rows) {
        const numId = extractNumericId(String(row.productId || ''));
        if (numId) {
          if (seenIds.has(numId)) {
            duplicateIdsInFile.add(numId);
          } else {
            seenIds.add(numId);
            validIds.push(numId);
          }
        }
      }

      // Fetch current products from Shopify or demo
      let shopifyProductsMap = new Map<string, ShopifyProductSEO>();

      if (session.shop!.isDemo) {
        const demoMap = getDemoProducts(session);
        validIds.forEach((id) => {
          const p = demoMap.get(id);
          if (p) shopifyProductsMap.set(id, p);
        });
      } else {
        const credentials: ShopifyCredentials = {
          shopDomain: session.shop!.shopDomain,
          accessToken: session.shop!.accessToken,
        };
        shopifyProductsMap = await getProductsByIds(credentials, validIds);
      }

      // Track handles in this batch to detect internal collisions in the file
      const seenHandlesInBatch = new Map<string, string>(); // handle -> productId

      const previewRows: any[] = [];
      let validCount = 0;
      let warningCount = 0;
      let errorCount = 0;
      let noChangeCount = 0;

      for (const row of rows) {
        const numId = extractNumericId(String(row.productId || ''));
        const messages: string[] = [];
        let status: 'valid' | 'warning' | 'error' | 'no_change' = 'valid';
        const fieldsToUpdate: string[] = [];

        // 1. Validate Product ID exists and is numeric
        if (!numId) {
          status = 'error';
          messages.push('Product ID ausente o no numérico.');
          errorCount++;
          previewRows.push({
            rowNumber: row.rowNumber,
            productId: row.productId || '(Vacío)',
            productTitle: '—',
            currentHandle: '—',
            newHandle: row.handle || '',
            currentSeoTitle: '—',
            newSeoTitle: row.seoTitle || '',
            currentSeoDescription: '—',
            newSeoDescription: row.seoDescription || '',
            status,
            messages,
            fieldsToUpdate: [],
          });
          continue;
        }

        // 2. Detect duplicates in file
        if (duplicateIdsInFile.has(numId)) {
          messages.push('Product ID duplicado dentro del mismo archivo.');
          status = 'warning';
        }

        // 3. Check if product exists in Shopify
        const existingProduct = shopifyProductsMap.get(numId);
        if (!existingProduct) {
          status = 'error';
          messages.push('El Product ID no existe en la tienda Shopify.');
          errorCount++;
          previewRows.push({
            rowNumber: row.rowNumber,
            productId: numId,
            productTitle: 'No encontrado en tienda',
            currentHandle: '—',
            newHandle: row.handle || '',
            currentSeoTitle: '—',
            newSeoTitle: row.seoTitle || '',
            currentSeoDescription: '—',
            newSeoDescription: row.seoDescription || '',
            status,
            messages,
            fieldsToUpdate: [],
          });
          continue;
        }

        // 4. Validate Handle
        const rawNewHandle = row.handle !== undefined && row.handle !== null ? String(row.handle).trim() : '';
        let handleChanged = false;
        if (rawNewHandle !== '') {
          const handleCheck = validateHandleFormat(rawNewHandle);
          if (!handleCheck.isValid) {
            status = 'error';
            messages.push(`Handle inválido: ${handleCheck.error}`);
          } else {
            // Check if changed
            if (rawNewHandle !== existingProduct.handle) {
              handleChanged = true;
              fieldsToUpdate.push('handle');

              // Check file internal collision
              if (seenHandlesInBatch.has(rawNewHandle) && seenHandlesInBatch.get(rawNewHandle) !== numId) {
                status = 'error';
                messages.push(`El handle "${rawNewHandle}" está duplicado en otra fila del mismo archivo.`);
              } else {
                seenHandlesInBatch.set(rawNewHandle, numId);
              }
            }
          }
        }

        // 5. Validate SEO Title
        const rawNewSeoTitle = row.seoTitle !== undefined && row.seoTitle !== null ? String(row.seoTitle).trim() : '';
        let seoTitleChanged = false;
        if (rawNewSeoTitle !== '') {
          if (rawNewSeoTitle.length > 70) {
            messages.push(`SEO Title tiene ${rawNewSeoTitle.length} caracteres (se recomiendan máximo 70).`);
            if (status !== 'error') status = 'warning';
          }
          if (rawNewSeoTitle !== existingProduct.seoTitle) {
            seoTitleChanged = true;
            fieldsToUpdate.push('seoTitle');
          }
        }

        // 6. Validate Meta Description
        const rawNewSeoDesc =
          row.seoDescription !== undefined && row.seoDescription !== null ? String(row.seoDescription).trim() : '';
        let seoDescChanged = false;
        if (rawNewSeoDesc !== '') {
          if (rawNewSeoDesc.length > 160) {
            messages.push(`Meta Description tiene ${rawNewSeoDesc.length} caracteres (se recomiendan máximo 160).`);
            if (status !== 'error') status = 'warning';
          }
          if (rawNewSeoDesc !== existingProduct.seoDescription) {
            seoDescChanged = true;
            fieldsToUpdate.push('seoDescription');
          }
        }

        // 7. Check "Modo Solo Cambios" (If no fields changed or all empty)
        if (status !== 'error') {
          if (!handleChanged && !seoTitleChanged && !seoDescChanged) {
            status = 'no_change';
            messages.push('Sin cambios respecto a los valores actuales en Shopify.');
            noChangeCount++;
          } else if (status === 'warning') {
            warningCount++;
          } else {
            status = 'valid';
            validCount++;
          }
        }

        previewRows.push({
          rowNumber: row.rowNumber,
          productId: numId,
          productTitle: existingProduct.title,
          currentHandle: existingProduct.handle,
          newHandle: rawNewHandle !== '' ? rawNewHandle : existingProduct.handle,
          currentSeoTitle: existingProduct.seoTitle,
          newSeoTitle: rawNewSeoTitle !== '' ? rawNewSeoTitle : existingProduct.seoTitle,
          currentSeoDescription: existingProduct.seoDescription,
          newSeoDescription: rawNewSeoDesc !== '' ? rawNewSeoDesc : existingProduct.seoDescription,
          status,
          messages,
          fieldsToUpdate,
        });
      }

      session.stats!.pendingChanges = validCount + warningCount;

      addLog(
        session,
        'Validación masiva',
        errorCount > 0 && validCount === 0 ? 'error' : warningCount > 0 ? 'warning' : 'info',
        `Archivo analizado: ${rows.length} registros (${validCount + warningCount} listos para actualizar, ${noChangeCount} sin cambios, ${warningCount} advertencias, ${errorCount} errores).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        summary: {
          totalRows: rows.length,
          valid: validCount,
          warnings: warningCount,
          errors: errorCount,
          noChange: noChangeCount,
          toUpdate: validCount + warningCount,
        },
        previewRows,
      });
    } catch (error: any) {
      const sanitized = (error.message || 'Error al generar vista previa masiva.')
        .replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      return res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Execute Bulk updates with concurrency pacing & throttling handling
  app.post('/api/shopify/execute-bulk', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const { items } = req.body; // Array of { productId, handle, seoTitle, seoDescription, fieldsToUpdate }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No se recibieron elementos para actualizar.',
        });
      }

      const results: any[] = [];
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      const credentials: ShopifyCredentials = {
        shopDomain: session.shop!.shopDomain,
        accessToken: session.shop!.accessToken,
      };

      const isDemo = session.shop!.isDemo;
      const demoMap = isDemo ? getDemoProducts(session) : null;

      // Process with controlled pacing (batch size of 3 concurrent requests, with delay between batches)
      const CONCURRENCY = isDemo ? 10 : 3;

      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const chunk = items.slice(i, i + CONCURRENCY);

        const chunkPromises = chunk.map(async (item: any) => {
          const numId = extractNumericId(String(item.productId));
          const timestamp = new Date().toISOString();

          // If no fields to update, skip cleanly
          if (!item.fieldsToUpdate || item.fieldsToUpdate.length === 0) {
            skippedCount++;
            addLog(
              session,
              'Actualización masiva',
              'info',
              `Producto [${numId}]: Omitido sin cambios respecto a Shopify.`,
              numId
            );
            return {
              productId: numId,
              productTitle: item.productTitle || '—',
              status: 'skipped',
              previousHandle: item.currentHandle || '',
              newHandle: item.currentHandle || '',
              previousSeoTitle: item.currentSeoTitle || '',
              newSeoTitle: item.currentSeoTitle || '',
              previousSeoDescription: item.currentSeoDescription || '',
              newSeoDescription: item.currentSeoDescription || '',
              updatedFields: [],
              errorMessage: 'Sin cambios',
              processedAt: timestamp,
            };
          }

          if (isDemo) {
            const current = demoMap!.get(numId);
            if (!current) {
              errorCount++;
              addLog(
                session,
                'Actualización masiva',
                'error',
                `Producto [${numId}]: No encontrado en el catálogo demo.`,
                numId
              );
              return {
                productId: numId,
                productTitle: item.productTitle || '—',
                status: 'error',
                previousHandle: item.currentHandle || '',
                newHandle: item.newHandle || '',
                previousSeoTitle: item.currentSeoTitle || '',
                newSeoTitle: item.newSeoTitle || '',
                previousSeoDescription: item.currentSeoDescription || '',
                newSeoDescription: item.newSeoDescription || '',
                updatedFields: [],
                errorMessage: 'Producto no encontrado en catálogo demo.',
                processedAt: timestamp,
              };
            }

            const updated: ShopifyProductSEO = {
              ...current,
              handle: item.fieldsToUpdate.includes('handle') ? item.newHandle : current.handle,
              seoTitle: item.fieldsToUpdate.includes('seoTitle') ? item.newSeoTitle : current.seoTitle,
              seoDescription: item.fieldsToUpdate.includes('seoDescription')
                ? item.newSeoDescription
                : current.seoDescription,
            };
            setDemoProductOverride(session, numId, updated);
            successCount++;

            addLog(
              session,
              'Actualización masiva',
              'success',
              `Producto [${numId}] "${current.title}": SEO actualizado (${item.fieldsToUpdate.join(', ')}).`,
              numId
            );

            const handleChangedDemo = item.fieldsToUpdate.includes('handle') && updated.handle !== current.handle;
            if (handleChangedDemo) {
              addLog(
                session,
                'Redirect 301',
                'info',
                `Redirect simulado en modo demo: /products/${current.handle} → /products/${updated.handle}.`,
                numId
              );
            }

            return {
              productId: numId,
              productTitle: current.title,
              status: 'success',
              previousHandle: current.handle,
              newHandle: updated.handle,
              previousSeoTitle: current.seoTitle,
              newSeoTitle: updated.seoTitle,
              previousSeoDescription: current.seoDescription,
              newSeoDescription: updated.seoDescription,
              updatedFields: item.fieldsToUpdate,
              processedAt: timestamp,
              redirectCreated: handleChangedDemo ? true : undefined,
            };
          }

          // Live Shopify Mode
          try {
            // Uniqueness check for handle if being changed
            if (item.fieldsToUpdate.includes('handle') && item.newHandle) {
              const handleCheck = await checkHandleOccupied(credentials, item.newHandle, numId);
              if (handleCheck.isOccupied) {
                errorCount++;
                const errDetail = `Handle "${item.newHandle}" en uso por: ${handleCheck.occupiedByTitle || handleCheck.occupiedById}`;
                addLog(session, 'Actualización masiva', 'error', `Producto [${numId}]: ${errDetail}`, numId);
                return {
                  productId: numId,
                  productTitle: item.productTitle || '—',
                  status: 'error',
                  previousHandle: item.currentHandle || '',
                  newHandle: item.newHandle,
                  previousSeoTitle: item.currentSeoTitle || '',
                  newSeoTitle: item.newSeoTitle || '',
                  previousSeoDescription: item.currentSeoDescription || '',
                  newSeoDescription: item.newSeoDescription || '',
                  updatedFields: [],
                  errorMessage: errDetail,
                  processedAt: timestamp,
                };
              }
            }

            // Build payload with ONLY modified fields
            const payload: any = { numericId: numId };
            if (item.fieldsToUpdate.includes('handle')) {
              payload.handle = item.newHandle;
            }
            if (item.fieldsToUpdate.includes('seoTitle')) {
              payload.seoTitle = item.newSeoTitle;
            }
            if (item.fieldsToUpdate.includes('seoDescription')) {
              payload.seoDescription = item.newSeoDescription;
            }

            const updateRes = await updateProductSEO(credentials, payload);

            if (!updateRes.success) {
              errorCount++;
              addLog(
                session,
                'Actualización masiva',
                'error',
                `Producto [${numId}]: Error en Shopify: ${updateRes.errorMessage}`,
                numId
              );
              return {
                productId: numId,
                productTitle: item.productTitle || '—',
                status: 'error',
                previousHandle: item.currentHandle || '',
                newHandle: item.newHandle || '',
                previousSeoTitle: item.currentSeoTitle || '',
                newSeoTitle: item.newSeoTitle || '',
                previousSeoDescription: item.currentSeoDescription || '',
                newSeoDescription: item.newSeoDescription || '',
                updatedFields: [],
                errorMessage: updateRes.errorMessage,
                processedAt: timestamp,
              };
            }

            successCount++;
            const prodTitle = updateRes.product?.title || item.productTitle || numId;
            addLog(
              session,
              'Actualización masiva',
              'success',
              `Producto [${numId}] "${prodTitle}": SEO actualizado en Shopify (${item.fieldsToUpdate.join(', ')}).`,
              numId
            );

            // Same as the single-edit path: the API doesn't auto-create a
            // redirect for handle changes, so create it explicitly here.
            let redirectCreated: boolean | undefined;
            let redirectWarning: string | undefined;
            const oldHandleForRedirect = (item.currentHandle || '').trim();
            const newHandleForRedirect = (updateRes.product?.handle || item.newHandle || '').trim();
            if (
              item.fieldsToUpdate.includes('handle') &&
              oldHandleForRedirect &&
              newHandleForRedirect &&
              oldHandleForRedirect !== newHandleForRedirect
            ) {
              const redirectRes = await createUrlRedirect(credentials, oldHandleForRedirect, newHandleForRedirect);
              redirectCreated = redirectRes.success;
              if (redirectRes.success) {
                addLog(
                  session,
                  'Redirect 301',
                  'success',
                  `Redirect creado: /products/${oldHandleForRedirect} → /products/${newHandleForRedirect}.`,
                  numId
                );
              } else {
                redirectWarning = redirectRes.errorMessage;
                addLog(
                  session,
                  'Redirect 301',
                  'error',
                  `No se pudo crear el redirect para /products/${oldHandleForRedirect}: ${redirectRes.errorMessage}`,
                  numId
                );
              }
            }

            return {
              productId: numId,
              productTitle: prodTitle,
              status: 'success',
              previousHandle: item.currentHandle || '',
              newHandle: updateRes.product?.handle || item.newHandle || '',
              previousSeoTitle: item.currentSeoTitle || '',
              newSeoTitle: updateRes.product?.seoTitle || item.newSeoTitle || '',
              previousSeoDescription: item.currentSeoDescription || '',
              newSeoDescription: updateRes.product?.seoDescription || item.newSeoDescription || '',
              updatedFields: item.fieldsToUpdate,
              processedAt: timestamp,
              redirectCreated,
              redirectWarning,
            };
          } catch (err: any) {
            errorCount++;
            const sanitized = (err.message || 'Error al actualizar').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
            addLog(
              session,
              'Actualización masiva',
              'error',
              `Producto [${numId}]: Excepción durante actualización: ${sanitized}`,
              numId
            );
            return {
              productId: numId,
              productTitle: item.productTitle || '—',
              status: 'error',
              previousHandle: item.currentHandle || '',
              newHandle: item.newHandle || '',
              previousSeoTitle: item.currentSeoTitle || '',
              newSeoTitle: item.newSeoTitle || '',
              previousSeoDescription: item.currentSeoDescription || '',
              newSeoDescription: item.newSeoDescription || '',
              updatedFields: [],
              errorMessage: sanitized,
              processedAt: timestamp,
            };
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);

        // Pause between chunks to prevent burst rate limits on Shopify
        if (!isDemo && i + CONCURRENCY < items.length) {
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }

      session.stats!.processed += items.length;
      session.stats!.successful += successCount;
      session.stats!.errors += errorCount;
      session.stats!.pendingChanges = Math.max(0, session.stats!.pendingChanges - items.length);

      addLog(
        session,
        'Lote masivo completado',
        errorCount === 0 ? 'success' : 'warning',
        `Lote masivo finalizado: ${items.length} productos procesados (${successCount} exitosos, ${errorCount} con error, ${skippedCount} omitidos).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        summary: {
          total: items.length,
          success: successCount,
          errors: errorCount,
          skipped: skippedCount,
        },
        results,
      });
    } catch (error: any) {
      const sanitized = (error.message || 'Error en ejecución masiva.').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      return res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Live, rule-based SEO audit across the full product catalog (no AI)
  app.post('/api/shopify/seo-audit/scan', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      let products: ShopifyProductSEO[];

      if (session.shop!.isDemo) {
        products = Array.from(getDemoProducts(session).values());
      } else {
        const credentials: ShopifyCredentials = {
          shopDomain: session.shop!.shopDomain,
          accessToken: session.shop!.accessToken,
        };
        products = await getAllProductsSEO(credentials);
      }

      let okCount = 0;
      let warningCount = 0;
      let errorCount = 0;

      const auditRows = products.map((product) => {
        const { status, messages } = evaluateProductSEO(product);
        if (status === 'ok') okCount++;
        else if (status === 'warning') warningCount++;
        else errorCount++;
        return { ...product, status, messages };
      });

      addLog(
        session,
        'Auditoría SEO',
        errorCount > 0 ? 'warning' : 'success',
        `Auditoría completada: ${products.length} productos revisados (${okCount} sin problemas, ${warningCount} con advertencias, ${errorCount} con errores).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        summary: {
          total: products.length,
          ok: okCount,
          warnings: warningCount,
          errors: errorCount,
        },
        products: auditRows,
      });
    } catch (error: any) {
      const sanitized = (error.message || 'Error al auditar productos en Shopify.').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      addLog(session, 'Auditoría SEO', 'error', `Falló la auditoría: ${sanitized}`);
      await saveSession(session);
      return res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Live, read-only catalog audit — flags brand (vendor) left as "BASE" or
  // blank, price stuck at $0 or one of the placeholder values ($999,999 /
  // $9,999,999), and missing
  // product description. Unlike the SEO audit, this never writes back to
  // Shopify: those fields are out of scope for this app (see README §1), so
  // the module is detection-only.
  app.post('/api/shopify/catalog-audit/scan', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      let products: ShopifyCatalogAuditProduct[];

      if (session.shop!.isDemo) {
        products = getDemoCatalogAudit(session);
      } else {
        const credentials: ShopifyCredentials = {
          shopDomain: session.shop!.shopDomain,
          accessToken: session.shop!.accessToken,
        };
        products = await getAllProductsCatalogAudit(credentials);
      }

      let okCount = 0;
      let vendorIssues = 0;
      let priceIssues = 0;
      let descriptionIssues = 0;

      const auditRows = products.map((product) => {
        const { issues, messages, flaggedVariants } = evaluateCatalogAudit(product);
        if (issues.length === 0) okCount++;
        if (issues.includes('vendor')) vendorIssues++;
        if (issues.includes('price_zero') || issues.includes('price_placeholder')) priceIssues++;
        if (issues.includes('description')) descriptionIssues++;
        return {
          id: product.id,
          numericId: product.numericId,
          title: product.title,
          handle: product.handle,
          vendor: product.vendor,
          description: product.description,
          variants: product.variants.map((v) => ({ sku: v.sku, variantTitle: v.title, price: v.price })),
          flaggedVariants: flaggedVariants.map((v) => ({
            variantId: v.variantId,
            sku: v.sku,
            variantTitle: v.variantTitle,
            price: v.price,
            issue: v.issue,
          })),
          issues,
          messages,
        };
      });

      const withIssues = products.length - okCount;

      addLog(
        session,
        'Auditoría de catálogo',
        withIssues > 0 ? 'warning' : 'success',
        `Auditoría de catálogo completada: ${products.length} productos revisados (${withIssues} con problemas: ${vendorIssues} de marca, ${priceIssues} de precio, ${descriptionIssues} sin descripción).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        summary: {
          total: products.length,
          ok: okCount,
          withIssues,
          vendorIssues,
          priceIssues,
          descriptionIssues,
        },
        products: auditRows,
      });
    } catch (error: any) {
      const sanitized = (error.message || 'Error al auditar el catálogo en Shopify.').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      addLog(session, 'Auditoría de catálogo', 'error', `Falló la auditoría de catálogo: ${sanitized}`);
      await saveSession(session);
      return res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Preview Catalog Audit bulk rows before any updates (vendor/price/description).
  // Price targets one specific SKU/variant, never the whole product.
  app.post('/api/shopify/catalog-audit/preview-bulk', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const { rows } = req.body; // Array of { rowNumber, productId, sku, vendor, price, description }

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No se recibieron filas para validar.',
        });
      }

      const seenIds = new Set<string>();
      const duplicateIdsInFile = new Set<string>();
      const validIds: string[] = [];

      for (const row of rows) {
        const numId = extractNumericId(String(row.productId || ''));
        if (numId) {
          if (seenIds.has(numId)) {
            duplicateIdsInFile.add(numId);
          } else {
            seenIds.add(numId);
            validIds.push(numId);
          }
        }
      }

      let shopifyProductsMap = new Map<string, ShopifyCatalogAuditProduct>();

      if (session.shop!.isDemo) {
        const demoMap = new Map(getDemoCatalogAudit(session).map((p) => [p.numericId, p]));
        validIds.forEach((id) => {
          const p = demoMap.get(id);
          if (p) shopifyProductsMap.set(id, p);
        });
      } else {
        const credentials: ShopifyCredentials = {
          shopDomain: session.shop!.shopDomain,
          accessToken: session.shop!.accessToken,
        };
        shopifyProductsMap = await getCatalogAuditProductsByIds(credentials, validIds);
      }

      const previewRows: any[] = [];
      let validCount = 0;
      let warningCount = 0;
      let errorCount = 0;
      let noChangeCount = 0;

      for (const row of rows) {
        const numId = extractNumericId(String(row.productId || ''));
        const messages: string[] = [];
        let status: 'valid' | 'warning' | 'error' | 'no_change' = 'valid';
        const fieldsToUpdate: string[] = [];

        if (!numId) {
          status = 'error';
          messages.push('Product ID ausente o no numérico.');
          errorCount++;
          previewRows.push({
            rowNumber: row.rowNumber,
            productId: row.productId || '(Vacío)',
            productTitle: '—',
            currentVendor: '—',
            newVendor: row.vendor || '',
            sku: row.sku || '',
            variantId: null,
            currentPrice: null,
            newPrice: null,
            currentDescription: '—',
            newDescription: row.description || '',
            status,
            messages,
            fieldsToUpdate: [],
          });
          continue;
        }

        if (duplicateIdsInFile.has(numId)) {
          messages.push('Product ID duplicado dentro del mismo archivo.');
          status = 'warning';
        }

        const existingProduct = shopifyProductsMap.get(numId);
        if (!existingProduct) {
          status = 'error';
          messages.push('El Product ID no existe en la tienda Shopify.');
          errorCount++;
          previewRows.push({
            rowNumber: row.rowNumber,
            productId: numId,
            productTitle: 'No encontrado en tienda',
            currentVendor: '—',
            newVendor: row.vendor || '',
            sku: row.sku || '',
            variantId: null,
            currentPrice: null,
            newPrice: null,
            currentDescription: '—',
            newDescription: row.description || '',
            status,
            messages,
            fieldsToUpdate: [],
          });
          continue;
        }

        // Vendor (marca)
        const rawNewVendor = row.vendor !== undefined && row.vendor !== null ? String(row.vendor).trim() : '';
        let vendorChanged = false;
        if (rawNewVendor !== '') {
          if (rawNewVendor !== existingProduct.vendor) {
            vendorChanged = true;
            fieldsToUpdate.push('vendor');
          }
          if (rawNewVendor.toUpperCase() === 'BASE') {
            messages.push('La marca sigue configurada como "BASE": no resuelve el problema detectado.');
            status = 'warning';
          }
        }

        // Price - scoped to ONE specific SKU/variant, never the whole product
        const rawSku = row.sku !== undefined && row.sku !== null ? String(row.sku).trim() : '';
        const rawPriceStr = row.price !== undefined && row.price !== null ? String(row.price).trim() : '';
        let priceChanged = false;
        let parsedPrice: number | null = null;
        let targetVariant: (typeof existingProduct.variants)[number] | undefined;

        if (rawPriceStr !== '') {
          if (rawSku !== '') {
            targetVariant = existingProduct.variants.find((v) => v.sku.toLowerCase() === rawSku.toLowerCase());
            if (!targetVariant) {
              status = 'error';
              messages.push(`SKU "${rawSku}" no encontrado en este producto.`);
            }
          } else if (existingProduct.variants.length === 1) {
            targetVariant = existingProduct.variants[0];
          } else {
            status = 'error';
            messages.push(
              `El producto tiene ${existingProduct.variants.length} variantes: especifica el SKU de la variante a corregir en la columna "SKU".`
            );
          }

          if (targetVariant) {
            parsedPrice = parseFloat(rawPriceStr.replace(/[^0-9.\-]/g, ''));
            if (isNaN(parsedPrice) || parsedPrice < 0) {
              status = 'error';
              messages.push(`Precio inválido: "${row.price}".`);
              parsedPrice = null;
            } else {
              const skuLabel = targetVariant.sku || targetVariant.title || 'esta variante';
              if (parsedPrice === 0) {
                messages.push(`${skuLabel}: el nuevo precio sigue siendo $0, no resuelve el problema detectado.`);
                status = 'warning';
              } else if (CATALOG_AUDIT_PLACEHOLDER_PRICES.includes(parsedPrice)) {
                messages.push(
                  `${skuLabel}: el nuevo precio sigue siendo $${parsedPrice.toLocaleString('es-MX')}, no resuelve el problema detectado.`
                );
                status = 'warning';
              }
              if (parsedPrice !== targetVariant.price) {
                priceChanged = true;
                fieldsToUpdate.push('price');
              }
            }
          }
        }

        // Description
        const rawNewDesc =
          row.description !== undefined && row.description !== null ? String(row.description).trim() : '';
        let descChanged = false;
        if (rawNewDesc !== '') {
          if (rawNewDesc !== existingProduct.description) {
            descChanged = true;
            fieldsToUpdate.push('description');
          }
        }

        if (status !== 'error') {
          if (!vendorChanged && !priceChanged && !descChanged) {
            status = 'no_change';
            messages.push('Sin cambios respecto a los valores actuales en Shopify.');
            noChangeCount++;
          } else if (status === 'warning') {
            warningCount++;
          } else {
            status = 'valid';
            validCount++;
          }
        } else {
          errorCount++;
        }

        previewRows.push({
          rowNumber: row.rowNumber,
          productId: numId,
          productTitle: existingProduct.title,
          currentVendor: existingProduct.vendor,
          newVendor: rawNewVendor !== '' ? rawNewVendor : existingProduct.vendor,
          sku: targetVariant?.sku || rawSku,
          variantId: targetVariant?.id || null,
          currentPrice: targetVariant?.price ?? null,
          newPrice: parsedPrice !== null ? parsedPrice : targetVariant?.price ?? null,
          currentDescription: existingProduct.description,
          newDescription: rawNewDesc !== '' ? rawNewDesc : existingProduct.description,
          status,
          messages,
          fieldsToUpdate,
        });
      }

      addLog(
        session,
        'Validación masiva de catálogo',
        errorCount > 0 && validCount === 0 ? 'error' : warningCount > 0 ? 'warning' : 'info',
        `Archivo de catálogo analizado: ${rows.length} registros (${validCount + warningCount} listos para actualizar, ${noChangeCount} sin cambios, ${warningCount} advertencias, ${errorCount} errores).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        summary: {
          totalRows: rows.length,
          valid: validCount,
          warnings: warningCount,
          errors: errorCount,
          noChange: noChangeCount,
          toUpdate: validCount + warningCount,
        },
        previewRows,
      });
    } catch (error: any) {
      const sanitized = (error.message || 'Error al generar vista previa de auditoría de catálogo.').replace(
        /shpat_[a-zA-Z0-9]+/g,
        '[REDACTED]'
      );
      return res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Execute Catalog Audit bulk updates (vendor/price/description) with
  // concurrency pacing, mirroring the SEO execute-bulk route above.
  app.post('/api/shopify/catalog-audit/execute-bulk', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const { items } = req.body; // Array of preview rows + fieldsToUpdate

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No se recibieron elementos para actualizar.',
        });
      }

      const results: any[] = [];
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;

      const credentials: ShopifyCredentials = {
        shopDomain: session.shop!.shopDomain,
        accessToken: session.shop!.accessToken,
      };

      const isDemo = session.shop!.isDemo;
      const CONCURRENCY = isDemo ? 10 : 3;

      for (let i = 0; i < items.length; i += CONCURRENCY) {
        const chunk = items.slice(i, i + CONCURRENCY);

        const chunkPromises = chunk.map(async (item: any) => {
          const numId = extractNumericId(String(item.productId));
          const timestamp = new Date().toISOString();

          if (!item.fieldsToUpdate || item.fieldsToUpdate.length === 0) {
            skippedCount++;
            addLog(
              session,
              'Actualización masiva de catálogo',
              'info',
              `Producto [${numId}]: Omitido sin cambios respecto a Shopify.`,
              numId
            );
            return {
              productId: numId,
              productTitle: item.productTitle || '—',
              status: 'skipped',
              previousVendor: item.currentVendor || '',
              newVendor: item.currentVendor || '',
              sku: item.sku || '',
              previousPrice: item.currentPrice ?? null,
              newPrice: item.currentPrice ?? null,
              previousDescription: item.currentDescription || '',
              newDescription: item.currentDescription || '',
              updatedFields: [],
              errorMessage: 'Sin cambios',
              processedAt: timestamp,
            };
          }

          const wantsVendor = item.fieldsToUpdate.includes('vendor');
          const wantsPrice = item.fieldsToUpdate.includes('price');
          const wantsDescription = item.fieldsToUpdate.includes('description');

          if (isDemo) {
            const current = getDemoCatalogAudit(session).find((p) => p.numericId === numId);
            if (!current) {
              errorCount++;
              addLog(
                session,
                'Actualización masiva de catálogo',
                'error',
                `Producto [${numId}]: No encontrado en el catálogo demo.`,
                numId
              );
              return {
                productId: numId,
                productTitle: item.productTitle || '—',
                status: 'error',
                previousVendor: item.currentVendor || '',
                newVendor: item.newVendor || '',
                sku: item.sku || '',
                previousPrice: item.currentPrice ?? null,
                newPrice: item.newPrice ?? null,
                previousDescription: item.currentDescription || '',
                newDescription: item.newDescription || '',
                updatedFields: [],
                errorMessage: 'Producto no encontrado en catálogo demo.',
                processedAt: timestamp,
              };
            }

            const currentVariant = wantsPrice ? current.variants.find((v) => v.id === item.variantId) : undefined;
            if (wantsPrice && !currentVariant) {
              errorCount++;
              addLog(
                session,
                'Actualización masiva de catálogo',
                'error',
                `Producto [${numId}]: Variante (SKU ${item.sku || '—'}) no encontrada en el catálogo demo.`,
                numId
              );
              return {
                productId: numId,
                productTitle: current.title,
                status: 'error',
                previousVendor: current.vendor,
                newVendor: item.newVendor || current.vendor,
                sku: item.sku || '',
                previousPrice: item.currentPrice ?? null,
                newPrice: item.newPrice ?? null,
                previousDescription: current.description,
                newDescription: item.newDescription || current.description,
                updatedFields: [],
                errorMessage: 'Variante (SKU) no encontrada en catálogo demo.',
                processedAt: timestamp,
              };
            }

            if (wantsVendor || wantsDescription) {
              const patch: Partial<Pick<CatalogAuditProductLike, 'vendor' | 'description'>> = {};
              if (wantsVendor) patch.vendor = item.newVendor;
              if (wantsDescription) patch.description = item.newDescription;
              setDemoCatalogAuditOverride(session, numId, patch);
            }
            if (wantsPrice && currentVariant) {
              setDemoCatalogAuditVariantPrice(session, currentVariant.id, item.newPrice);
            }
            successCount++;

            addLog(
              session,
              'Actualización masiva de catálogo',
              'success',
              `Producto [${numId}] "${current.title}"${currentVariant ? ` (SKU ${currentVariant.sku})` : ''}: catálogo actualizado (${item.fieldsToUpdate.join(', ')}).`,
              numId
            );

            return {
              productId: numId,
              productTitle: current.title,
              status: 'success',
              previousVendor: current.vendor,
              newVendor: wantsVendor ? item.newVendor : current.vendor,
              sku: currentVariant?.sku || item.sku || '',
              previousPrice: currentVariant?.price ?? null,
              newPrice: wantsPrice ? item.newPrice : currentVariant?.price ?? null,
              previousDescription: current.description,
              newDescription: wantsDescription ? item.newDescription : current.description,
              updatedFields: item.fieldsToUpdate,
              processedAt: timestamp,
            };
          }

          // Live Shopify Mode
          try {
            if (wantsPrice && !item.variantId) {
              errorCount++;
              const errDetail = `No se pudo resolver la variante (SKU ${item.sku || '—'}) para actualizar el precio.`;
              addLog(session, 'Actualización masiva de catálogo', 'error', `Producto [${numId}]: ${errDetail}`, numId);
              return {
                productId: numId,
                productTitle: item.productTitle || '—',
                status: 'error',
                previousVendor: item.currentVendor || '',
                newVendor: item.newVendor || '',
                sku: item.sku || '',
                previousPrice: item.currentPrice ?? null,
                newPrice: item.newPrice ?? null,
                previousDescription: item.currentDescription || '',
                newDescription: item.newDescription || '',
                updatedFields: [],
                errorMessage: errDetail,
                processedAt: timestamp,
              };
            }

            const payload: any = { numericId: numId };
            if (wantsVendor) payload.vendor = item.newVendor;
            if (wantsDescription) payload.description = item.newDescription;
            if (wantsPrice) payload.variantPriceUpdate = { variantId: item.variantId, price: item.newPrice };

            const updateRes = await updateProductCatalogFields(credentials, payload);

            if (!updateRes.success) {
              errorCount++;
              addLog(
                session,
                'Actualización masiva de catálogo',
                'error',
                `Producto [${numId}]: Error en Shopify: ${updateRes.errorMessage}`,
                numId
              );
              return {
                productId: numId,
                productTitle: item.productTitle || '—',
                status: 'error',
                previousVendor: item.currentVendor || '',
                newVendor: item.newVendor || '',
                sku: item.sku || '',
                previousPrice: item.currentPrice ?? null,
                newPrice: item.newPrice ?? null,
                previousDescription: item.currentDescription || '',
                newDescription: item.newDescription || '',
                updatedFields: [],
                errorMessage: updateRes.errorMessage,
                processedAt: timestamp,
              };
            }

            successCount++;
            addLog(
              session,
              'Actualización masiva de catálogo',
              'success',
              `Producto [${numId}] "${item.productTitle || numId}"${item.sku ? ` (SKU ${item.sku})` : ''}: catálogo actualizado en Shopify (${item.fieldsToUpdate.join(', ')}).`,
              numId
            );

            return {
              productId: numId,
              productTitle: item.productTitle || numId,
              status: 'success',
              previousVendor: item.currentVendor || '',
              newVendor: updateRes.updatedVendor ?? item.newVendor ?? item.currentVendor,
              sku: item.sku || '',
              previousPrice: item.currentPrice ?? null,
              newPrice: updateRes.updatedPrice ?? item.newPrice ?? item.currentPrice,
              previousDescription: item.currentDescription || '',
              newDescription: updateRes.updatedDescription ?? item.newDescription ?? item.currentDescription,
              updatedFields: item.fieldsToUpdate,
              processedAt: timestamp,
            };
          } catch (err: any) {
            errorCount++;
            const sanitized = (err.message || 'Error al actualizar').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
            addLog(
              session,
              'Actualización masiva de catálogo',
              'error',
              `Producto [${numId}]: Excepción durante actualización: ${sanitized}`,
              numId
            );
            return {
              productId: numId,
              productTitle: item.productTitle || '—',
              status: 'error',
              previousVendor: item.currentVendor || '',
              newVendor: item.newVendor || '',
              sku: item.sku || '',
              previousPrice: item.currentPrice ?? null,
              newPrice: item.newPrice ?? null,
              previousDescription: item.currentDescription || '',
              newDescription: item.newDescription || '',
              updatedFields: [],
              errorMessage: sanitized,
              processedAt: timestamp,
            };
          }
        });

        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);

        if (!isDemo && i + CONCURRENCY < items.length) {
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }

      session.stats!.processed += items.length;
      session.stats!.successful += successCount;
      session.stats!.errors += errorCount;

      addLog(
        session,
        'Lote masivo de catálogo completado',
        errorCount === 0 ? 'success' : 'warning',
        `Lote de catálogo finalizado: ${items.length} productos procesados (${successCount} exitosos, ${errorCount} con error, ${skippedCount} omitidos).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        summary: {
          total: items.length,
          success: successCount,
          errors: errorCount,
          skipped: skippedCount,
        },
        results,
      });
    } catch (error: any) {
      const sanitized = (error.message || 'Error en ejecución masiva de catálogo.').replace(
        /shpat_[a-zA-Z0-9]+/g,
        '[REDACTED]'
      );
      return res.status(500).json({ success: false, error: sanitized });
    }
  });

  // Get session logs
  app.get('/api/shopify/logs', async (req, res) => {
    const session = await getSession(req, res);
    return res.json({
      success: true,
      logs: session.logs || [],
    });
  });

  // Clear session logs
  app.delete('/api/shopify/logs', async (req, res) => {
    const session = await getSession(req, res);
    session.logs = [];
    await saveSession(session);
    return res.json({ success: true, message: 'Registros de sesión limpiados.' });
  });

  // Add custom session log from client
  app.post('/api/shopify/add-log', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { operation, status, message, productId } = req.body;
    if (operation && message) {
      addLog(session, operation, status || 'info', message, productId);
      await saveSession(session);
    }
    return res.json({ success: true });
  });

  // ==========================================
  // ALT TEXT AI API ROUTES
  // ==========================================

  // Get Alt Text dashboard metrics & provider status
  app.get('/api/shopify/alt-text/dashboard', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    // No server-side working list to report on anymore (see the Alt Text
    // routes below) - the demo catalog's fixed seed gives a plausible
    // starting number for demo mode, and a live store simply starts at zero
    // until the client's own auto-scan (triggered right after this call)
    // fills in the real numbers.
    const statsSource = session.shop!.isDemo ? getDemoProductMedia(session) : [];
    const currentStats = recalculateAltTextStats(statsSource);
    const { geminiAvailable, claudeAvailable, openaiAvailable, deepseekAvailable, effectiveProvider } =
      getAIProviderAvailability(session);

    return res.json({
      success: true,
      stats: currentStats,
      providerStatus: {
        localConfigured: true,
        geminiConfigured: geminiAvailable,
        claudeConfigured: claudeAvailable,
        openaiConfigured: openaiAvailable,
        deepseekConfigured: deepseekAvailable,
        defaultProvider: effectiveProvider,
      },
    });
  });

  // Check AI provider status
  app.get('/api/shopify/alt-text/provider-status', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { geminiAvailable, claudeAvailable, openaiAvailable, deepseekAvailable, effectiveProvider } =
      getAIProviderAvailability(session);
    return res.json({
      success: true,
      localConfigured: true,
      geminiConfigured: geminiAvailable,
      claudeConfigured: claudeAvailable,
      openaiConfigured: openaiAvailable,
      deepseekConfigured: deepseekAvailable,
      defaultProvider: effectiveProvider,
    });
  });

  // Save session-only Gemini API key (encrypted cookie ONLY)
  app.post('/api/shopify/alt-text/gemini-key', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { apiKey } = req.body;
    if (!session.aiKeys) session.aiKeys = {};
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      delete session.aiKeys.gemini;
      await saveSession(session);
      return res.json({ success: true, configured: false, message: 'Clave de Gemini removida de la sesión.' });
    }
    session.aiKeys.gemini = apiKey.trim();
    addLog(session, 'Configuración IA', 'info', 'Clave de Gemini guardada temporalmente en la sesión.');
    await saveSession(session);
    return res.json({ success: true, configured: true, message: 'Clave guardada en tu sesión (cookie cifrada).' });
  });

  // Save session-only Claude API key (encrypted cookie ONLY)
  app.post('/api/shopify/alt-text/claude-key', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { apiKey } = req.body;
    if (!session.aiKeys) session.aiKeys = {};
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      delete session.aiKeys.claude;
      await saveSession(session);
      return res.json({ success: true, configured: false, message: 'Clave de Claude removida de la sesión.' });
    }
    session.aiKeys.claude = apiKey.trim();
    addLog(session, 'Configuración IA', 'info', 'Clave de Claude guardada temporalmente en la sesión.');
    await saveSession(session);
    return res.json({ success: true, configured: true, message: 'Clave guardada en tu sesión (cookie cifrada).' });
  });

  // Save session-only OpenAI API key (encrypted cookie ONLY)
  app.post('/api/shopify/alt-text/openai-key', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { apiKey } = req.body;
    if (!session.aiKeys) session.aiKeys = {};
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      delete session.aiKeys.openai;
      await saveSession(session);
      return res.json({ success: true, configured: false, message: 'Clave de OpenAI removida de la sesión.' });
    }
    session.aiKeys.openai = apiKey.trim();
    addLog(session, 'Configuración IA', 'info', 'Clave de OpenAI guardada temporalmente en la sesión.');
    await saveSession(session);
    return res.json({ success: true, configured: true, message: 'Clave guardada en tu sesión (cookie cifrada).' });
  });

  // Save session-only DeepSeek API key (encrypted cookie ONLY)
  app.post('/api/shopify/alt-text/deepseek-key', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { apiKey } = req.body;
    if (!session.aiKeys) session.aiKeys = {};
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      delete session.aiKeys.deepseek;
      await saveSession(session);
      return res.json({ success: true, configured: false, message: 'Clave de DeepSeek removida de la sesión.' });
    }
    session.aiKeys.deepseek = apiKey.trim();
    addLog(session, 'Configuración IA', 'info', 'Clave de DeepSeek guardada temporalmente en la sesión.');
    await saveSession(session);
    return res.json({ success: true, configured: true, message: 'Clave guardada en tu sesión (cookie cifrada).' });
  });

  // Toggle DeepSeek's reasoning effort (encrypted cookie ONLY) - 'none' (fast/
  // cheap default) or 'high' (deeper reasoning, closest equivalent to the
  // requested "R1 switch" since deepseek-flash is the only DeepSeek model
  // with real vision support).
  app.post('/api/shopify/alt-text/deepseek-reasoning', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { reasoningEffort } = req.body;
    if (reasoningEffort !== 'none' && reasoningEffort !== 'high') {
      return res.status(400).json({
        success: false,
        error: 'Valor inválido. Debe ser "none" o "high".',
      });
    }
    session.deepseekReasoningEffort = reasoningEffort;
    addLog(
      session,
      'Configuración IA',
      'info',
      `Modo de razonamiento de DeepSeek ajustado a: ${reasoningEffort === 'high' ? 'razonamiento profundo (tipo R1)' : 'rápido (sin razonamiento extendido)'}.`
    );
    await saveSession(session);
    return res.json({ success: true, reasoningEffort: session.deepseekReasoningEffort });
  });

  // ==========================================
  // AI SETTINGS (global provider selection, encrypted cookie ONLY)
  // ==========================================

  // Get current AI provider selection + configuration status for all providers
  app.get('/api/shopify/ai-settings', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { geminiAvailable, claudeAvailable, openaiAvailable, deepseekAvailable, effectiveProvider } =
      getAIProviderAvailability(session);
    return res.json({
      success: true,
      selectedProvider: effectiveProvider,
      hasExplicitSelection: !!session.selectedAIProvider,
      localConfigured: true,
      geminiConfigured: geminiAvailable,
      claudeConfigured: claudeAvailable,
      openaiConfigured: openaiAvailable,
      deepseekConfigured: deepseekAvailable,
      qwen2vlConfigured: true, // No API key needed; reachability is checked per-request
      deepseekReasoningEffort: session.deepseekReasoningEffort || 'none',
    });
  });

  // Explicitly select which AI provider the app should use by default (encrypted cookie ONLY)
  app.post('/api/shopify/ai-settings/provider', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { provider } = req.body;
    if (
      provider !== 'local' &&
      provider !== 'gemini' &&
      provider !== 'claude' &&
      provider !== 'qwen2vl' &&
      provider !== 'openai' &&
      provider !== 'deepseek'
    ) {
      return res.status(400).json({
        success: false,
        error: 'Proveedor inválido. Debe ser "local", "gemini", "claude", "qwen2vl", "openai" o "deepseek".',
      });
    }
    session.selectedAIProvider = provider;
    addLog(session, 'Configuración IA', 'info', `Proveedor de IA seleccionado como predeterminado: ${provider}.`);
    await saveSession(session);
    const { geminiAvailable, claudeAvailable, openaiAvailable, deepseekAvailable, effectiveProvider } =
      getAIProviderAvailability(session);
    return res.json({
      success: true,
      selectedProvider: effectiveProvider,
      localConfigured: true,
      geminiConfigured: geminiAvailable,
      claudeConfigured: claudeAvailable,
      openaiConfigured: openaiAvailable,
      deepseekConfigured: deepseekAvailable,
    });
  });

  // Scan products for images & Alt Text analysis. Returns the full list to
  // the client, which is now the ONLY place this list is held (see the
  // module doc-comment in server/session.ts for why).
  app.post('/api/shopify/alt-text/scan', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const {
        mode = 'all',
        productIds = [],
        csvRows = [],
        onlyWithoutAlt = true,
        regenerateExisting = false,
        sortBy = 'missing_first',
      } = req.body;

      let rawMedia: AltTextMediaRecord[] = [];

      if (session.shop!.isDemo) {
        // Use demo store media
        let baseList = getDemoProductMedia(session);

        if (mode === 'selected' && Array.isArray(productIds) && productIds.length > 0) {
          const cleanIds = new Set(productIds.map((id: string) => String(id).replace(/\D/g, '')));
          baseList = baseList.filter((m) => cleanIds.has(m.productId));
        } else if (mode === 'csv' && Array.isArray(csvRows) && csvRows.length > 0) {
          const csvMap = new Map<string, { mediaId?: string; altText?: string }>();
          csvRows.forEach((r: any) => {
            const pId = String(r.productId || '').replace(/\D/g, '');
            if (pId) csvMap.set(pId, r);
          });
          baseList = baseList.filter((m) => csvMap.has(m.productId));

          // If manual Alt Text was provided in CSV, pre-populate
          baseList = baseList.map((m) => {
            const row = csvMap.get(m.productId);
            if (row && row.altText && row.altText.trim()) {
              return {
                ...m,
                generatedAlt: row.altText.trim(),
                confidence: 1.0,
                confidenceLevel: 'high' as const,
                reason: 'Texto alternativo provisto manualmente en archivo CSV/Excel.',
                isManuallyEdited: true,
                status: 'pending' as const,
              };
            }
            return m;
          });
        }

        rawMedia = baseList;
      } else {
        // Query live Shopify store via Admin GraphQL API
        const targetIds =
          mode === 'selected'
            ? productIds
            : mode === 'csv'
            ? csvRows.map((r: any) => String(r.productId || '').replace(/\D/g, '')).filter(Boolean)
            : undefined;

        const result = await getProductsMedia(
          {
            shopDomain: session.shop!.shopDomain,
            accessToken: session.shop!.accessToken,
          },
          {
            productIds: targetIds,
            limit: 60,
          }
        );

        rawMedia = result.mediaItems.map((item) => ({
          id: item.id,
          mediaId: item.mediaId,
          productId: item.productId,
          productTitle: item.productTitle,
          vendor: item.vendor,
          productType: item.productType,
          description: item.description,
          imageUrl: item.imageUrl,
          currentAlt: item.currentAlt,
          position: item.position,
          width: item.width,
          height: item.height,
          status: 'pending' as const,
        }));

        // Attach manual alt text from CSV if provided
        if (mode === 'csv' && Array.isArray(csvRows)) {
          const csvMap = new Map<string, string>();
          csvRows.forEach((r: any) => {
            const key = `${r.productId}_${r.mediaId || ''}`;
            if (r.altText) csvMap.set(key, r.altText);
            if (r.productId && r.altText) csvMap.set(r.productId, r.altText);
          });

          rawMedia = rawMedia.map((m) => {
            const manual = csvMap.get(`${m.productId}_${m.mediaId}`) || csvMap.get(m.productId);
            if (manual && manual.trim()) {
              return {
                ...m,
                generatedAlt: manual.trim(),
                confidence: 1.0,
                confidenceLevel: 'high' as const,
                reason: 'Texto alternativo provisto manualmente en archivo CSV.',
                isManuallyEdited: true,
              };
            }
            return m;
          });
        }
      }

      // Filter: if onlyWithoutAlt is enabled and regenerateExisting is false,
      // only prioritize or include images without Alt Text
      let processedList: AltTextMediaRecord[] = rawMedia;

      if (onlyWithoutAlt && !regenerateExisting) {
        // Tag images with existing Alt Text or filter
        processedList = processedList.filter((m) => !m.currentAlt || m.currentAlt.trim() === '');
      }

      // Sort
      if (sortBy === 'missing_first') {
        // Group products with most missing alt first
        const missingCountByProd = new Map<string, number>();
        rawMedia.forEach((m) => {
          if (!m.currentAlt || m.currentAlt.trim() === '') {
            missingCountByProd.set(m.productId, (missingCountByProd.get(m.productId) || 0) + 1);
          }
        });
        processedList.sort((a, b) => (missingCountByProd.get(b.productId) || 0) - (missingCountByProd.get(a.productId) || 0));
      } else if (sortBy === 'category') {
        processedList.sort((a, b) => (a.productType || '').localeCompare(b.productType || ''));
      } else if (sortBy === 'id') {
        processedList.sort((a, b) => a.productId.localeCompare(b.productId));
      }

      const stats = recalculateAltTextStats(processedList);

      addLog(
        session,
        'Escaneo Alt Text',
        'info',
        `Escaneo completado: ${stats.analyzedProducts} productos y ${stats.analyzedImages} imágenes analizadas (${stats.imagesWithoutAlt} sin Alt Text).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        media: processedList,
        stats,
      });
    } catch (error: any) {
      const safe = (error.message || 'Error al escanear imágenes de Shopify.').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      return res.status(500).json({ success: false, error: safe });
    }
  });

  // Batch Alt Text Generation using VisionProvider (Local, Gemini, Claude,
  // OpenAI, DeepSeek or Qwen2-VL). The client sends the full list it's
  // currently holding (`items`) plus which of those to target
  // (`mediaIds`) - this route has no memory of its own between calls.
  app.post('/api/shopify/alt-text/generate', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const {
        items = [],
        mediaIds = [],
        provider,
        regenerateExisting = false,
      } = req.body;

      const workingList: AltTextMediaRecord[] = Array.isArray(items) ? items : [];

      const effectiveProvider = provider || getAIProviderAvailability(session).effectiveProvider;
      const aiKeys = session.aiKeys || {};
      const visionProvider = getVisionProvider(
        effectiveProvider,
        aiKeys.gemini,
        aiKeys.claude,
        aiKeys.openai,
        aiKeys.deepseek,
        session.deepseekReasoningEffort || 'none'
      );

      // Select items to generate
      const targetIds = Array.isArray(mediaIds) && mediaIds.length > 0 ? new Set(mediaIds) : null;

      let itemsToProcess = workingList.filter((item) => {
        if (targetIds && !targetIds.has(item.id) && !targetIds.has(item.mediaId)) {
          return false;
        }
        if (item.status === 'updated') return false;
        if (!regenerateExisting && item.currentAlt && item.currentAlt.trim().length > 0) {
          return false;
        }
        return true;
      });

      if (itemsToProcess.length === 0) {
        return res.json({
          success: true,
          message: 'No hay imágenes pendientes para generar.',
          media: workingList,
          stats: recalculateAltTextStats(workingList),
        });
      }

      let generatedCount = 0;
      let errorCount = 0;

      // Process sequentially or with controlled concurrency
      for (const item of itemsToProcess) {
        // If already has manual Alt from CSV or manual edit, respect it
        if (item.isManuallyEdited && item.generatedAlt) {
          continue;
        }

        try {
          const context: VisionContext = {
            productId: item.productId,
            productTitle: item.productTitle,
            productType: item.productType,
            vendor: item.vendor,
            description: item.description,
            imagePosition: item.position,
            totalImages: workingList.filter((m) => m.productId === item.productId).length,
          };

          const genResult = await visionProvider.generateAltText(item.imageUrl, context);

          item.generatedAlt = genResult.alt_text;
          item.isDecorative = genResult.is_decorative;
          item.confidence = genResult.confidence;
          item.confidenceLevel = genResult.confidenceLevel;
          item.reason = genResult.reason;
          item.provider = genResult.provider;
          item.status = genResult.is_decorative ? 'decorative' : 'pending';
          item.errorMessage = undefined;

          generatedCount++;
        } catch (err: any) {
          item.status = 'error';
          item.errorMessage = err.message || 'Error al generar Alt Text.';
          errorCount++;
        }
      }

      const stats = recalculateAltTextStats(workingList);

      addLog(
        session,
        'Generación IA Alt Text',
        errorCount === 0 ? 'success' : 'warning',
        `Generación con ${visionProvider.name}: ${generatedCount} imágenes procesadas con éxito (${errorCount} errores).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        generatedCount,
        errorCount,
        media: workingList,
        stats,
      });
    } catch (error: any) {
      const safe = (error.message || 'Error en generación de Alt Text.').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      return res.status(500).json({ success: false, error: safe });
    }
  });

  // Action on single media item (Approve, Reject, Edit, Mark Decorative).
  // The client sends the full item it already has (`item`) - this is a pure
  // transform, no session/list lookup needed.
  app.post('/api/shopify/alt-text/item-action', requireSession, (req, res) => {
    const { item, action, newAlt } = req.body;

    if (!item || typeof item !== 'object') {
      return res.status(400).json({ success: false, error: 'Falta la imagen a modificar.' });
    }

    const updated: AltTextMediaRecord = { ...item };

    if (action === 'approve') {
      updated.status = 'approved';
    } else if (action === 'reject') {
      updated.status = 'rejected';
    } else if (action === 'decorative') {
      updated.status = 'decorative';
      updated.isDecorative = true;
      updated.generatedAlt = '';
    } else if (action === 'edit' && typeof newAlt === 'string') {
      updated.generatedAlt = newAlt.trim();
      updated.isManuallyEdited = true;
      updated.status = 'approved';
      updated.isDecorative = false;
    }

    return res.json({ success: true, item: updated });
  });

  // Bulk Approve all generated. The client sends its full current list.
  app.post('/api/shopify/alt-text/approve-all', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    const { items = [] } = req.body;
    const workingList: AltTextMediaRecord[] = Array.isArray(items) ? items : [];

    let approvedCount = 0;
    workingList.forEach((item) => {
      if ((item.status === 'pending' || item.status === 'decorative') && (item.generatedAlt || item.isDecorative)) {
        item.status = 'approved';
        approvedCount++;
      }
    });

    const stats = recalculateAltTextStats(workingList);
    addLog(session, 'Aprobación Masiva', 'info', `Se aprobaron ${approvedCount} textos alternativos para actualización.`);
    await saveSession(session);
    return res.json({ success: true, approvedCount, media: workingList, stats });
  });

  // Update approved Alt Text directly in Shopify via GraphQL productUpdateMedia.
  // `items` are the write targets ({productId, mediaId, newAlt}); `allItems`
  // is the client's full current list, round-tripped so the response can
  // include every item (touched and untouched) for a clean state replace.
  app.post('/api/shopify/alt-text/update-shopify', requireSession, async (req, res) => {
    const session = await getSession(req, res);
    try {
      const { items, allItems } = req.body;
      const workingList: AltTextMediaRecord[] = Array.isArray(allItems) ? allItems : [];
      const itemsToUpdate: Array<{ productId: string; mediaId: string; newAlt: string }> =
        Array.isArray(items) && items.length > 0
          ? items
          : workingList
              .filter((m) => m.status === 'approved')
              .map((m) => ({
                productId: m.productId,
                mediaId: m.id || m.mediaId,
                newAlt: m.generatedAlt || '',
              }));

      if (itemsToUpdate.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No hay imágenes aprobadas para actualizar en Shopify.',
        });
      }

      let successCount = 0;
      let errorCount = 0;
      const updateResults: Array<{ productId: string; mediaId: string; status: 'success' | 'error'; error?: string }> = [];

      if (session.shop!.isDemo) {
        // Update the demo store's small per-session overrides
        for (const item of itemsToUpdate) {
          setDemoMediaOverride(session, item.mediaId, { currentAlt: item.newAlt, status: 'updated' });
          const inActive = workingList.find((m) => m.productId === item.productId && (m.id === item.mediaId || m.mediaId === item.mediaId));
          if (inActive) {
            inActive.currentAlt = item.newAlt;
            inActive.status = 'updated';
          }
          successCount++;
          session.stats!.successful++;
          session.stats!.processed++;
          addLog(
            session,
            'Alt Text Actualizado',
            'success',
            `Producto ${item.productId}: Alt Text actualizado a "${item.newAlt || '(Decorativa)'}"`,
            item.productId
          );
          updateResults.push({ productId: item.productId, mediaId: item.mediaId, status: 'success' });
        }
      } else {
        // Group by productId for Shopify productUpdateMedia GraphQL mutation
        const byProduct = new Map<string, Array<{ id: string; alt: string }>>();
        for (const item of itemsToUpdate) {
          const list = byProduct.get(item.productId) || [];
          list.push({ id: item.mediaId, alt: item.newAlt });
          byProduct.set(item.productId, list);
        }

        for (const [productId, mediaList] of byProduct.entries()) {
          try {
            const updateRes = await updateMediaAltText(
              {
                shopDomain: session.shop!.shopDomain,
                accessToken: session.shop!.accessToken,
              },
              productId,
              mediaList
            );

            if (updateRes.success) {
              successCount += mediaList.length;
              session.stats!.successful += mediaList.length;
              session.stats!.processed += mediaList.length;

              // Mark items in the working list
              mediaList.forEach((m) => {
                const found = workingList.find((item) => (item.id === m.id || item.mediaId === m.id) && item.productId === productId);
                if (found) {
                  found.currentAlt = m.alt;
                  found.status = 'updated';
                }
                updateResults.push({ productId, mediaId: m.id, status: 'success' });
              });

              addLog(
                session,
                'Alt Text Shopify',
                'success',
                `Actualizado(s) ${mediaList.length} Alt Text en producto ID ${productId} en Shopify.`,
                productId
              );
            } else {
              errorCount += mediaList.length;
              session.stats!.errors += mediaList.length;
              mediaList.forEach((m) => {
                const found = workingList.find((item) => (item.id === m.id || item.mediaId === m.id) && item.productId === productId);
                if (found) {
                  found.status = 'error';
                  found.errorMessage = updateRes.errorMessage;
                }
                updateResults.push({ productId, mediaId: m.id, status: 'error', error: updateRes.errorMessage });
              });

              addLog(
                session,
                'Error Alt Text Shopify',
                'error',
                `Fallo al actualizar producto ${productId}: ${updateRes.errorMessage}`,
                productId
              );
            }
          } catch (err: any) {
            errorCount += mediaList.length;
            session.stats!.errors += mediaList.length;
            const safeErr = (err.message || 'Error en mutación Shopify.').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
            addLog(session, 'Error Alt Text Shopify', 'error', safeErr, productId);
          }
        }
      }

      const stats = recalculateAltTextStats(workingList);

      addLog(
        session,
        'Lote Alt Text Finalizado',
        errorCount === 0 ? 'success' : 'warning',
        `Procesamiento completado: ${successCount} imágenes actualizadas en Shopify (${errorCount} con error).`
      );
      await saveSession(session);

      return res.json({
        success: true,
        updatedCount: successCount,
        errorCount,
        stats,
        media: workingList,
        results: updateResults,
      });
    } catch (error: any) {
      const safe = (error.message || 'Error al actualizar imágenes en Shopify.').replace(/shpat_[a-zA-Z0-9]+/g, '[REDACTED]');
      return res.status(500).json({ success: false, error: safe });
    }
  });


  return app;
}
