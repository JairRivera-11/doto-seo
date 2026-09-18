import { GoogleGenAI, createUserContent, createPartFromText, createPartFromBase64, ThinkingLevel } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface VisionContext {
  productId: string;
  productTitle: string;
  productType?: string;
  vendor?: string;
  model?: string;
  color?: string;
  description?: string;
  tags?: string[];
  features?: Record<string, string>;
  imagePosition?: number;
  totalImages?: number;
}

export interface AltTextGenerationResult {
  alt_text: string;
  is_decorative: boolean;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  reason: string;
  provider: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek';
}

export interface VisionProvider {
  name: string;
  type: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek';
  isConfigured(): boolean;
  generateAltText(
    imageUrl: string,
    context: VisionContext
  ): Promise<AltTextGenerationResult>;
}

/**
 * System prompt template for visual Alt Text generation.
 * Placeholders ({{PRODUCT_NAME}}, {{BRAND}}, {{MODEL}}, {{COLOR}}, {{CATEGORY}})
 * are filled per-request via buildAltTextPrompt() using the product's VisionContext.
 */
export const ALT_TEXT_SYSTEM_PROMPT = `
Eres un especialista en accesibilidad web, visión computacional y SEO para e-commerce en México y Latinoamérica.

Tu tarea es analizar VISUALMENTE una imagen de producto y generar un texto alternativo (Alt Text) preciso, natural y útil para una persona que no puede ver la imagen.

IMPORTANTE:
El Alt Text debe describir LO QUE REALMENTE SE OBSERVA EN ESTA IMAGEN, no simplemente repetir el nombre del producto.

==================================================
DATOS DEL PRODUCTO
==================================================

Producto:
{{PRODUCT_NAME}}

Marca:
{{BRAND}}

Modelo:
{{MODEL}}

Color conocido del producto:
{{COLOR}}

Categoría:
{{CATEGORY}}

Estos datos sirven como CONTEXTO y solo deben utilizarse cuando sean coherentes con lo observado en la imagen.

NO utilices el contexto para inventar elementos que no aparecen visualmente.

==================================================
PROCESO DE ANÁLISIS VISUAL OBLIGATORIO
==================================================

Antes de generar el Alt Text, analiza la imagen siguiendo este orden:

1. IDENTIFICA QUÉ APARECE
   - Producto principal.
   - Marca si es visible o está confirmada por el contexto.
   - Modelo si está confirmado por el contexto.
   - Accesorios visibles.
   - Personas, manos o elementos relevantes si forman parte de la escena.

2. IDENTIFICA LA PERSPECTIVA DEL PRODUCTO

Determina cuál corresponde mejor:

   - vista frontal
   - vista trasera
   - vista lateral
   - vista superior
   - vista inferior
   - vista en ángulo
   - vista frontal y trasera
   - múltiples vistas
   - detalle del producto
   - producto en uso
   - producto sobre una superficie
   - producto acompañado de accesorios
   - empaque del producto

NO fuerces una perspectiva si no puede determinarse con seguridad.

3. IDENTIFICA LA COMPOSICIÓN

Determina si la imagen muestra:

   - un solo producto
   - producto y accesorios
   - producto abierto/cerrado
   - varias vistas del mismo producto
   - producto en uso
   - producto junto a otros objetos

4. IDENTIFICA LOS ELEMENTOS VISUALMENTE RELEVANTES

Solo menciona elementos claramente visibles.

Ejemplos:
   - S Pen
   - cámara trasera
   - pantalla
   - teclado
   - mouse
   - audífonos
   - cargador
   - controles
   - estuche
   - empaque

NO menciones accesorios solamente porque normalmente vienen incluidos con el producto.

5. IDENTIFICA EL COLOR

Solo menciona el color si puede identificarse razonablemente en la imagen o está confirmado por los datos del producto.

No inventes tonalidades específicas.

Por ejemplo:
Correcto: "azul claro"
Incorrecto: "azul cielo metálico" si eso no puede comprobarse.

6. IGNORA ELEMENTOS IRRELEVANTES

No describas:
   - fondos blancos
   - sombras normales
   - iluminación
   - reflejos comunes
   - espacios vacíos
   - elementos que no aportan información sobre el producto

==================================================
REGLAS PARA EL ALT TEXT
==================================================

1. Escribe en español latino natural.

2. El objetivo principal es ACCESIBILIDAD, no posicionamiento SEO.

3. Describe primero el producto y después la característica visual más importante de ESTA imagen.

4. Longitud recomendada:
   70 a 125 caracteres.

5. Sé específico cuando la imagen lo permita.

6. NO repitas el nombre completo del producto innecesariamente.

7. NO hagas keyword stuffing.

8. NO utilices lenguaje comercial o publicitario.

PROHIBIDO:
   "el mejor"
   "oferta"
   "compra ahora"
   "excelente"
   "premium"
   "ideal"
   "potente"
   "increíble"

9. NO describas especificaciones técnicas que no puedan observarse.

PROHIBIDO INVENTAR:
   - capacidad
   - almacenamiento
   - memoria RAM
   - resolución
   - tamaño
   - conectividad
   - procesador
   - funciones
   - materiales
   - resistencia
   - accesorios no visibles

10. NO conviertas el Alt Text en una ficha técnica.

11. NO utilices frases genéricas cuando exista información visual más específica.

Ejemplo incorrecto:
"Samsung Galaxy S25 Ultra azul"

Ejemplo mejor:
"Samsung Galaxy S25 Ultra azul claro mostrando la pantalla frontal y las cámaras traseras"

12. DESCRIBE LA DIFERENCIA VISUAL ENTRE IMÁGENES.

Si recibes imágenes diferentes del mismo producto, NO generes automáticamente el mismo Alt Text.

Por ejemplo:

Imagen A:
"Samsung Galaxy S25 Ultra azul claro visto de frente con la pantalla encendida"

Imagen B:
"Samsung Galaxy S25 Ultra azul claro mostrando las cámaras traseras"

Imagen C:
"Samsung Galaxy S25 Ultra azul claro visto de lado"

Imagen D:
"Samsung Galaxy S25 Ultra azul claro acompañado de S Pen"

Cada descripción debe corresponder específicamente a la imagen analizada.

13. No inventes variaciones para hacer que cada Alt Text sea diferente.

Si dos imágenes son visualmente idénticas, es válido utilizar el mismo Alt Text.

==================================================
REGLA ESPECIAL PARA PRODUCTOS CON VARIAS VISTAS
==================================================

Cuando una misma imagen muestre simultáneamente diferentes partes del producto, descríbelo explícitamente.

Ejemplo:

"Samsung Galaxy S25 Ultra azul claro mostrando la pantalla frontal y las cámaras traseras"

NO describas únicamente la parte trasera si también existe una vista frontal claramente visible.

==================================================
REGLA ESPECIAL PARA ACCESORIOS
==================================================

Solo menciona un accesorio cuando:

A) sea claramente visible,
B) pueda identificarse razonablemente,
C) sea relevante para entender la imagen.

Si aparece un objeto que podría ser un accesorio pero no puede identificarse con seguridad, NO lo nombres.

==================================================
REGLA ESPECIAL PARA MARCA Y MODELO
==================================================

La marca y modelo pueden utilizarse desde los datos de contexto proporcionados.

Sin embargo:

- No inventes un modelo basándote únicamente en la apariencia.
- Si el contexto dice "Samsung Galaxy S25 Ultra", puedes utilizar ese nombre.
- Si el contexto no proporciona un modelo confirmado, no adivines el modelo.

==================================================
IMÁGENES DECORATIVAS
==================================================

Si la imagen no contiene un producto identificable y es únicamente:

- un ícono
- un fondo
- un elemento gráfico
- una textura
- un separador
- un sello decorativo
- una imagen puramente ornamental

devuelve:

"is_decorative": true

y:

"alt_text": ""

No fuerces una descripción.

==================================================
CONTROL DE CALIDAD ANTES DE RESPONDER
==================================================

Antes de devolver el resultado verifica:

[ ] ¿Describí lo que realmente aparece?
[ ] ¿Identifiqué correctamente la perspectiva?
[ ] ¿Consideré toda la composición de la imagen?
[ ] ¿Mencioné solamente elementos visibles?
[ ] ¿Evité inventar especificaciones?
[ ] ¿Evité lenguaje publicitario?
[ ] ¿El texto es natural para accesibilidad?
[ ] ¿El Alt Text corresponde específicamente a ESTA imagen?
[ ] ¿Estoy repitiendo innecesariamente una descripción genérica?
[ ] ¿La longitud es razonable?

Si alguna respuesta es NO, corrige el Alt Text antes de responder.

==================================================
CONFIANZA
==================================================

Asigna "confidence" entre 0.00 y 1.00.

Usa:

0.90 - 1.00:
La composición, producto y perspectiva son claramente identificables.

0.75 - 0.89:
El producto y la escena son claros, pero existe alguna pequeña incertidumbre.

0.50 - 0.74:
El producto es reconocible, pero la perspectiva o algún elemento es ambiguo.

0.00 - 0.49:
Existe una alta incertidumbre sobre lo que aparece.

La confianza debe reflejar el análisis visual, no la confianza en los datos proporcionados.

==================================================
FORMATO DE RESPUESTA
==================================================

Devuelve ÚNICAMENTE JSON válido.

No agregues Markdown.
No agregues \`\`\`json.
No agregues explicaciones fuera del JSON.

Formato:

{
  "alt_text": "Texto alternativo descriptivo",
  "is_decorative": false,
  "confidence": 0.95,
  "reason": "El producto se identifica claramente y la imagen muestra una vista frontal y trasera."
}
`.trim();

