import React, { useState, useEffect } from 'react';
import { ShopifyProduct, ShopConnectionInfo } from '../types/seo';
import { getProductById, updateProductSEO } from '../services/api';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Globe,
  Tag,
  FileText,
  Save,
  RotateCcw,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

interface SingleProductEditorProps {
  shop: ShopConnectionInfo;
  onProductUpdated?: () => void;
  initialProductId?: string;
}

export const SingleProductEditor: React.FC<SingleProductEditorProps> = ({ shop, onProductUpdated, initialProductId }) => {
  const [searchId, setSearchId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Loaded product
  const [product, setProduct] = useState<ShopifyProduct | null>(null);

  // Form edit state
  const [editHandle, setEditHandle] = useState('');
  const [editSeoTitle, setEditSeoTitle] = useState('');
  const [editSeoDescription, setEditSeoDescription] = useState('');

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent, idOverride?: string) => {
    if (e) e.preventDefault();
    setSearchError(null);
    setSaveSuccess(null);
    setSaveError(null);

    const cleanId = (idOverride ?? searchId).trim();
    if (!cleanId) {
      setSearchError('Por favor ingresa un Shopify Product ID (ej: 1234567890123).');
      return;
    }

    setIsSearching(true);
    try {
      const fetched = await getProductById(cleanId);
      setProduct(fetched);
      setEditHandle(fetched.handle);
      setEditSeoTitle(fetched.seoTitle);
      setEditSeoDescription(fetched.seoDescription);
    } catch (err: any) {
      setProduct(null);
      setSearchError(err.message || 'No fue posible encontrar el producto.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickFill = (sampleId: string) => {
    setSearchId(sampleId);
  };

  // When arriving from the SEO Audit tab with a pre-selected product, auto-run the search.
  useEffect(() => {
    if (initialProductId && initialProductId.trim()) {
      setSearchId(initialProductId);
      handleSearch(undefined, initialProductId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId]);

  const handleResetToCurrent = () => {
    if (!product) return;
    setEditHandle(product.handle);
    setEditSeoTitle(product.seoTitle);
    setEditSeoDescription(product.seoDescription);
    setSaveSuccess(null);
    setSaveError(null);
  };

  const handleSaveClick = () => {
    setSaveError(null);
    setSaveSuccess(null);

    // Validate handle format if provided and changed
    if (editHandle.trim() !== '' && editHandle.trim() !== product?.handle) {
      const handleRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!handleRegex.test(editHandle.trim())) {
        setSaveError(
          'El Handle contiene un formato inválido. Solo debe contener letras minúsculas, números y guiones sencillos (sin espacios).'
        );
        return;
      }
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (!product) return;
    setShowConfirmModal(false);
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      // Build payload
      const payload: {
        productId: string;
        handle?: string;
        seoTitle?: string;
        seoDescription?: string;
        previousHandle?: string;
      } = {
        productId: product.numericId,
      };

      if (editHandle.trim() !== product.handle) {
        payload.handle = editHandle.trim();
        payload.previousHandle = product.handle;
      }

      if (editSeoTitle !== product.seoTitle) {
        payload.seoTitle = editSeoTitle;
      }

      if (editSeoDescription !== product.seoDescription) {
        payload.seoDescription = editSeoDescription;
      }

      const updated = await updateProductSEO(payload);
      setProduct(updated);
      setEditHandle(updated.handle);
      setEditSeoTitle(updated.seoTitle);
      setEditSeoDescription(updated.seoDescription);
      let successMsg = `¡Información SEO actualizada exitosamente en Shopify para "${updated.title}"!`;
      if (updated.redirectCreated) {
        successMsg += ' Se creó automáticamente el redirect 301 de la URL anterior a la nueva.';
      } else if (updated.redirectWarning) {
        successMsg += ` Atención: no se pudo crear el redirect 301 automático (${updated.redirectWarning})`;
      }
      setSaveSuccess(successMsg);
      if (onProductUpdated) onProductUpdated();
    } catch (err: any) {
      setSaveError(err.message || 'Ocurrió un error al actualizar el producto en Shopify.');
    } finally {
      setIsSaving(false);
    }
  };

  // Live SERP Preview values
  const displayTitle = editSeoTitle.trim() || product?.title || 'Título del Producto';
  const displayHandle = editHandle.trim() || product?.handle || 'url-del-producto';
  const displayDesc =
    editSeoDescription.trim() ||
    'Esta es la descripción que verán los usuarios en los resultados de búsqueda de Google cuando busquen tu producto.';
  const displayUrl = `https://${shop.domain}/products/${displayHandle}`;

  return (
    <div className="space-y-6">
      {/* Title & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Editar producto
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Consulta y actualiza directamente el Handle, SEO Title y Meta Description usando su <strong>Shopify Product ID</strong>.
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="input-product-id-search"
              type="text"
              placeholder="Ingresa Product ID (ej: 1234567890123 o gid://shopify/Product/1234567890123)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#6012C3] focus:border-[#6012C3] transition-all font-mono"
            />
          </div>

          <button
            id="btn-search-product"
            type="submit"
            disabled={isSearching}
            className="px-5 py-2.5 bg-[#6012C3] hover:bg-[#4b0d9c] text-white font-semibold text-sm rounded-xl transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isSearching ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Buscando...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Buscar producto</span>
              </>
            )}
          </button>
        </form>

        {/* Demo shortcuts if in demo mode */}
        {shop.isDemo && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#6012C3]" />
              IDs de prueba:
            </span>
            {[
              { id: '1234567890123', label: 'Galaxy S25 Ultra' },
              { id: '9876543210987', label: 'iPhone 16 Pro Max' },
              { id: '4567890123456', label: 'Sony WH-1000XM5' },
              { id: '7890123456789', label: 'Xiaomi 14 Ultra' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  handleQuickFill(s.id);
                }}
                className="px-2.5 py-1 bg-purple-50 text-[#6012C3] hover:bg-purple-100 rounded-lg font-mono text-[11px] font-medium border border-purple-200/60 transition-colors cursor-pointer"
              >
                {s.label} ({s.id})
              </button>
            ))}
          </div>
        )}

        {/* Search error */}
        {searchError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{searchError}</span>
          </div>
        )}
      </div>

      {/* Save status banners */}
      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-start space-x-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">{saveSuccess}</p>
            <p className="text-xs text-emerald-700">
              Los cambios han sido guardados en Shopify de acuerdo con la Admin GraphQL API.
            </p>
          </div>
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-start space-x-2">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">Error al guardar cambios</p>
            <p className="text-xs text-rose-700">{saveError}</p>
          </div>
        </div>
      )}

      {/* Product Information & Editor Section */}
      {product && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Editor Form */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
              {/* Product Header Card */}
              <div className="pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    <span>Producto Seleccionado</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono text-[#6012C3]">ID: {product.numericId}</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 mt-1">
                    {product.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleResetToCurrent}
                  className="inline-flex items-center space-x-1 text-xs font-medium text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restablecer</span>
                </button>
              </div>

              {/* Field 1: URL Handle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-url-handle" className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5 text-[#6012C3]" />
                    <span>URL Handle</span>
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Actual: {product.handle}
                  </span>
                </div>
                <input
                  id="input-url-handle"
                  type="text"
                  value={editHandle}
                  onChange={(e) => setEditHandle(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="samsung-galaxy-s25-ultra-512gb"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6012C3] focus:border-[#6012C3] transition-all"
                />
                <p className="text-[11px] text-slate-400">
                  Identificador para la URL pública del producto en la tienda. Solo minúsculas, números y guiones.
                </p>
              </div>

              {/* Field 2: SEO Title */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-seo-title" className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <Tag className="w-3.5 h-3.5 text-[#6012C3]" />
                    <span>SEO Title</span>
                  </label>
                  <span
                    className={`text-[11px] font-semibold ${
                      editSeoTitle.length > 70 ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {editSeoTitle.length} / 70 caracteres
                  </span>
                </div>
                <input
                  id="input-seo-title"
                  type="text"
                  value={editSeoTitle}
                  onChange={(e) => setEditSeoTitle(e.target.value)}
                  placeholder="Samsung Galaxy S25 Ultra 512GB | Doto"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6012C3] focus:border-[#6012C3] transition-all"
                />
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">
                    Recomendación: 50 a 70 caracteres para evitar recortes en Google.
                  </span>
                  {product.seoTitle && (
                    <span className="text-slate-400 truncate max-w-[200px]" title={product.seoTitle}>
                      Actual: {product.seoTitle}
                    </span>
                  )}
                </div>
              </div>

              {/* Field 3: Meta Description SEO */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="input-meta-description" className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#6012C3]" />
                    <span>Meta Description SEO</span>
                  </label>
                  <span
                    className={`text-[11px] font-semibold ${
                      editSeoDescription.length > 160 ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {editSeoDescription.length} / 160 caracteres
                  </span>
                </div>
                <textarea
                  id="input-meta-description"
                  rows={4}
                  value={editSeoDescription}
                  onChange={(e) => setEditSeoDescription(e.target.value)}
                  placeholder="Compra el nuevo Samsung Galaxy S25 Ultra al mejor precio..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6012C3] focus:border-[#6012C3] transition-all resize-y"
                />
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-400">
                    Recomendación: 120 a 160 caracteres para captar clics y CTR orgánico.
                  </span>
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-3">
                <button
                  id="btn-save-seo-single"
                  type="button"
                  onClick={handleSaveClick}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-[#6012C3] hover:bg-[#4b0d9c] text-white font-semibold text-sm rounded-xl transition-all shadow-xs flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar cambios</span>
                </button>
              </div>
            </div>
          </div>

          {/* Side Preview: Google SERP Simulator */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-1.5">
                  <Globe className="w-4 h-4 text-[#6012C3]" />
                  <span>Vista Previa en Google</span>
                </h3>
                <span className="text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  Simulador SERP
                </span>
              </div>

              {/* Google Result Box */}
              <div className="p-4 bg-slate-50/70 rounded-xl border border-slate-200/80 space-y-1.5 font-sans">
                {/* URL row */}
                <div className="flex items-center space-x-2 text-xs text-slate-600 truncate">
                  <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-600 font-bold shrink-0">
                    D
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="text-[11px] font-medium text-slate-800 truncate">{shop.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono truncate">{displayUrl}</span>
                  </div>
                </div>

                {/* Title */}
                <h4 className="text-base text-[#1a0dab] hover:underline font-normal cursor-pointer leading-snug line-clamp-2">
                  {displayTitle}
                </h4>

                {/* Description */}
                <p className="text-xs text-[#4d5156] leading-relaxed line-clamp-3">
                  {displayDesc}
                </p>
              </div>

              {/* Comparison table */}
              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                <span className="font-semibold text-slate-700 text-[11px] uppercase tracking-wider block">
                  Resumen de Modificaciones:
                </span>
                <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Handle:</span>
                    <span className={`font-mono ${editHandle !== product.handle ? 'text-[#6012C3] font-bold' : 'text-slate-700'}`}>
                      {editHandle !== product.handle ? 'Modificado' : 'Sin cambios'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">SEO Title:</span>
                    <span className={editSeoTitle !== product.seoTitle ? 'text-[#6012C3] font-bold' : 'text-slate-700'}>
                      {editSeoTitle !== product.seoTitle ? 'Modificado' : 'Sin cambios'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Meta Description:</span>
                    <span className={editSeoDescription !== product.seoDescription ? 'text-[#6012C3] font-bold' : 'text-slate-700'}>
                      {editSeoDescription !== product.seoDescription ? 'Modificado' : 'Sin cambios'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal required by specifications */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="w-12 h-12 rounded-xl bg-[#6012C3]/10 text-[#6012C3] flex items-center justify-center">
              <Save className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">
                Confirmar actualización en Shopify
              </h3>
              <p className="text-xs text-slate-500">
                Vas a actualizar la información SEO de este producto en Shopify. ¿Deseas continuar?
              </p>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1 font-mono text-slate-700">
              <p><strong>Producto:</strong> {product?.title}</p>
              <p><strong>ID:</strong> {product?.numericId}</p>
              <p><strong>Campos afectados:</strong> Únicamente Handle, SEO Title y Meta Description.</p>
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
                onClick={handleConfirmSave}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#6012C3] hover:bg-[#4b0d9c] rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Confirmar y actualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
