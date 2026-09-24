import * as XLSX from 'xlsx';
import { ExecutionResult, SEOAuditRow, CatalogAuditRow } from '../types/seo';

export interface ParsedFileRow {
  rowNumber: number;
  productId: string;
  handle?: string;
  seoTitle?: string;
  seoDescription?: string;
}

/**
 * Normalizes header string to ease fuzzy detection
 */
function normalizeHeader(header: string): string {
  return String(header || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Identifies column mappings from any sheet or CSV headers
 */
function detectColumns(headers: string[]): {
  productIdCol?: string;
  handleCol?: string;
  seoTitleCol?: string;
  seoDescCol?: string;
} {
  let productIdCol: string | undefined;
  let handleCol: string | undefined;
  let seoTitleCol: string | undefined;
  let seoDescCol: string | undefined;

  // Pass 1: Strict match for SEO-specific and primary identifiers
  for (const h of headers) {
    const norm = normalizeHeader(h);

    if (!productIdCol) {
      if (
        norm === 'productid' ||
        norm === 'id' ||
        norm === 'idproducto' ||
        norm === 'shopifyid' ||
        norm === 'shopifyproductid' ||
        norm === 'product' ||
        norm === 'identificador' ||
        norm === 'idproduct' ||
        norm === 'idshopify' ||
        norm === 'productidentifier'
      ) {
        productIdCol = h;
      }
    }

    if (!handleCol) {
      if (
        norm === 'urlhandle' ||
        norm === 'handle' ||
        norm === 'slug' ||
        norm === 'handleurl' ||
        norm === 'producthandle' ||
        norm === 'url' ||
        norm === 'enlace'
      ) {
        handleCol = h;
      }
    }

    if (!seoTitleCol) {
      if (
        norm === 'seotitle' ||
        norm === 'titleseo' ||
        norm === 'tituloseo' ||
        norm === 'seotitulo' ||
        norm === 'metatitle' ||
        norm === 'metatitulo' ||
        norm === 'titulometa' ||
        norm === 'seoname' ||
        norm === 'seonombre' ||
        norm === 'title' ||
        norm === 'titulo'
      ) {
        seoTitleCol = h;
      }
    }

    if (!seoDescCol) {
      if (
        norm === 'metadescription' ||
        norm === 'metadescriptionseo' ||
        norm === 'seodescription' ||
        norm === 'seodescripcion' ||
        norm === 'metadescripcion' ||
        norm === 'descripcionseo' ||
        norm === 'descripciometa' ||
        norm === 'descripcionmeta' ||
        norm === 'metadesc' ||
        norm === 'seodesc' ||
        norm === 'description' ||
        norm === 'descripcion'
      ) {
        seoDescCol = h;
      }
    }
  }

  // Pass 2: Fallbacks if not detected by strict names
  if (!productIdCol) {
    productIdCol = headers.find((h) => {
      const n = normalizeHeader(h);
      return n.includes('id') && !n.includes('handle') && !n.includes('title') && !n.includes('desc');
    });
  }
  if (!handleCol) {
    handleCol = headers.find((h) => {
      const n = normalizeHeader(h);
      return n.includes('handle') || n.includes('slug') || n.includes('url');
    });
  }
  if (!seoTitleCol) {
    seoTitleCol = headers.find((h) => {
      const n = normalizeHeader(h);
      return (n.includes('title') || n.includes('titulo')) && !n.includes('desc');
    });
  }
  if (!seoDescCol) {
    seoDescCol = headers.find((h) => {
      const n = normalizeHeader(h);
      return n.includes('desc') || (n.includes('meta') && !n.includes('title') && !n.includes('titulo'));
    });
  }

  return { productIdCol, handleCol, seoTitleCol, seoDescCol };
}

/**
 * Reads and parses an uploaded file (.csv, .xlsx, .xls)
 */
export async function parseUploadFile(file: File): Promise<{
  rows: ParsedFileRow[];
  columnMapping: {
    productIdCol?: string;
    handleCol?: string;
    seoTitleCol?: string;
    seoDescCol?: string;
  };
}> {
  const data = await file.arrayBuffer();
  // codepage 65001 = UTF-8. Without it, a .csv with no BOM gets its accented
  // characters (á, é, í, ó, ú, ñ) double-decoded as Latin-1, mangling them
  // (confirmed by hand: "ó" round-tripped as "Ã³").
  const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });

  if (workbook.SheetNames.length === 0) {
    throw new Error('El archivo cargado no contiene hojas de cálculo.');
  }

  // Pick first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // Convert to JSON with raw values
  const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

  if (jsonRows.length === 0) {
    throw new Error('El archivo está vacío o no contiene filas con datos.');
  }

  // Detect column names from keys of the first row
  const headers = Object.keys(jsonRows[0]);
  const columnMapping = detectColumns(headers);

  if (!columnMapping.productIdCol) {
    throw new Error(
      `No se encontró la columna obligatoria de "Product ID". Columnas detectadas: ${headers.join(', ')}`
    );
  }

  const parsedRows: ParsedFileRow[] = [];

  jsonRows.forEach((row, index) => {
    const rawId = String(row[columnMapping.productIdCol!] || '').trim();
    // Skip completely empty lines
    if (!rawId && !row[columnMapping.handleCol || ''] && !row[columnMapping.seoTitleCol || '']) {
      return;
    }

    const rowItem: ParsedFileRow = {
      rowNumber: index + 2, // 1-indexed plus header
      productId: rawId,
    };

    if (columnMapping.handleCol && row[columnMapping.handleCol] !== undefined) {
      const val = String(row[columnMapping.handleCol]).trim();
      if (val !== '') rowItem.handle = val;
    }

    if (columnMapping.seoTitleCol && row[columnMapping.seoTitleCol] !== undefined) {
      const val = String(row[columnMapping.seoTitleCol]).trim();
      if (val !== '') rowItem.seoTitle = val;
    }

    if (columnMapping.seoDescCol && row[columnMapping.seoDescCol] !== undefined) {
      const val = String(row[columnMapping.seoDescCol]).trim();
      if (val !== '') rowItem.seoDescription = val;
    }

    parsedRows.push(rowItem);
  });

  return { rows: parsedRows, columnMapping };
}