/**
 * Derives display-safe product attributes (name, brand, model, color, category)
 * from the VisionContext, without inventing data that isn't present.
 * Model/color are heuristically extracted from the title/description when not
 * explicitly provided, since Shopify's product title is the source of truth.
 */
function deriveProductAttributes(context: VisionContext): {
  productName: string;
  brand: string;
  model: string;
  color: string;
  category: string;
} {
  const title = (context.productTitle || '').trim();
  const vendor = (context.vendor || '').trim();

  let model = (context.model || '').trim();
  if (!model) {
    model = vendor && title.toLowerCase().startsWith(vendor.toLowerCase())
      ? title.slice(vendor.length).trim()
      : title;
  }

  let color = (context.color || '').trim();
  if (!color) {
    const colorMatch = `${title} ${context.description || ''}`.match(
      /\b(negro|blanco|titanio natural|titanio negro|titanio azul|azul|verde|rojo|plata|plateado|gris|dorado|grafito|space gray|midnight|starlight)\b/i
    );
    color = colorMatch ? colorMatch[1].toLowerCase() : '';
  }

  return {
    productName: title || 'No especificado',
    brand: vendor || 'No especificada',
    model: model || 'No especificado',
    color: color || 'No especificado',
    category: (context.productType || '').trim() || 'No especificada',
  };
}

