# DOTO SEO — Shopify SEO Bulk Editor

**Doto SEO** es una aplicación web local y segura diseñada para administradores de catálogo, especialistas SEO y equipos de ecommerce. Su propósito exclusivo es auditar, editar y actualizar de forma individual y masiva la información SEO de productos en tiendas **Shopify** a través de la **Shopify Admin GraphQL API**.

---

## 1. ¿Qué es Doto SEO?
Doto SEO es una herramienta enfocada exclusivamente en optimizar tres metadatos críticos de productos:
1. **URL Handle** (slug de la URL pública del producto)
2. **SEO Title** (título para buscadores como Google)
3. **Meta Description SEO** (descripción en los resultados orgánicos)

El identificador principal es siempre el **Shopify Product ID** (ID numérico). La herramienta **NO** altera precios, inventario, imágenes, descripciones HTML, variantes ni ningún otro campo del catálogo.

---

## 2. Requisitos del Sistema
- **Node.js**: v22.13 o superior (requerido por `iron-session`, usado para la sesión cifrada)
- **npm**: v9.0 o superior (o pnpm / yarn)
- Navegador web moderno (Chrome, Edge, Firefox, Safari)
- Una tienda Shopify con acceso al panel de administración para crear una aplicación personalizada
- Un valor para `SESSION_SECRET` (ver sección 3) — sin él, el servidor no arranca

---

## 3. Instalación
Clona o descarga este repositorio en tu equipo:
```bash
cd doto-seo
npm install
```

Genera un `SESSION_SECRET` (cifra la cookie de sesión, mínimo 32 caracteres) y agrégalo a tu `.env`:
```bash
openssl rand -base64 32
```
```env
SESSION_SECRET="pega-aquí-el-valor-generado"
```

---

## 4. Cómo Ejecutar la Aplicación
Para iniciar el servidor de desarrollo local:
```bash
npm run dev
```
La aplicación estará disponible inmediatamente en tu navegador en:
```
http://localhost:3000
```

Para compilar para producción:
```bash
npm run build
npm start
```

---

## 5. Cómo Crear las Credenciales de Shopify
1. Inicia sesión en el panel de administración de tu tienda Shopify (`https://admin.shopify.com/store/TU_TIENDA`).
2. Ve a **Configuración** (icono de engranaje en la esquina inferior izquierda) → **Aplicaciones y canales de ventas**.
3. Haz clic en **Desarrollar aplicaciones**. Si es tu primera vez, haz clic en **Permitir el desarrollo de aplicaciones personalizadas**.
4. Haz clic en el botón **Crear una aplicación**. Asigna el nombre `Doto SEO`.
5. En la pestaña **Configuración**, haz clic en **Configurar** dentro de **Integración de la API del panel de control**.
6. En la lista de permisos (*Scopes*), selecciona:
   - `read_products`
   - `write_products`
   - `write_online_store_navigation` (necesario para crear automáticamente el redirect 301 cuando cambias el URL Handle de un producto — Shopify no lo genera solo cuando el handle se cambia vía API, solo cuando se cambia desde su propio panel)
7. Guarda la configuración y haz clic en **Instalar aplicación**.
8. Una vez instalada, en la sección **Token de acceso a la API del panel de control**, haz clic en **Revelar token una vez**. Copia el token que comienza con `shpat_`.

---

## 6. Permisos Requeridos
Doto SEO sigue el principio de privilegio mínimo:
- `read_products`: Para consultar el producto actual, título y valores SEO existentes.
- `write_products`: Para aplicar los cambios en `handle`, `seo.title` y `seo.description`.
- `write_online_store_navigation`: Para crear el redirect 301 automático (`/products/handle-anterior` → `/products/handle-nuevo`) cada vez que se cambia un URL Handle, tanto en edición individual como en actualización masiva. Sin este scope, la actualización del handle sigue funcionando pero el redirect fallará y quedará una URL antigua rota (404).

No se solicita ningún permiso financiero, de pedidos, clientes ni configuración de tienda.

---

## 7. Cómo Conectar la Tienda
1. Abre Doto SEO en el navegador.
2. En la pantalla inicial **Conectar Shopify**:
   - **Shopify Store**: Escribe el dominio de tu tienda (ejemplo: `doto.myshopify.com` o `mitienda.myshopify.com`).
   - **Admin API Access Token**: Pega tu token `shpat_...` (campo protegido tipo contraseña).