/**
 * Identifies column mappings for the catalog Audit's bulk-update upload
 * (Marca/Precio/Descripción instead of the SEO fields above).
 */
function detectCatalogAuditColumns(headers: string[]): {
  productIdCol?: string;
  vendorCol?: string;
  skuCol?: string;
  priceCol?: string;
  descriptionCol?: string;
} {
  let productIdCol: string | undefined;
  let vendorCol: string | undefined;
  let skuCol: string | undefined;
  let priceCol: string | undefined;
  let descriptionCol: string | undefined;

  for (const h of headers) {
    const norm = normalizeHeader(h);

    if (!productIdCol) {
      if (
        norm === 'productid' ||
        norm === 'id' ||
        norm === 'idproducto' ||
        norm === 'shopifyid' ||
        norm === 'shopifyproductid' ||
        norm === 'product' ||
        norm === 'identificador' ||
        norm === 'idproduct' ||
        norm === 'idshopify' ||
        norm === 'productidentifier'
      ) {
        productIdCol = h;
      }
    }

    if (!vendorCol) {
      if (norm === 'marca' || norm === 'vendor' || norm === 'brand' || norm === 'proveedor' || norm === 'marcavendor') {
        vendorCol = h;
      }
    }

    if (!skuCol) {
      if (norm === 'sku' || norm === 'skuvariante' || norm === 'variantsku' || norm === 'codigo' || norm === 'codigosku') {
        skuCol = h;
      }
    }

    if (!priceCol) {
      if (norm === 'precio' || norm === 'price' || norm === 'preciolista' || norm === 'preciopvp' || norm === 'preciodeventa') {
        priceCol = h;
      }
    }

    if (!descriptionCol) {
      if (
        norm === 'descripcion' ||
        norm === 'description' ||
        norm === 'descripciondelproducto' ||
        norm === 'productdescription'
      ) {
        descriptionCol = h;
      }
    }
  }

  if (!productIdCol) {
    productIdCol = headers.find((h) => {
      const n = normalizeHeader(h);
      return (
        n.includes('id') &&
        !n.includes('marca') &&
        !n.includes('vendor') &&
        !n.includes('sku') &&
        !n.includes('precio') &&
        !n.includes('price') &&
        !n.includes('desc')
      );
    });
  }
  if (!vendorCol) {
    vendorCol = headers.find((h) => {
      const n = normalizeHeader(h);
      return n.includes('marca') || n.includes('vendor') || n.includes('brand');
    });
  }
  if (!skuCol) {
    skuCol = headers.find((h) => normalizeHeader(h).includes('sku'));
  }
  if (!priceCol) {
    priceCol = headers.find((h) => {
      const n = normalizeHeader(h);
      return n.includes('precio') || n.includes('price');
    });
  }
  if (!descriptionCol) {
    descriptionCol = headers.find((h) => {
      const n = normalizeHeader(h);
      return n.includes('desc');
    });
  }

  return { productIdCol, vendorCol, skuCol, priceCol, descriptionCol };
}