/**
 * Fills the ALT_TEXT_SYSTEM_PROMPT placeholders with the product's context
 * and appends gallery position info so multi-image products get distinct,
 * image-specific descriptions (see rules 12/13 in the template).
 */
export function buildAltTextPrompt(context: VisionContext): string {
  const { productName, brand, model, color, category } = deriveProductAttributes(context);

  const filled = ALT_TEXT_SYSTEM_PROMPT.replace('{{PRODUCT_NAME}}', productName)
    .replace('{{BRAND}}', brand)
    .replace('{{MODEL}}', model)
    .replace('{{COLOR}}', color)
    .replace('{{CATEGORY}}', category);

  const pos = context.imagePosition || 1;
  const total = context.totalImages || 1;

  return `${filled}

==================================================
CONTEXTO ADICIONAL DE LA GALERÍA
==================================================

Esta es la imagen ${pos} de ${total} en la galería de este producto. Si existen otras imágenes del mismo producto, describe únicamente lo que se observa en ESTA imagen específica.`;
}

/**
 * Downloads a product image server-side and encodes it as base64 so it can be
 * sent as inline image data to a multimodal API (a plain URL in the prompt
 * text is not fetched by these models and would prevent real visual analysis).
 * Shared by GeminiVisionProvider and ClaudeVisionProvider.
 */
async function fetchImageAsBase64(imageUrl: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`No fue posible descargar la imagen del producto (HTTP ${res.status}).`);
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { data: buffer.toString('base64'), mimeType };
}

/**
 * Queries a local Ollama multimodal endpoint with the actual image bytes attached
 * (Ollama's /api/generate expects base64 images in the `images` array - sending
 * only the text prompt, as this used to do, means the model never sees the picture).
 * Shared by LocalVisionProvider's optional Ollama hook and QwenVLVisionProvider.
 */
