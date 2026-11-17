/* =========================================================
   TAMALES DON RAMÓN — Backend mínimo (Express + Mercado Pago)
   - Recalcula precios, IVA y envío desde el catálogo (nunca confía en el cliente)
   - Crea pedidos (MP / SPEI con comprobante / contra entrega)
   - Webhook de Mercado Pago con verificación de firma y de monto
   - Sirve el sitio estático (solo html/css/js/assets, nunca /server)
   ========================================================= */
'use strict';

const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ES_HTTPS = PUBLIC_URL.startsWith('https://');
const SITE_DIR = path.join(__dirname, '..');

/* ---------- Catálogo: misma fuente de verdad que el frontend (js/productos.js) ---------- */
function cargarCatalogo() {
  const ruta = process.env.CATALOGO_PATH || path.join(SITE_DIR, 'js', 'productos.js');
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(ruta, 'utf8'), sandbox, { timeout: 1000 });
  const cat = sandbox.window.CATALOGO_DON_RAMON;
  if (!Array.isArray(cat) || !cat.length) throw new Error('Catálogo vacío o inválido: ' + ruta);
  return new Map(cat.map((p) => [p.id, p]));
}
const CATALOGO = cargarCatalogo();

const ENVIO_BASE = 15;
const UMBRAL_ENVIO_GRATIS = 150;
const TASA_IVA = 0.16;
const redondear = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ---------- Persistencia simple en JSON (para producción usa una base de datos) ---------- */
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const COMP_DIR = path.join(DATA_DIR, 'comprobantes');
fs.mkdirSync(COMP_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'pedidos.json');
let pedidos = {};
try { if (fs.existsSync(DB_FILE)) pedidos = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
catch (e) { console.error('No se pudo leer pedidos.json:', e); process.exit(1); }

function guardar() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pedidos, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

/* ---------- Mercado Pago ---------- */
const mpClient = process.env.MP_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN, options: { timeout: 10000 } })
  : null;
if (!mpClient) console.warn('⚠️  MP_ACCESS_TOKEN no configurado: el pago con Mercado Pago estará deshabilitado.');