3. Haz clic en **Conectar Shopify**.
4. La aplicación realizará una consulta de verificación vía GraphQL a tu tienda para validar el acceso y permisos.
5. *Nota:* También puedes hacer clic en **"Probar con Catálogo de Demostración"** si deseas probar todas las funciones inmediatamente sin ingresar credenciales reales.

---

## 8. Cómo Editar un Producto Individual
1. Ve a la sección **Editar producto** en la barra lateral.
2. Escribe el **Shopify Product ID** (ejemplo: `1234567890123`).
3. Haz clic en **Buscar producto**.
4. Verás los valores actuales y tres campos editables:
   - **URL Handle**: Formato en minúsculas y guiones.
   - **SEO Title**: Con contador en tiempo real (recomendación: 50–70 caracteres).
   - **Meta Description SEO**: Con contador en tiempo real (recomendación: 120–160 caracteres).
5. Observa el **Simulador SERP de Google** en el panel derecho para ver cómo lucirá el resultado en las búsquedas.
6. Haz clic en **Guardar cambios** y confirma el cuadro de diálogo.

---

## 9. Cómo Utilizar Archivos CSV
1. Ve a **Plantillas** y haz clic en **Descargar plantilla CSV**.
2. Estructura tu archivo con las columnas:
   ```csv
   Product ID,URL Handle,SEO Title,Meta Description
   1234567890123,samsung-galaxy-s25-ultra-512gb,Samsung Galaxy S25 Ultra 512GB | Doto,Compra el nuevo Samsung Galaxy...
   ```
3. Guarda el archivo con codificación **UTF-8**.

---

## 10. Cómo Utilizar Archivos Excel (.xlsx)
1. Ve a **Plantillas** y haz clic en **Descargar plantilla Excel (.xlsx)**.
2. La plantilla incluye dos hojas:
   - **Productos**: Donde colocas los datos a modificar.
   - **Instrucciones**: Con las especificaciones y recomendaciones de longitud.
3. Puedes dejar celdas en blanco en cualquier campo que **no desees modificar**; el valor actual en Shopify se mantendrá intacto.

---

## 11. Cómo Realizar Actualizaciones Masivas
1. Ve a **Actualización masiva** en la barra lateral.
2. Arrastra o selecciona tu archivo `.csv`, `.xlsx` o `.xls`.
3. Doto SEO realizará automáticamente:
   - Detección flexible de encabezados.
   - Verificación de formato de Product IDs.
   - Detección de duplicados en el archivo.
   - Consulta por lotes en Shopify para comparar los valores actuales.
   - Validación de formato y unicidad de Handles (bloquea handles ya tomados por otros productos).
   - Modo "Solo Cambios": Si el nuevo valor es idéntico al actual, se marca como *Sin cambios* y se omite.
4. Revisa la tabla de **Vista Previa** con pestañas de filtro (Todos, Por actualizar, Advertencias, Errores, Sin cambios).
5. Haz clic en **Actualizar productos** y confirma en la ventana modal.
6. Observa la barra de progreso en vivo y las métricas de actualización.

---

## 12. Cómo Descargar Reportes
Al concluir una actualización masiva, pulsa el botón **Descargar reporte CSV**. El reporte descargado incluye:
- Product ID
- Product Title
- Estado (`Actualizado`, `Sin cambios`, `Error`)
- URL Handle anterior y nuevo
- SEO Title anterior y nuevo
- Meta Description anterior y nueva
- Detalle del error (si ocurrió alguno)
- Fecha y hora exacta

El reporte está 100% libre de credenciales o tokens.

---