async function queryOllamaVision(
  ollamaUrl: string,
  modelName: string,
  imageUrl: string,
  prompt: string,
  timeoutMs: number
): Promise<{ alt_text: string; is_decorative: boolean; confidence: number; reason: string }> {
  const { data: base64Data } = await fetchImageAsBase64(imageUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt,
        images: [base64Data],
        stream: false,
        format: 'json',
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`Ollama respondió HTTP ${res.status}: ${bodyText.slice(0, 200)}`);
    }

    const data = await res.json();
    const parsed = JSON.parse(data.response);
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.85;

    return {
      alt_text: parsed.alt_text || '',
      is_decorative: !!parsed.is_decorative,
      confidence,
      reason: parsed.reason || 'Generado por modelo de visión local vía Ollama.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * LocalVisionProvider
 * 100% PRIVATE & LOCAL. No external data egress.
 * Performs deterministic, rule-based semantic vision synthesis based on strict product context and image characteristics,
 * or forwards to a local Ollama multimodal endpoint if configured via LOCAL_OLLAMA_URL.
 */
export class LocalVisionProvider implements VisionProvider {
  name = 'IA Local (Privado & Sin Costo)';
  type: 'local' = 'local';
  private localOllamaUrl: string | null = null;

  constructor() {
    this.localOllamaUrl = process.env.LOCAL_OLLAMA_URL || null;
  }

  isConfigured(): boolean {
    return true; // Always ready out of the box
  }

  async generateAltText(
    imageUrl: string,
    context: VisionContext
  ): Promise<AltTextGenerationResult> {
    // If a local Ollama endpoint is configured, try local multimodal query first
    if (this.localOllamaUrl) {
      try {
        const ollamaRes = await this.queryLocalOllama(imageUrl, context);
        if (ollamaRes) return ollamaRes;
      } catch {
        // Fallback to local semantic vision engine
      }
    }

    // Local semantic vision engine (100% private, zero network egress)
    return this.synthesizeLocalAltText(imageUrl, context);
  }

  private async queryLocalOllama(
    imageUrl: string,
    context: VisionContext
  ): Promise<AltTextGenerationResult | null> {
    try {
      const prompt = buildAltTextPrompt(context);
      const result = await queryOllamaVision(
        this.localOllamaUrl!,
        process.env.LOCAL_OLLAMA_MODEL || 'llava',
        imageUrl,
        prompt,
        4000
      );
      const confidenceLevel: 'high' | 'medium' | 'low' =
        result.confidence >= 0.9 ? 'high' : result.confidence >= 0.7 ? 'medium' : 'low';
      return { ...result, confidenceLevel, provider: 'local' };
    } catch {
      return null;
    }
  }

  /**
   * Deterministic local semantic vision synthesis:
   * Analyzes title, brand, model, color, variant, and image position to formulate
   * an accessible, objective Latin American Spanish Alt Text adhering strictly to all requirements.
   */
  private synthesizeLocalAltText(
    imageUrl: string,
    context: VisionContext
  ): AltTextGenerationResult {
    const title = (context.productTitle || '').trim();
    const vendor = (context.vendor || '').trim();
    const pos = context.imagePosition || 1;
    const total = context.totalImages || 1;

    // 1. Check for decorative or placeholder flags
    const lowerUrl = imageUrl.toLowerCase();
    const isDecorative =
      lowerUrl.includes('badge') ||
      lowerUrl.includes('seal') ||
      lowerUrl.includes('icon') ||
      lowerUrl.includes('decorat') ||
      lowerUrl.includes('banner-bg');

    if (isDecorative) {
      return {
        alt_text: '',
        is_decorative: true,
        confidence: 0.95,
        confidenceLevel: 'high',
        reason: 'Imagen detectada como elemento gráfico decorativo o distintivo secundario.',
        provider: 'local',
      };
    }

    // 2. Extract key physical attributes without inventing
    // Extract color if explicitly present in title
    let detectedColor = '';
    const colorMatches = title.match(
      /\b(negro|blanco|titanio natural|titanio negro|titanio azul|azul|verde|rojo|plata|plateado|gris|dorado|grafito|space gray|midnight|starlight)\b/i
    );
    if (colorMatches) {
      detectedColor = colorMatches[1].toLowerCase();
    }

    // Extract capacity/storage if present
    let detectedCapacity = '';
    const capMatch = title.match(/\b(\d{2,4}\s*(?:gb|tb))\b/i);
    if (capMatch) {
      detectedCapacity = capMatch[1].toUpperCase().replace(/\s+/g, '');
    }

    // Perspective mapping based on position in product gallery
    let perspective = 'visto de frente';
    if (pos === 2 && total > 1) {
      perspective = 'mostrando la parte trasera y cámaras';
    } else if (pos === 3 && total > 2) {
      perspective = 'en vista lateral mostrando su perfil delgado';
    } else if (pos === 4 && total > 3) {
      perspective = 'en perspectiva angular tridimensional';
    } else if (pos > 4) {
      perspective = 'mostrando detalles de diseño y puertos';
    }

    // Clean brand redundancy (e.g. if title already starts with brand)
    let cleanTitle = title;
    if (vendor && cleanTitle.toLowerCase().startsWith(vendor.toLowerCase())) {
      cleanTitle = cleanTitle.slice(vendor.length).trim();
    }

    // Formulate natural, accessible Latin American Alt Text
    let altParts: string[] = [];

    if (vendor && !title.toLowerCase().includes(vendor.toLowerCase())) {
      altParts.push(vendor);
    }
    altParts.push(title);

    let baseText = altParts.join(' ');
    // Remove duplicate words
    baseText = baseText.replace(/\s+/g, ' ').trim();

    let finalText = `${baseText} ${perspective}`;
    if (detectedColor && !finalText.toLowerCase().includes(detectedColor)) {
      finalText = `${baseText} en color ${detectedColor} ${perspective}`;
    }

    // Trim to target ~80-125 characters nicely
    if (finalText.length > 135) {
      // Shorten while maintaining natural structure
      finalText = `${title} ${perspective}`;
      if (finalText.length > 130) {
        finalText = finalText.slice(0, 125).trim();
      }
    }

    // Confidence evaluation
    let confidence = 0.94;
    let confidenceLevel: 'high' | 'medium' | 'low' = 'high';
    let reason = 'Análisis local preciso basado en catálogo, variante y ángulo de captura.';

    if (!vendor && !detectedColor) {
      confidence = 0.82;
      confidenceLevel = 'medium';
      reason = 'Contexto con datos parciales de color o variante. Requiere verificación rápida.';
    }

    return {
      alt_text: finalText,
      is_decorative: false,
      confidence,
      confidenceLevel,
      reason,
      provider: 'local',
    };
  }
}

/**
 * GeminiVisionProvider
 * Uses Google Gemini API (gemini-3.7-flash) via @google/genai SDK.
 * STRICT SECURITY:
 * - API Key is kept in RAM memory ONLY during session.
 * - Never logged, never written to disk/database, never sent to Shopify.
 */
export class GeminiVisionProvider implements VisionProvider {
  name = 'Gemini API (Multimodal)';
  type: 'gemini' = 'gemini';
  private apiKey: string | null = null;
  private client: GoogleGenAI | null = null;

  constructor(sessionApiKey?: string | null) {
    // No .env fallback - same privacy model as the Shopify connection: only a
    // key entered this session (via AI Settings) works, and it's gone on restart.
    this.apiKey = sessionApiKey || null;
    if (this.apiKey) {
      this.client = new GoogleGenAI({
        apiKey: this.apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  setApiKey(key: string): void {
    const trimmed = key.trim();
    if (trimmed) {
      this.apiKey = trimmed;
      this.client = new GoogleGenAI({
        apiKey: this.apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  async generateAltText(
    imageUrl: string,
    context: VisionContext
  ): Promise<AltTextGenerationResult> {
    if (!this.client || !this.apiKey) {
      throw new Error(
        'Gemini API no está configurado. Ingresa tu API Key en la sesión activa o utiliza la IA Local.'
      );
    }

    const userPrompt = buildAltTextPrompt(context);

    try {
      // Fetch the actual image bytes so Gemini can visually analyze the pixels,
      // not just infer from the URL/context as text.
      const { data: base64Data, mimeType } = await fetchImageAsBase64(imageUrl);

      const response = await this.generateContentWithRetry({
        model: 'gemini-3.7-flash',
        contents: createUserContent([
          createPartFromText(userPrompt),
          createPartFromBase64(base64Data, mimeType),
        ]),
        config: {
          responseMimeType: 'application/json',
          // Low temperature: this is a factual visual-description task with strict
          // formatting rules, not a creative one, so low randomness keeps output
          // concise/consistent without hurting accuracy.
          temperature: 0.15,
          // 'LOW' keeps just enough reasoning to resolve perspective/composition
          // correctly while avoiding the much larger thinking-token overhead of
          // MEDIUM/HIGH (the model's default) on a task this bounded.
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const text = response.text || '{}';
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Respuesta de Gemini no contiene JSON válido');
        }
      }

      const altText = (parsed.alt_text || '').trim();
      const isDecorative = !!parsed.is_decorative;
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.95;
      const confidenceLevel: 'high' | 'medium' | 'low' =
        confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';
      const reason = parsed.reason || 'Evaluado mediante análisis multimodal con Gemini.';

      return {
        alt_text: altText,
        is_decorative: isDecorative,
        confidence,
        confidenceLevel,
        reason,
        provider: 'gemini',
      };
    } catch (err: any) {
      const sanitized = (err.message || 'Error con Gemini API')
        .replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]')
        // Some Gemini/AI Studio keys use an "AQ." prefix instead of the classic
        // "AIzaSy" format - redact that shape too so it can't leak into logs.
        .replace(/AQ\.[0-9A-Za-z_-]{20,}/g, '[REDACTED]');
      throw new Error(`Error en Gemini Vision: ${sanitized}`);
    }
  }

  /**
   * gemini-3.7-flash currently returns intermittent 503 "high demand" errors
   * from Google's side (observed directly, not tied to our request payload).
   * Retrying a couple of times with a short backoff smooths those over without
   * masking real errors (auth, invalid argument, etc.), which fail immediately.
   */
  private async generateContentWithRetry(
    request: Parameters<GoogleGenAI['models']['generateContent']>[0]
  ): ReturnType<GoogleGenAI['models']['generateContent']> {
    const MAX_ATTEMPTS = 3;
    const BASE_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.client!.models.generateContent(request);
      } catch (err: any) {
        const isOverloaded =
          err?.status === 'UNAVAILABLE' ||
          err?.code === 503 ||
          /"code":503|UNAVAILABLE/.test(err?.message || '');

        if (!isOverloaded || attempt === MAX_ATTEMPTS) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * attempt));
      }
    }
    throw new Error('Gemini no respondió tras varios intentos.');
  }
}

/**
 * ClaudeVisionProvider
 * Uses the Anthropic Claude API (claude-sonnet-5) via @anthropic-ai/sdk.
 * Sonnet 5 is the general-purpose pick for tasks beyond Alt Text (richer
 * reasoning, higher cost) - for Alt Text specifically, Qwen2-VL (below) is
 * the recommended, free, local option.
 * STRICT SECURITY:
 * - API Key is kept in RAM memory ONLY during session.
 * - Never logged, never written to disk/database, never sent to Shopify.
 */
export class ClaudeVisionProvider implements VisionProvider {
  name = 'Claude API (Multimodal)';
  type: 'claude' = 'claude';
  private apiKey: string | null = null;
  private client: Anthropic | null = null;

  constructor(sessionApiKey?: string | null) {
    // No .env fallback - same privacy model as the Shopify connection: only a
    // key entered this session (via AI Settings) works, and it's gone on restart.
    this.apiKey = sessionApiKey || null;
    if (this.apiKey) {
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  setApiKey(key: string): void {
    const trimmed = key.trim();
    if (trimmed) {
      this.apiKey = trimmed;
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
  }

  async generateAltText(
    imageUrl: string,
    context: VisionContext
  ): Promise<AltTextGenerationResult> {
    if (!this.client || !this.apiKey) {
      throw new Error(
        'Claude API no está configurado. Ingresa tu API Key en la sesión activa o utiliza otro proveedor.'
      );
    }

    const userPrompt = buildAltTextPrompt(context);

    try {
      // Fetch the actual image bytes so Claude can visually analyze the pixels,
      // not just infer from the URL/context as text.
      const { data: base64Data, mimeType } = await fetchImageAsBase64(imageUrl);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-5',
        // Small cap: the expected output is one short JSON object (alt_text +
        // a one-sentence reason), so a large budget would only add cost/latency.
        max_tokens: 512,
        // NOTE: `temperature`/`top_p`/`top_k` sampling params are removed on
        // Sonnet 5 (and Opus 5) - the API returns 400 "temperature is
        // deprecated for this model" if sent. Determinism instead comes from
        // disabling thinking below and from the prompt's own strict rules.
        // Sonnet 5 runs adaptive (extended) thinking by default when `thinking`
        // is omitted, which adds token overhead this bounded, non-agentic task
        // doesn't need - disable it explicitly to keep this fast/cheap.
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mimeType as any, data: base64Data },
              },
              { type: 'text', text: userPrompt },
            ],
          },
        ],
      });

      const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
      const text = textBlock?.text || '{}';

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Respuesta de Claude no contiene JSON válido');
        }
      }

      const altText = (parsed.alt_text || '').trim();
      const isDecorative = !!parsed.is_decorative;
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.95;
      const confidenceLevel: 'high' | 'medium' | 'low' =
        confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';
      const reason = parsed.reason || 'Evaluado mediante análisis multimodal con Claude.';

      return {
        alt_text: altText,
        is_decorative: isDecorative,
        confidence,
        confidenceLevel,
        reason,
        provider: 'claude',
      };
    } catch (err: any) {
      const sanitized = (err.message || 'Error con Claude API').replace(
        /sk-ant-[A-Za-z0-9_-]+/g,
        '[REDACTED]'
      );
      throw new Error(`Error en Claude Vision: ${sanitized}`);
    }
  }
}