export interface CatalogAuditParsedRow {
  rowNumber: number;
  productId: string;
  vendor?: string;
  sku?: string;
  price?: string;
  description?: string;
}

/**
 * Reads and parses an uploaded file (.csv, .xlsx, .xls) for the catalog
 * Audit's bulk-update flow. Mirrors `parseUploadFile` above but detects
 * Marca/SKU/Precio/Descripción columns instead of the SEO ones. SKU
 * identifies exactly which variant a price change applies to.
 */
export async function parseCatalogAuditUploadFile(file: File): Promise<{
  rows: CatalogAuditParsedRow[];
  columnMapping: {
    productIdCol?: string;
    vendorCol?: string;
    skuCol?: string;
    priceCol?: string;
    descriptionCol?: string;
  };
}> {
  const data = await file.arrayBuffer();
  // codepage 65001 = UTF-8. Without it, a .csv with no BOM gets its accented
  // characters (á, é, í, ó, ú, ñ) double-decoded as Latin-1, mangling them
  // (confirmed by hand: "ó" round-tripped as "Ã³").
  const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });

  if (workbook.SheetNames.length === 0) {
    throw new Error('El archivo cargado no contiene hojas de cálculo.');
  }

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

  if (jsonRows.length === 0) {
    throw new Error('El archivo está vacío o no contiene filas con datos.');
  }

  const headers = Object.keys(jsonRows[0]);
  const columnMapping = detectCatalogAuditColumns(headers);

  if (!columnMapping.productIdCol) {
    throw new Error(
      `No se encontró la columna obligatoria de "Product ID". Columnas detectadas: ${headers.join(', ')}`
    );
  }

  const parsedRows: CatalogAuditParsedRow[] = [];

  jsonRows.forEach((row, index) => {
    const rawId = String(row[columnMapping.productIdCol!] || '').trim();
    if (
      !rawId &&
      !row[columnMapping.vendorCol || ''] &&
      !row[columnMapping.skuCol || ''] &&
      !row[columnMapping.priceCol || ''] &&
      !row[columnMapping.descriptionCol || '']
    ) {
      return;
    }

    const rowItem: CatalogAuditParsedRow = {
      rowNumber: index + 2,
      productId: rawId,
    };

    if (columnMapping.vendorCol && row[columnMapping.vendorCol] !== undefined) {
      const val = String(row[columnMapping.vendorCol]).trim();
      if (val !== '') rowItem.vendor = val;
    }

    if (columnMapping.skuCol && row[columnMapping.skuCol] !== undefined) {
      const val = String(row[columnMapping.skuCol]).trim();
      if (val !== '') rowItem.sku = val;
    }

    if (columnMapping.priceCol && row[columnMapping.priceCol] !== undefined) {
      const val = String(row[columnMapping.priceCol]).trim();
      if (val !== '') rowItem.price = val;
    }

    if (columnMapping.descriptionCol && row[columnMapping.descriptionCol] !== undefined) {
      const val = String(row[columnMapping.descriptionCol]).trim();
      if (val !== '') rowItem.description = val;
    }

    parsedRows.push(rowItem);
  });

  return { rows: parsedRows, columnMapping };
}

/**
 * Downloads the catalog Audit's bulk-update CSV template, with example rows
 * that each fill in only the one field that needs fixing — showing that a
 * blank cell means "leave this field untouched in Shopify" (same convention
 * as the SEO bulk-update template).
 */