/* ---------- Utilidades ---------- */
function generarFolio() {
  const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' })
    .format(new Date()).replace(/-/g, '').slice(2); // yymmdd en hora de México
  return `TDR-${fecha}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}
const limpiar = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z\d]{2}[A\d]$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida la orden del cliente y recalcula montos desde el catálogo. */
function procesarOrden(datos) {
  if (!datos || typeof datos !== 'object') return { error: 'Orden inválida.' };

  const cliente = {
    nombre: limpiar(datos.cliente?.nombre, 100),
    email: limpiar(datos.cliente?.email, 120).toLowerCase(),
    telefono: String(datos.cliente?.telefono ?? '').replace(/\D/g, '')
  };
  if (cliente.nombre.length < 3) return { error: 'Ingresa tu nombre completo.' };
  if (!EMAIL_REGEX.test(cliente.email)) return { error: 'Correo electrónico inválido.' };
  if (!/^\d{10}$/.test(cliente.telefono)) return { error: 'El teléfono debe tener 10 dígitos.' };

  const tipo = datos.entrega?.tipo;
  if (!['domicilio', 'tienda'].includes(tipo)) return { error: 'Método de entrega inválido.' };
  const entrega = { tipo, calle: '', colonia: '', cp: '', referencias: limpiar(datos.entrega?.referencias, 200) };
  if (tipo === 'domicilio') {
    entrega.calle = limpiar(datos.entrega?.calle, 150);
    entrega.colonia = limpiar(datos.entrega?.colonia, 100);
    entrega.cp = limpiar(datos.entrega?.cp, 5);
    if (entrega.calle.length < 4 || entrega.colonia.length < 3 || !/^\d{5}$/.test(entrega.cp)) {
      return { error: 'Completa calle, colonia y código postal (5 dígitos).' };
    }
  }

  let facturacion = null;
  if (datos.facturacion) {
    facturacion = {
      rfc: limpiar(datos.facturacion.rfc, 13).toUpperCase(),
      razonSocial: limpiar(datos.facturacion.razonSocial, 150),
      regimen: limpiar(datos.facturacion.regimen, 3),
      usoCfdi: limpiar(datos.facturacion.usoCfdi, 3),
      cpFiscal: limpiar(datos.facturacion.cpFiscal, 5)
    };
    if (!RFC_REGEX.test(facturacion.rfc) || facturacion.razonSocial.length < 3) return { error: 'Datos de facturación inválidos.' };
    if (!/^\d{5}$/.test(facturacion.cpFiscal)) return { error: 'El código postal fiscal debe tener 5 dígitos.' };
  }

  const metodoPago = datos.metodoPago;
  if (!['mercadopago', 'spei', 'efectivo'].includes(metodoPago)) return { error: 'Método de pago inválido.' };

  // Líneas: se fusionan duplicados y se valida stock sumando piezas + docenas
  if (!Array.isArray(datos.items) || datos.items.length < 1 || datos.items.length > 30) return { error: 'El carrito está vacío.' };
  const lineas = new Map();
  for (const it of datos.items) {
    const prod = CATALOGO.get(it?.productoId);
    const pres = prod?.presentaciones?.[it?.presentacion];
    const cant = Number(it?.cantidad);
    if (!prod || !pres || !Number.isInteger(cant) || cant < 1 || cant > 99) return { error: 'Hay un producto inválido en tu carrito.' };
    const key = `${prod.id}__${it.presentacion}`;
    const previa = lineas.get(key);
    const cantidad = (previa?.cantidad || 0) + cant;
    if (cantidad > 99) return { error: 'Cantidad máxima excedida.' };
    lineas.set(key, { productoId: prod.id, nombre: prod.nombre, presentacion: it.presentacion, etiquetaPresentacion: pres.etiqueta, precioUnitario: pres.precio, unidades: pres.unidades, cantidad });
  }
  const unidadesPorProducto = {};
  for (const l of lineas.values()) unidadesPorProducto[l.productoId] = (unidadesPorProducto[l.productoId] || 0) + l.cantidad * l.unidades;
  for (const [id, u] of Object.entries(unidadesPorProducto)) {
    if (u > CATALOGO.get(id).stock) return { error: `Stock insuficiente de ${CATALOGO.get(id).nombre}.` };
  }

  const items = [...lineas.values()].map(({ unidades, ...resto }) => resto);
  const subtotalConIva = redondear(items.reduce((a, i) => a + i.precioUnitario * i.cantidad, 0));
  const costoEnvio = tipo === 'domicilio' && subtotalConIva <= UMBRAL_ENVIO_GRATIS ? ENVIO_BASE : 0;
  const total = redondear(subtotalConIva + costoEnvio);
  const baseSinIva = redondear(total / (1 + TASA_IVA));
  const resumen = { items, subtotalConIva, costoEnvio, total, baseSinIva, ivaDesglosado: redondear(total - baseSinIva) };

  return { cliente, entrega, facturacion, metodoPago, efectivoCon: limpiar(datos.efectivoCon, 60), resumen };
}

/** Vista pública mínima de un pedido (sin datos personales sensibles). */
function vistaPublica(p) {
  return {
    folio: p.folio, status: p.status, metodoPago: p.metodoPago, creado: p.creado,
    clienteNombre: p.cliente.nombre.split(' ')[0],
    entregaTipo: p.entrega.tipo, requiereFactura: Boolean(p.facturacion), resumen: p.resumen
  };
}

/* ---------- Sincronización de pagos con Mercado Pago ---------- */
const MAPA_ESTADOS = { approved: 'approved', authorized: 'in_process', in_process: 'in_process', pending: 'pending', rejected: 'rejected', cancelled: 'cancelled', refunded: 'refunded', charged_back: 'refunded' };

async function sincronizarPago(paymentId) {
  if (!mpClient) return null;
  const pago = await new Payment(mpClient).get({ id: paymentId });
  const pedido = pedidos[pago.external_reference];
  if (!pedido || pedido.metodoPago !== 'mercadopago') return null;

  // Verifica que lo cobrado coincida con lo que el servidor calculó
  if (redondear(Number(pago.transaction_amount)) !== pedido.resumen.total) {
    pedido.alerta = `Monto de pago (${pago.transaction_amount}) distinto al total (${pedido.resumen.total})`;
    guardar();
    console.error(`[${pedido.folio}] ${pedido.alerta}`);
    return pedido;
  }

  const nuevo = MAPA_ESTADOS[pago.status];
  if (nuevo && !(pedido.status === 'approved' && nuevo !== 'refunded')) {
    pedido.status = nuevo;
    pedido.pago = { id: String(pago.id), status: pago.status, detalle: pago.status_detail, actualizado: new Date().toISOString() };
    guardar();
    console.log(`[${pedido.folio}] pago ${pago.id} → ${nuevo}`);
  }
  return pedido;
}

function firmaWebhookValida(req) {
  const secreto = process.env.MP_WEBHOOK_SECRET;
  if (!secreto) return true; // sin secreto igual verificamos el pago contra la API de MP
  const partes = Object.fromEntries(String(req.get('x-signature') || '').split(',').map((p) => p.trim().split('=')));
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '').toLowerCase();
  const manifiesto = `id:${dataId};request-id:${req.get('x-request-id') || ''};ts:${partes.ts};`;
  const hash = crypto.createHmac('sha256', secreto).update(manifiesto).digest('hex');
  return Boolean(partes.v1) && partes.v1.length === hash.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(partes.v1));
}

/* ---------- App ---------- */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const origenes = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (origenes.length) app.use(cors({ origin: origenes }));

const limitador = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Demasiadas solicitudes. Intenta más tarde.' } });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype))
});
const FIRMAS = { 'image/jpeg': 'ffd8ff', 'image/png': '89504e47', 'application/pdf': '25504446' };
const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };

app.get('/api/config', (req, res) => {
  res.json({
    mercadopago: Boolean(mpClient),
    spei: { banco: process.env.SPEI_BANCO || '', clabe: process.env.SPEI_CLABE || '', beneficiario: process.env.SPEI_BENEFICIARIO || '' }
  });
});

app.post('/api/pedidos', limitador, (req, res, next) => {
  upload.single('comprobante')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'El comprobante no debe pasar de 5 MB.' : 'No se pudo procesar el archivo.' });
    next();
  });
}, async (req, res) => {
  try {
    let datos;
    try { datos = JSON.parse(req.body?.orden); } catch { return res.status(400).json({ error: 'Orden inválida.' }); }

    const r = procesarOrden(datos);
    if (r.error) return res.status(400).json({ error: r.error });

    const folio = generarFolio();
    const pedido = { folio, creado: new Date().toISOString(), status: 'awaiting_payment', ...r };
    let initPoint = null;

    if (r.metodoPago === 'mercadopago') {
      if (!mpClient) return res.status(503).json({ error: 'Mercado Pago no está disponible por ahora. Elige otro método de pago.' });
      const pref = await new Preference(mpClient).create({
        body: {
          items: [
            ...r.resumen.items.map((i) => ({ id: i.productoId, title: `${i.nombre} (${i.etiquetaPresentacion})`, quantity: i.cantidad, unit_price: i.precioUnitario, currency_id: 'MXN' })),
            ...(r.resumen.costoEnvio ? [{ id: 'envio', title: 'Envío a domicilio', quantity: 1, unit_price: r.resumen.costoEnvio, currency_id: 'MXN' }] : [])
          ],
          payer: { name: r.cliente.nombre, email: r.cliente.email },
          external_reference: folio,
          statement_descriptor: 'TAMALESDONRAMON',
          back_urls: {
            success: `${PUBLIC_URL}/confirmacion.html?folio=${folio}`,
            pending: `${PUBLIC_URL}/confirmacion.html?folio=${folio}`,
            failure: `${PUBLIC_URL}/checkout.html?status=failure`
          },
          // MP exige URLs https públicas para auto_return y notification_url
          ...(ES_HTTPS ? { auto_return: 'approved', notification_url: `${PUBLIC_URL}/api/webhook/mercadopago` } : {})
        }
      });
      pedido.preferenciaId = pref.id;
      initPoint = pref.init_point;
    } else if (r.metodoPago === 'spei') {
      const f = req.file;
      if (!f || !f.buffer.subarray(0, 4).toString('hex').startsWith(FIRMAS[f.mimetype])) {
        return res.status(400).json({ error: 'Adjunta un comprobante válido (JPG, PNG o PDF, máx. 5 MB).' });
      }
      pedido.comprobante = `${folio}${EXT[f.mimetype]}`;
      fs.writeFileSync(path.join(COMP_DIR, pedido.comprobante), f.buffer);
      pedido.status = 'pending'; // pendiente de validar la transferencia
    } else {
      pedido.status = 'cod'; // pago contra entrega
    }

    pedidos[folio] = pedido;
    guardar();
    console.log(`🫔 Nuevo pedido ${folio} · ${r.metodoPago} · $${r.resumen.total} · ${r.cliente.nombre} (${r.cliente.telefono})`);
    res.status(201).json({ folio, status: pedido.status, init_point: initPoint });
  } catch (e) {
    console.error('Error creando pedido:', e?.message || e);
    res.status(502).json({ error: 'No pudimos procesar tu pedido. Intenta de nuevo o pide por WhatsApp.' });
  }
});

// Estado del pedido. Si regresa de MP con payment_id, se verifica directo con MP (no se confía en la URL).
app.get('/api/pedidos/:folio', limitador, async (req, res) => {
  const pedido = pedidos[req.params.folio];
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const paymentId = String(req.query.payment_id || '').replace(/\D/g, '');
  if (paymentId && pedido.metodoPago === 'mercadopago' && pedido.status !== 'approved') {
    try { await sincronizarPago(paymentId); } catch (e) { console.error('Verificación de pago:', e?.message || e); }
  }
  res.json(vistaPublica(pedido));
});

app.post('/api/webhook/mercadopago', express.json(), async (req, res) => {
  if (!firmaWebhookValida(req)) return res.sendStatus(401);
  const tipo = req.query.type || req.query.topic || req.body?.type;
  const id = req.query['data.id'] || req.query.id || req.body?.data?.id;
  if (tipo !== 'payment' || !id) return res.sendStatus(200);
  try {
    await sincronizarPago(String(id));
    res.sendStatus(200);
  } catch (e) {
    console.error('Webhook MP:', e?.message || e);
    res.sendStatus(500); // MP reintentará
  }
});

/* ---------- Administración mínima (requiere ADMIN_KEY) ---------- */
function admin(req, res, next) {
  const clave = process.env.ADMIN_KEY;
  if (!clave) return res.sendStatus(404);
  const dada = Buffer.from(String(req.get('x-admin-key') || ''));
  const real = Buffer.from(clave);
  if (dada.length !== real.length || !crypto.timingSafeEqual(dada, real)) return res.sendStatus(401);
  next();
}
app.get('/api/admin/pedidos', admin, (req, res) => res.json(Object.values(pedidos).sort((a, b) => b.creado.localeCompare(a.creado))));
app.get('/api/admin/pedidos/:folio/comprobante', admin, (req, res) => {
  const p = pedidos[req.params.folio];
  if (!p?.comprobante) return res.sendStatus(404);
  res.sendFile(path.join(COMP_DIR, p.comprobante));
});
app.patch('/api/admin/pedidos/:folio', admin, express.json(), (req, res) => {
  const p = pedidos[req.params.folio];
  const permitidos = ['approved', 'pending', 'cod', 'rejected', 'cancelled'];
  if (!p || !permitidos.includes(req.body?.status)) return res.sendStatus(400);
  p.status = req.body.status;
  guardar();
  res.json(vistaPublica(p));
});

/* ---------- Sitio estático (lista blanca: nunca se expone /server ni .env) ---------- */
['css', 'js', 'assets'].forEach((d) => app.use('/' + d, express.static(path.join(SITE_DIR, d), { dotfiles: 'ignore' })));
app.get('/', (req, res) => res.sendFile(path.join(SITE_DIR, 'index.html')));
app.get(/^\/[a-z-]+\.html$/, (req, res) => {
  const archivo = path.join(SITE_DIR, req.path);
  fs.existsSync(archivo) ? res.sendFile(archivo) : res.sendStatus(404);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));
app.listen(PORT, () => console.log(`🫔 Tamales Don Ramón en ${PUBLIC_URL} (puerto ${PORT})`));