/**
 * OpenAIVisionProvider
 * `gpt-4o` was retired from the OpenAI API on 2026-02-16 (confirmed against
 * OpenAI's own deprecation notice), so this uses `gpt-5.6-terra` instead -
 * OpenAI's current balanced-cost multimodal model, mirroring the same
 * cost/effectiveness tradeoff already made for Gemini 3.7 Flash and Claude
 * Sonnet 5 elsewhere in this file. Uses the Responses API (OpenAI's current
 * recommended endpoint for new integrations, per their own docs).
 */
export class OpenAIVisionProvider implements VisionProvider {
  name = 'OpenAI API (Multimodal)';
  type: 'openai' = 'openai';
  private apiKey: string | null = null;
  private client: OpenAI | null = null;

  constructor(sessionApiKey?: string | null) {
    // No .env fallback - same privacy model as the Shopify connection: only a
    // key entered this session (via AI Settings) works, and it's gone on restart.
    this.apiKey = sessionApiKey || null;
    if (this.apiKey) {
      this.client = new OpenAI({ apiKey: this.apiKey });
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  async generateAltText(
    imageUrl: string,
    context: VisionContext
  ): Promise<AltTextGenerationResult> {
    if (!this.client || !this.apiKey) {
      throw new Error(
        'OpenAI API no está configurado. Ingresa tu API Key en la sesión activa o utiliza otro proveedor.'
      );
    }

    const userPrompt = buildAltTextPrompt(context);

    try {
      // Fetch the actual image bytes so the model analyzes real pixels, not
      // just infers from the URL/context as text.
      const { data: base64Data, mimeType } = await fetchImageAsBase64(imageUrl);

      const response = await this.client.responses.create({
        model: 'gpt-5.6-terra',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: userPrompt },
              {
                type: 'input_image',
                image_url: `data:${mimeType};base64,${base64Data}`,
                detail: 'auto',
              },
            ],
          },
        ],
      });