## 13. Arquitectura de Seguridad y Privacidad
- **Cero almacenamiento en disco o base de datos:** No se usa Firebase, Supabase, MySQL, Postgres, MongoDB, Redis ni ningún otro store externo — ni siquiera para desplegar en Vercel.
- **Sesión en una única cookie cifrada, no en memoria del servidor:** El token de Shopify, las API Keys de IA y el resto de la sesión viven **sellados y cifrados** (AES vía `iron-session`) dentro de una cookie `httpOnly` en tu propio navegador — nunca en texto plano, nunca accesible por JavaScript ni por ningún script de terceros, y nunca en un archivo ni base de datos del servidor. El servidor descifra esa cookie en cada petición y no la recuerda entre una y otra; esto es intencional y necesario para funcionar correctamente en plataformas serverless como Vercel, donde no existe un proceso persistente que pueda "recordar" nada entre peticiones.
- **Sin `localStorage`, `sessionStorage` ni `IndexedDB`:** Ninguna credencial se guarda en almacenamiento del navegador accesible por JavaScript.
- **Credenciales de Shopify nunca viajan a la IA:** El token de acceso y el dominio de la tienda nunca se transmiten a Claude, Gemini, OpenAI, DeepSeek ni a ningún proveedor de IA. Para el módulo de Alt Text, sí se envían la imagen del producto y su contexto (título, marca, categoría, descripción) al proveedor elegido para su análisis visual (excepto con IA Local o Qwen2-VL, que corren en tu propio servidor sin salir de él).
- **Historial de sesión limitado a propósito:** Para que la cookie nunca se acerque al límite de tamaño que aceptan los navegadores (~4KB), el historial visible se limita a las últimas operaciones recientes en vez de un registro ilimitado.
- **Sanitización de logs:** Cualquier mensaje de diagnóstico o error elimina automáticamente tokens (`[REDACTED]`).

---

## 14. Confirmación de No-Almacenamiento
Al pulsar el botón **Desconectar**, la cookie de sesión se destruye de inmediato y de forma irreversible.

A diferencia de versiones anteriores de esta app, **reiniciar el servidor ya NO cierra tu sesión** — la cookie sigue viva en tu navegador (por defecto hasta 14 días, o hasta que la borres/desconectes) porque así es como Vercel necesita que funcione: no hay un proceso de servidor persistente del que depender. Si prefieres que un reinicio del servidor cierre la sesión, simplemente haz clic en **Desconectar** o borra las cookies del sitio en tu navegador.

---

## 15. Cómo Detener la Aplicación
Para cerrar la aplicación de manera segura:
1. En la barra superior, haz clic en **Desconectar** para eliminar la cookie de sesión inmediatamente (recomendado — ver sección 14).
2. En la terminal donde ejecutaste el comando, presiona:
   ```bash
   Ctrl + C
   ```
3. El proceso de Node.js finalizará. El servidor no conserva ningún dato residual — pero si no hiciste clic en **Desconectar** primero, la cookie de sesión sigue viva en tu navegador hasta que expire o la borres.

---

## 16. Cómo Desplegar en Vercel
La app está preparada para desplegarse en Vercel sin infraestructura adicional (sin base de datos, sin Redis/KV):

1. **Sube el repositorio** a GitHub/GitLab/Bitbucket y [impórtalo en Vercel](https://vercel.com/new), o usa la CLI (`vc deploy`) desde esta carpeta. Vercel detecta `server.ts` automáticamente (Express con cero configuración).
2. **Variables de entorno del proyecto** (Vercel → Settings → Environment Variables):
   - `SESSION_SECRET`: el mismo tipo de valor de la sección 3 (mínimo 32 caracteres) — genera uno distinto al de tu entorno local con `openssl rand -base64 32`.
   - `NODE_ENV`: Vercel la define como `production` automáticamente; no la agregues manualmente.
3. **Build Command**: Vercel usa el script `vercel-build` (`vite build`) automáticamente si existe en `package.json` — ya está configurado, no requiere ajuste manual.
4. **Node.js Version**: Vercel respeta el campo `engines.node` de `package.json` (`>=22.13.0`, requerido por `iron-session`); confirma en Settings → General que la versión de Function Runtime sea 22.x o superior.
5. Una vez desplegado, entra a tu URL de Vercel y conecta tu tienda normalmente (o usa el catálogo demo) — la sesión completa (Shopify + IA) queda cifrada en tu cookie, igual que en local.

**Nota sobre "Historial de sesión" en Alt Text AI:** al ser una función serverless, el listado de imágenes escaneadas para Alt Text vive únicamente en tu navegador mientras la pestaña está abierta (no en una cookie ni en el servidor, por su tamaño) — si recargas la página a mitad de un escaneo sin haber aplicado los cambios a Shopify, se pierde el progreso no guardado y debes volver a escanear. Cualquier cambio que ya hayas aplicado con **Actualizar en Shopify** es permanente y no se ve afectado.