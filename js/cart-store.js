/* =========================================================
   TAMALES DON RAMÓN — Store Global del Carrito (Pub/Sub + localStorage)
   - localStorage guarda SOLO {productoId, presentacion, cantidad}.
     Precios, nombres e imágenes se leen siempre del catálogo (productos.js).
   - El stock se valida sumando las unidades de TODAS las presentaciones
     (piezas + docenas) del mismo producto.
   - Los precios incluyen IVA 16%. El envío también (el IVA se desglosa del total).
   ========================================================= */
(function () {
  'use strict';

  const STORAGE_KEY = 'tdr_carrito_v2';
  const ENVIO_BASE = 15;           // MXN, IVA incluido
  const UMBRAL_ENVIO_GRATIS = 150; // envío gratis si productos > $150
  const TASA_IVA = 0.16;
  const MAX_POR_LINEA = 99;

  const redondear = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const catalogo = () => window.CATALOGO_DON_RAMON || [];
  const buscarProducto = (id) => catalogo().find((p) => p.id === id);
  const keyDe = (id, pres) => `${id}__${pres}`;
  const unidadesDe = (prod, pres) => prod?.presentaciones?.[pres]?.unidades || 0;

  function cargarDesdeStorage() {
    try {
      localStorage.removeItem('tdr_carrito_v1'); // formato anterior
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((i) => i && Number.isInteger(i.cantidad) && i.cantidad > 0 && unidadesDe(buscarProducto(i.productoId), i.presentacion) > 0)
        .map((i) => ({ productoId: i.productoId, presentacion: i.presentacion, cantidad: Math.min(i.cantidad, MAX_POR_LINEA) }));
    } catch (e) {
      return [];
    }
  }

  let items = cargarDesdeStorage();
  const listeners = new Set();

  function guardarEnStorage() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch (e) { console.warn('No se pudo guardar el carrito:', e); }
  }

  function emitir() {
    const snapshot = obtenerResumen();
    listeners.forEach((fn) => fn(snapshot));
  }

  function notificar() {
    guardarEnStorage();
    emitir();
  }

  // Sincroniza el carrito entre pestañas abiertas
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) { items = cargarDesdeStorage(); emitir(); }
  });

  /** Unidades (piezas) del producto ya en el carrito, opcionalmente excluyendo una línea. */
  function unidadesEnCarrito(productoId, excluirKey) {
    const prod = buscarProducto(productoId);
    return items
      .filter((i) => i.productoId === productoId && i.key !== excluirKey && keyDe(i.productoId, i.presentacion) !== excluirKey)
      .reduce((acc, i) => acc + i.cantidad * unidadesDe(prod, i.presentacion), 0);
  }

  function agregarItem(productoId, presentacion = 'pieza', cantidad = 1) {
    const prod = buscarProducto(productoId);
    const unidades = unidadesDe(prod, presentacion);
    if (!prod || !unidades || !Number.isInteger(cantidad) || cantidad < 1) {
      return { ok: false, mensaje: 'Producto no disponible.' };
    }

    const key = keyDe(productoId, presentacion);
    const existente = items.find((i) => keyDe(i.productoId, i.presentacion) === key);
    const nuevaCantidad = (existente ? existente.cantidad : 0) + cantidad;

    if (nuevaCantidad > MAX_POR_LINEA) {
      return { ok: false, mensaje: `Máximo ${MAX_POR_LINEA} por producto. Para pedidos grandes escríbenos por WhatsApp.` };
    }
    if (unidadesEnCarrito(productoId, key) + nuevaCantidad * unidades > prod.stock) {
      return { ok: false, mensaje: `Stock insuficiente de ${prod.nombre}.` };
    }

    if (existente) existente.cantidad = nuevaCantidad;
    else items.push({ productoId, presentacion, cantidad });

    notificar();
    return { ok: true, mensaje: `Agregado: ${prod.nombre} (${prod.presentaciones[presentacion].etiqueta})` };
  }

  function actualizarCantidad(key, delta) {
    const idx = items.findIndex((i) => keyDe(i.productoId, i.presentacion) === key);
    if (idx === -1) return { ok: false, mensaje: 'Producto no encontrado.' };

    const item = items[idx];
    const prod = buscarProducto(item.productoId);
    const nueva = item.cantidad + delta;

    if (nueva <= 0) {
      items.splice(idx, 1);
      notificar();
      return { ok: true };
    }
    if (nueva > MAX_POR_LINEA) return { ok: false, mensaje: `Máximo ${MAX_POR_LINEA} por producto.` };
    if (unidadesEnCarrito(item.productoId, key) + nueva * unidadesDe(prod, item.presentacion) > prod.stock) {
      return { ok: false, mensaje: 'Alcanzaste el límite de stock disponible.' };
    }

    item.cantidad = nueva;
    notificar();
    return { ok: true };
  }

  function eliminarItem(key) {
    items = items.filter((i) => keyDe(i.productoId, i.presentacion) !== key);
    notificar();
  }

  function vaciarCarrito() {
    items = [];
    notificar();
  }

  /**
   * Calcula montos en MXN (referencia visual; el servidor recalcula todo).
   * Los precios ya incluyen IVA: base = total / 1.16, IVA = total - base.
   */
  function obtenerResumen(tipoEntrega = 'domicilio') {
    const detalle = items.map((i) => {
      const prod = buscarProducto(i.productoId);
      const pres = prod.presentaciones[i.presentacion];
      return {
        key: keyDe(i.productoId, i.presentacion),
        productoId: i.productoId,
        nombre: prod.nombre,
        emoji: prod.emoji,
        imagen: prod.imagen,
        presentacion: i.presentacion,
        etiquetaPresentacion: pres.etiqueta,
        precioUnitario: pres.precio,
        cantidad: i.cantidad
      };
    });

    const totalArticulos = detalle.reduce((a, i) => a + i.cantidad, 0);
    const subtotalConIva = redondear(detalle.reduce((a, i) => a + i.precioUnitario * i.cantidad, 0));

    let costoEnvio = 0;
    if (subtotalConIva > 0 && tipoEntrega === 'domicilio') {
      costoEnvio = subtotalConIva > UMBRAL_ENVIO_GRATIS ? 0 : ENVIO_BASE;
    }

    const total = redondear(subtotalConIva + costoEnvio);
    const baseSinIva = redondear(total / (1 + TASA_IVA));
    const ivaDesglosado = redondear(total - baseSinIva);
    const faltanteEnvioGratis = subtotalConIva > UMBRAL_ENVIO_GRATIS ? 0 : redondear(UMBRAL_ENVIO_GRATIS + 0.01 - subtotalConIva);

    return { items: detalle, totalArticulos, subtotalConIva, baseSinIva, ivaDesglosado, costoEnvio, total, faltanteEnvioGratis };
  }

  function suscribir(callback) {
    listeners.add(callback);
    callback(obtenerResumen());
    return () => listeners.delete(callback);
  }

  function formatearMXN(monto) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(monto);
  }

  window.CartStore = { agregarItem, actualizarCantidad, eliminarItem, vaciarCarrito, obtenerResumen, suscribir, formatearMXN, ENVIO_BASE, UMBRAL_ENVIO_GRATIS };
})();
