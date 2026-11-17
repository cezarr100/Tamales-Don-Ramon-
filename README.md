# Tamales Don Ramón — Tienda con carrito, checkout y Mercado Pago

## Estructura
```
index.html, menu.html, checkout.html, confirmacion.html ...  (sitio)
css/  js/  assets/   (pon aquí tu logo e imágenes: assets/logo.png, assets/img/*.jpg)
server/              (backend Node: pedidos + Mercado Pago + webhook)
```
Los precios viven en **js/productos.js**; el backend lee ese mismo archivo (una sola fuente de verdad).

## Instalación y arranque
```bash
cd server
npm install
cp .env.example .env      # y completa los valores
npm start                 # abre http://localhost:3000
```
El servidor sirve también el sitio, así que no necesitas otro servidor para probar.

## Credenciales de Mercado Pago
1. Entra a https://www.mercadopago.com.mx/developers/panel y crea una aplicación (Checkout Pro).
2. Credenciales de **prueba**: copia el *Access Token* (TEST-...) a `MP_ACCESS_TOKEN`. El Access Token es secreto: solo vive en `server/.env`.
3. Webhooks: en tu aplicación configura la URL `https://TU-DOMINIO/api/webhook/mercadopago`, evento **Pagos**, y copia la clave secreta a `MP_WEBHOOK_SECRET`.

## Guía de prueba (flujo completo)
1. Menú → "Añadir al carrito" (prueba Pieza y Docena) → el contador del header sube.
2. Abre el carrito: cambia cantidades, elimina, vacía. Recarga: el carrito persiste.
3. "Finalizar compra" → llena el formulario (prueba factura, recoger en tienda, SPEI, efectivo).
4. **Efectivo**: confirma → ticket con estado "Pago contra entrega".
5. **SPEI**: adjunta un JPG/PNG/PDF → ticket "Pendiente de validación". Revisa en `server/data/comprobantes/`.
6. **Mercado Pago** (sandbox): se abre Checkout Pro. Usa tarjetas de prueba (verifica las vigentes en
   https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards):
   Mastercard `5474 9254 3267 0366` · Visa `4075 5957 1648 3764` · CVV `123` · vence `11/30`.
   Nombre del titular: `APRO` (aprobado), `OTHE` (rechazado), `CONT` (pendiente).
7. Al volver, `confirmacion.html` consulta al servidor, que verifica el pago directamente con Mercado Pago.

> En local el webhook no puede llegar (MP necesita https público). No hace falta para probar: al regresar,
> el servidor verifica el `payment_id` directamente. Para probar webhooks usa un túnel (ej. ngrok) y pon su URL https en `PUBLIC_URL`.

## Pedidos (administración mínima)
Con `ADMIN_KEY` definido en `.env`:
```bash
curl -H "x-admin-key: TU_CLAVE" https://TU-DOMINIO/api/admin/pedidos
curl -H "x-admin-key: TU_CLAVE" https://TU-DOMINIO/api/admin/pedidos/TDR-...../comprobante -o comp.jpg
curl -X PATCH -H "x-admin-key: TU_CLAVE" -H "Content-Type: application/json" -d '{"status":"approved"}' https://TU-DOMINIO/api/admin/pedidos/TDR-.....
```
Cada pedido nuevo también aparece en la consola del servidor.

## Despliegue y seguridad
- Usa **https** y define `PUBLIC_URL` con tu dominio real. Cambia a credenciales de producción de MP.
- Nunca subas `.env` ni `server/data/` (ya están en `.gitignore`).
- Hosting con disco efímero (ej. Render gratis) **borra** `pedidos.json` y comprobantes en cada despliegue: usa disco persistente (`DATA_DIR`) o migra a una base de datos.
- Si separas frontend y backend: pon la URL del backend en `js/config.js` y el dominio del frontend en `ALLOWED_ORIGINS`; copia `js/productos.js` junto al backend o apunta `CATALOGO_PATH`.
- El stock es un número fijo del catálogo, no un inventario real que se descuente.

## Pendientes que debes completar tú
- Datos reales: `SPEI_*` en `.env`, dirección de la sucursal (`Calle Ejemplo #123` en checkout.html y contacto.html), redes sociales, imagen `og.jpg`.
- Aviso de privacidad y términos (recoges nombre, correo, teléfono, dirección y RFC).
- Avisar al negocio de pedidos nuevos (correo/WhatsApp): hoy solo se ven en consola o en la API admin.