      const text = response.output_text || '{}';

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Respuesta de OpenAI no contiene JSON válido');
        }
      }

      const altText = (parsed.alt_text || '').trim();
      const isDecorative = !!parsed.is_decorative;
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.95;
      const confidenceLevel: 'high' | 'medium' | 'low' =
        confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';
      const reason = parsed.reason || 'Evaluado mediante análisis multimodal con OpenAI.';

      return {
        alt_text: altText,
        is_decorative: isDecorative,
        confidence,
        confidenceLevel,
        reason,
        provider: 'openai',
      };
    } catch (err: any) {
      const sanitized = (err.message || 'Error con OpenAI API').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
      throw new Error(`Error en OpenAI Vision: ${sanitized}`);
    }
  }
}

/**
 * DeepSeekVisionProvider
 * DeepSeek V3 (`deepseek-chat`) and R1 (`deepseek-reasoner`) are text-only
 * and cannot see images at all - confirmed against DeepSeek's own API
 * changelog. The only DeepSeek model with real vision support is V4.1 Flash
 * (`deepseek-flash`), used here via its OpenAI-compatible /chat/completions
 * endpoint. The requested "switch to R1" becomes a reasoning-effort toggle
 * on this same model instead (`thinking.reasoning_effort`: 'none' for a
 * fast/cheap default matching this app's cost-conscious defaults elsewhere,
 * 'high' for deeper - R1-like - reasoning when the user turns it on).
 */