export function downloadCatalogAuditCSVTemplate(): void {
  const headers = ['Product ID', 'Marca', 'SKU', 'Precio', 'Descripción'];
  const sampleRows = [
    ['1112223334445', 'Doto Accesorios', '', '', ''],
    ['2223334445556', 'Doto Accesorios', '', '', ''],
    ['3334445556667', '', '', '', 'Mica de cristal templado 9H con instalación fácil sin burbujas y dureza anti-rayaduras.'],
    ['4445556667778', '', '', '199.00', ''],
    ['5556667778889', '', 'HDMI21-8K-5M', '429.00', ''],
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map((row) =>
      row
        .map((val) => {
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'plantilla_doto_auditoria_catalogo.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads Excel (.xlsx) template for the catalog Audit's bulk-update flow,
 * with a Productos sheet plus an Instrucciones sheet — same two-sheet shape
 * as `downloadExcelTemplate` for SEO.
 */
export function downloadCatalogAuditExcelTemplate(): void {
  const wb = XLSX.utils.book_new();

  const headers = ['Product ID', 'Marca', 'SKU', 'Precio', 'Descripción'];
  const sampleData = [
    headers,
    ['1112223334445', 'Doto Accesorios', '', '', ''],
    ['2223334445556', 'Doto Accesorios', '', '', ''],
    ['3334445556667', '', '', '', 'Mica de cristal templado 9H con instalación fácil sin burbujas y dureza anti-rayaduras.'],
    ['4445556667778', '', '', '199.00', ''],
    ['5556667778889', '', 'HDMI21-8K-5M', '429.00', ''],
  ];

  const wsProductos = XLSX.utils.aoa_to_sheet(sampleData);
  wsProductos['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsProductos, 'Productos');

  const instruccionesData = [
    ['INSTRUCCIONES DE USO — PLANTILLA AUDITORÍA DE CATÁLOGO DOTO'],
    [''],
    ['Campo', 'Requerido', 'Recomendación / Reglas', 'Comportamiento si se deja vacío'],
    ['Product ID', 'SÍ (Obligatorio)', 'Debe ser el ID numérico de Shopify del producto (ej: 1234567890123).', 'La fila será rechazada con error.'],
    ['Marca', 'Opcional', 'Nombre real de la marca/proveedor. Sustituye valores "BASE" o vacíos.', 'NO se modifica la marca actual en Shopify.'],
    ['SKU', 'Solo si el producto tiene varias variantes y vas a corregir Precio', 'SKU exacto de la variante a corregir. Si el producto tiene una sola variante, puedes dejarlo en blanco.', 'Si hay Precio y el producto tiene varias variantes, la fila se rechaza con error (no sabemos cuál corregir).'],
    ['Precio', 'Opcional', 'Número sin símbolo de moneda (ej: 349.00). Corrige SOLO la variante indicada en SKU.', 'NO se modifica el precio actual en Shopify.'],
    ['Descripción', 'Opcional', 'Texto plano de la descripción del producto.', 'NO se modifica la descripción actual.'],
    [''],
    ['REGLAS CLAVE:'],
    ['1. Solo se modifican Marca, Precio y/o Descripción — ningún otro dato del producto se altera (handle, SEO, imágenes, inventario).'],
    ['2. Modo "Solo cambios": Si el nuevo valor es idéntico al actual en Shopify, no se genera actualización innecesaria.'],
    ['3. Si dejas una celda en blanco, el valor actual en Shopify se conserva sin tocar.'],
    ['4. El Precio corrige SOLO la variante/SKU indicada — nunca las demás variantes del mismo producto.'],
    ['5. Antes de actualizar la tienda real, siempre verás una vista previa de validación con semáforo (verde/amarillo/rojo).'],
  ];

  const wsInstrucciones = XLSX.utils.aoa_to_sheet(instruccionesData);
  wsInstrucciones['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 60 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

  XLSX.writeFile(wb, 'plantilla_doto_auditoria_catalogo.xlsx');
}

/**
 * Downloads CSV template
 */
export function downloadCSVTemplate(): void {
  const headers = ['Product ID', 'URL Handle', 'SEO Title', 'Meta Description'];
  const sampleRows = [
    [
      '1234567890123',
      'samsung-galaxy-s25-ultra-512gb',
      'Samsung Galaxy S25 Ultra 512GB | Doto',
      'Compra el nuevo Samsung Galaxy S25 Ultra con cámara de 200MP y Snapdragon 8 Elite.',
    ],
    [
      '9876543210987',
      'iphone-16-pro-max-256gb-titanio',
      'iPhone 16 Pro Max 256GB - Doto México',
      'Descubre el Apple iPhone 16 Pro Max con chip A18 Pro. Envío gratis y meses sin intereses.',
    ],
    [
      '4567890123456',
      '',
      'Sony WH-1000XM5 Audífonos Noise Cancelling',
      'Audífonos inalámbricos con cancelación de ruido premium Sony WH-1000XM5.',
    ],
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map((row) =>
      row
        .map((val) => {
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'plantilla_doto_seo_productos.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads Excel (.xlsx) template with two sheets (Productos and Instrucciones)
 */
export function downloadExcelTemplate(): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Productos
  const headers = ['Product ID', 'URL Handle', 'SEO Title', 'Meta Description'];
  const sampleData = [
    headers,
    [
      '1234567890123',
      'samsung-galaxy-s25-ultra-512gb',
      'Samsung Galaxy S25 Ultra 512GB | Doto',
      'Compra el nuevo Samsung Galaxy S25 Ultra con cámara de 200MP y Snapdragon 8 Elite.',
    ],
    [
      '9876543210987',
      'iphone-16-pro-max-256gb-titanio',
      'iPhone 16 Pro Max 256GB - Doto México',
      'Descubre el Apple iPhone 16 Pro Max con chip A18 Pro. Envío gratis y meses sin intereses.',
    ],
    [
      '4567890123456',
      '',
      'Sony WH-1000XM5 Audífonos Noise Cancelling',
      'Audífonos inalámbricos con cancelación de ruido premium Sony WH-1000XM5.',
    ],
  ];

  const wsProductos = XLSX.utils.aoa_to_sheet(sampleData);

  // Column widths
  wsProductos['!cols'] = [{ wch: 18 }, { wch: 35 }, { wch: 45 }, { wch: 70 }];

  XLSX.utils.book_append_sheet(wb, wsProductos, 'Productos');

  // Sheet 2: Instrucciones
  const instruccionesData = [
    ['INSTRUCCIONES DE USO — PLANTILLA DOTO SEO'],
    [''],
    ['Campo', 'Requerido', 'Recomendación / Reglas', 'Comportamiento si se deja vacío'],
    ['Product ID', 'SÍ (Obligatorio)', 'Debe ser el ID numérico de Shopify del producto (ej: 1234567890123).', 'La fila será rechazada con error.'],
    ['URL Handle', 'Opcional', 'Slug de la URL del producto. Solo letras minúsculas, números y guiones (ej: galaxy-s25-ultra). No espacios.', 'NO se modifica el handle actual en Shopify.'],
    ['SEO Title', 'Opcional', 'Título para motores de búsqueda. Recomendado entre 50 y 70 caracteres.', 'NO se modifica el SEO Title actual.'],
    ['Meta Description', 'Opcional', 'Descripción SEO para Google. Recomendado entre 120 y 160 caracteres.', 'NO se modifica la Meta Description actual.'],
    [''],
    ['REGLAS CLAVE:'],
    ['1. Solo se modifican Handle, SEO Title y Meta Description. Ningún otro dato del producto se altera.'],
    ['2. Modo "Solo cambios": Si el nuevo valor es idéntico al actual en Shopify, no se genera llamada innecesaria.'],
    ['3. Si dejas una celda en blanco, el valor actual en Shopify se conserva sin tocar.'],
    ['4. Antes de actualizar la tienda real, siempre verás una vista previa de validación.'],
  ];

  const wsInstrucciones = XLSX.utils.aoa_to_sheet(instruccionesData);
  wsInstrucciones['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 60 }, { wch: 45 }];

  XLSX.utils.book_append_sheet(wb, wsInstrucciones, 'Instrucciones');

  XLSX.writeFile(wb, 'plantilla_doto_seo_productos.xlsx');
}

/**
 * Downloads a CSV pre-filled with the current handle/SEO title/meta description
 * of the given audit rows, in the same column format the bulk-upload template
 * expects — so the user can tweak values in Excel and re-upload it through the
 * existing "Actualización masiva" CSV flow.
 */
export function downloadSEOAuditSelectionCSV(rows: SEOAuditRow[]): void {
  const headers = ['Product ID', 'URL Handle', 'SEO Title', 'Meta Description'];

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      [row.numericId, row.handle, row.seoTitle, row.seoDescription]
        .map((val) => {
          const str = String(val ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.setAttribute('download', `auditoria_seo_seleccion_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads a CSV of the catalog audit results (marca/precio/descripción
 * issues) so the flagged products can be reviewed or shared without needing
 * to keep the app open — this audit is read-only, so unlike the SEO audit
 * CSV this one isn't meant to be re-uploaded anywhere.
 */
export function downloadCatalogAuditCSV(rows: CatalogAuditRow[]): void {
  const headers = [
    'Product ID',
    'Título',
    'Handle',
    'Marca (Vendor)',
    'Precio Mínimo',
    'Precio Máximo',
    'SKU con Problema de Precio',
    'Descripción',
    'Problemas Detectados',
  ];

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => {
      const prices = row.variants.map((v) => v.price);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      // Separate from price on purpose: a SKU only ever appears here when
      // that specific variant has the bad price, so its mere presence in
      // this column is the "this one needs fixing" signal.
      const skuWithProblem = row.flaggedVariants.map((v) => v.sku || v.variantTitle || '(sin SKU)').join(' | ') || '—';

      return [
        row.numericId,
        row.title,
        row.handle,
        row.vendor.trim() === '' ? '(Vacía)' : row.vendor,
        minPrice,
        maxPrice,
        skuWithProblem,
        row.description.trim() === '' ? '(Sin descripción)' : 'Con descripción',
        row.messages.join(' | ') || 'Sin problemas',
      ]
        .map((val) => {
          const str = String(val ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',');
    }),
  ].join('\r\n');

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.setAttribute('download', `auditoria_catalogo_doto_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads Execution CSV report
 */
export function downloadExecutionReport(results: ExecutionResult[]): void {
  const headers = [
    'Product ID',
    'Product Title',
    'Estado',
    'URL Handle anterior',
    'URL Handle nuevo',
    'SEO Title anterior',
    'SEO Title nuevo',
    'Meta Description anterior',
    'Meta Description nueva',
    'Redirect 301',
    'Error',
    'Fecha/hora',
  ];

  const rows = results.map((r) => [
    r.productId,
    r.productTitle,
    r.status === 'success' ? 'Actualizado' : r.status === 'skipped' ? 'Sin cambios' : 'Error',
    r.previousHandle,
    r.newHandle,
    r.previousSeoTitle,
    r.newSeoTitle,
    r.previousSeoDescription,
    r.newSeoDescription,
    r.redirectCreated ? 'Creado' : r.redirectWarning ? `No creado: ${r.redirectWarning}` : '—',
    r.errorMessage || '—',
    r.processedAt,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((val) => {
          const str = String(val ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.setAttribute('download', `reporte_actualizacion_doto_seo_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads Alt Text AI Execution CSV/Excel Report
 */
export function downloadAltTextReport(items: import('../types/seo').ProductMediaItem[]): void {
  const headers = [
    'Product ID',
    'Media ID',
    'Título de Producto',
    'Posición Imagen',
    'URL Imagen',
    'Alt Text Anterior',
    'Alt Text Nuevo / Generado',
    'Estado',
    'Confianza',
    'Nivel Confianza',
    'Es Decorativa',
    'Proveedor IA',
  ];

  const rows = items.map((m) => [
    m.productId,
    m.mediaId || m.id,
    m.productTitle,
    m.position,
    m.imageUrl,
    m.currentAlt || '—',
    m.generatedAlt || (m.isDecorative ? '(Decorativa)' : '—'),
    m.status === 'updated'
      ? 'Actualizado en Shopify'
      : m.status === 'approved'
      ? 'Aprobado'
      : m.status === 'pending'
      ? 'Pendiente'
      : m.status === 'rejected'
      ? 'Rechazado'
      : m.status === 'decorative'
      ? 'Decorativa'
      : 'Error',
    m.confidence ? `${Math.round(m.confidence * 100)}%` : '—',
    m.confidenceLevel || '—',
    m.isDecorative ? 'Sí' : 'No',
    m.provider === 'claude'
      ? 'Claude Sonnet 5'
      : m.provider === 'qwen2vl'
      ? 'Qwen2-VL (Ollama)'
      : m.provider === 'gemini'
      ? 'Google Gemini'
      : m.provider === 'openai'
      ? 'ChatGPT (gpt-5.6-terra)'
      : m.provider === 'deepseek'
      ? 'DeepSeek (V4.1 Flash)'
      : 'IA Local',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row
        .map((val) => {
          const str = String(val ?? '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  link.setAttribute('download', `reporte_alt_text_doto_seo_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads Alt Text Template CSV
 */
export function downloadAltTextTemplateCsv(): void {
  const headers = ['Product ID', 'Media ID', 'Alt Text'];
  const sampleRows = [
    ['1234567890123', '90102', 'Smartphone Samsung Galaxy S25 Ultra negro visto desde la parte posterior mostrando modulo de camara'],
    ['9876543210987', '', 'Apple iPhone 16 Pro Max en acabado titanio natural mostrando borde lateral y boton de camara'],
  ];

  const csvContent = [
    headers.join(','),
    ...sampleRows.map((r) => r.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')),
  ].join('\r\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'plantilla_alt_text_doto_seo.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