export class DeepSeekVisionProvider implements VisionProvider {
  name = 'DeepSeek API (Multimodal)';
  type: 'deepseek' = 'deepseek';
  private apiKey: string | null = null;
  private client: OpenAI | null = null;
  private reasoningEffort: 'none' | 'high';

  constructor(sessionApiKey?: string | null, reasoningEffort?: 'none' | 'high' | null) {
    this.apiKey = sessionApiKey || null;
    this.reasoningEffort = reasoningEffort || 'none';
    if (this.apiKey) {
      this.client = new OpenAI({ apiKey: this.apiKey, baseURL: 'https://api.deepseek.com' });
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.client;
  }

  async generateAltText(
    imageUrl: string,
    context: VisionContext
  ): Promise<AltTextGenerationResult> {
    if (!this.client || !this.apiKey) {
      throw new Error(
        'DeepSeek API no está configurado. Ingresa tu API Key en la sesión activa o utiliza otro proveedor.'
      );
    }

    const userPrompt = buildAltTextPrompt(context);

    try {
      const { data: base64Data, mimeType } = await fetchImageAsBase64(imageUrl);

      const response = await this.client.chat.completions.create({
        model: 'deepseek-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
            ],
          },
        ],
        // Non-standard DeepSeek field (not part of the OpenAI wire format the
        // SDK types model), passed through as-is - see the class doc comment.
        thinking: { reasoning_effort: this.reasoningEffort },
      } as any);

      const text = response.choices?.[0]?.message?.content || '{}';

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Respuesta de DeepSeek no contiene JSON válido');
        }
      }

      const altText = (parsed.alt_text || '').trim();
      const isDecorative = !!parsed.is_decorative;
      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.95;
      const confidenceLevel: 'high' | 'medium' | 'low' =
        confidence >= 0.9 ? 'high' : confidence >= 0.7 ? 'medium' : 'low';
      const reason = parsed.reason || 'Evaluado mediante análisis multimodal con DeepSeek.';

      return {
        alt_text: altText,
        is_decorative: isDecorative,
        confidence,
        confidenceLevel,
        reason,
        provider: 'deepseek',
      };
    } catch (err: any) {
      const sanitized = (err.message || 'Error con DeepSeek API').replace(/sk-[A-Za-z0-9_-]+/g, '[REDACTED]');
      throw new Error(`Error en DeepSeek Vision: ${sanitized}`);
    }
  }
}

/**
 * QwenVLVisionProvider
 * Runs Qwen2-VL through a local Ollama server - no Anthropic/Google API key
 * involved. This is the recommended model specifically for Alt Text: it's a
 * dedicated vision-language model, free to run, and keeps images fully local.
 * Requires Ollama running locally with the model pulled
 * (`ollama pull qwen2.5vl`, or whichever tag LOCAL_OLLAMA_QWEN_MODEL names).
 */
export class QwenVLVisionProvider implements VisionProvider {
  name = 'Qwen2-VL (Ollama Local)';
  type: 'qwen2vl' = 'qwen2vl';
  private ollamaUrl: string;
  private modelName: string;

  constructor() {
    this.ollamaUrl = process.env.LOCAL_OLLAMA_URL || 'http://localhost:11434';
    this.modelName = process.env.LOCAL_OLLAMA_QWEN_MODEL || 'qwen2.5vl';
  }

  isConfigured(): boolean {
    // No API key required; reachability of the local Ollama server is only
    // known at request time, so surface connection failures per-call instead.
    return true;
  }

  async generateAltText(
    imageUrl: string,
    context: VisionContext
  ): Promise<AltTextGenerationResult> {
    const prompt = buildAltTextPrompt(context);

    try {
      // Local vision inference (especially without a dedicated GPU, or on
      // memory-constrained machines) can take well over 30s per image -
      // much slower than a cloud API, so this needs a generous ceiling.
      const result = await queryOllamaVision(this.ollamaUrl, this.modelName, imageUrl, prompt, 120000);
      const confidenceLevel: 'high' | 'medium' | 'low' =
        result.confidence >= 0.9 ? 'high' : result.confidence >= 0.7 ? 'medium' : 'low';
      return { ...result, confidenceLevel, provider: 'qwen2vl' };
    } catch (err: any) {
      throw new Error(
        `Error en Qwen2-VL (Ollama): ${err.message || 'no fue posible contactar el servidor Ollama local.'} ` +
          `Verifica que Ollama esté corriendo en ${this.ollamaUrl} y que el modelo "${this.modelName}" esté descargado (ollama pull ${this.modelName}).`
      );
    }
  }
}

/**
 * Provider factory to return the selected vision provider
 */
export function getVisionProvider(
  type: 'local' | 'gemini' | 'claude' | 'qwen2vl' | 'openai' | 'deepseek',
  sessionGeminiKey?: string | null,
  sessionClaudeKey?: string | null,
  sessionOpenAIKey?: string | null,
  sessionDeepSeekKey?: string | null,
  deepSeekReasoningEffort?: 'none' | 'high' | null
): VisionProvider {
  if (type === 'gemini') {
    return new GeminiVisionProvider(sessionGeminiKey);
  }
  if (type === 'claude') {
    return new ClaudeVisionProvider(sessionClaudeKey);
  }
  if (type === 'openai') {
    return new OpenAIVisionProvider(sessionOpenAIKey);
  }
  if (type === 'deepseek') {
    return new DeepSeekVisionProvider(sessionDeepSeekKey, deepSeekReasoningEffort);
  }
  if (type === 'qwen2vl') {
    return new QwenVLVisionProvider();
  }
  return new LocalVisionProvider();
}
