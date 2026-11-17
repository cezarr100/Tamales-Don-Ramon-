/* =========================================================
   TAMALES DON RAMÓN — Confirmación de pedido
   El estado se consulta al servidor (verificado con Mercado Pago / webhook);
   los parámetros de la URL NUNCA deciden si un pedido está aprobado.
   ========================================================= */
(function () {
  'use strict';

  const cont = document.getElementById('ticket-confirmacion');
  if (!cont) return;

  const API = window.TDR_API_BASE || '';
  const params = new URLSearchParams(location.search);
  const folio = (params.get('folio') || params.get('external_reference') || '').trim();
  const paymentId = (params.get('payment_id') || params.get('collection_id') || '').replace(/\D/g, '');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const METODOS = { mercadopago: 'Mercado Pago', spei: 'Transferencia SPEI', efectivo: 'Efectivo contra entrega' };

  const ESTADOS = {
    approved: { icono: '🎉', titulo: '¡Pedido Confirmado!', badge: 'Pago Aprobado', clase: 'badge-approved', msg: 'Ya estamos preparando tus tamales calientitos.' },
    pending: { icono: '⏳', titulo: 'Pedido Registrado', badge: 'Pendiente de Validación', clase: 'badge-pending', msg: 'En cuanto validemos tu pago comenzaremos la preparación.' },
    in_process: { icono: '⏳', titulo: 'Pago en Proceso', badge: 'En Revisión', clase: 'badge-pending', msg: 'Mercado Pago está procesando tu transacción.' },
    cod: { icono: '🛵', titulo: '¡Pedido Registrado!', badge: 'Pago contra entrega', clase: 'badge-pending', msg: 'Pagarás en efectivo al recibir tu pedido. Ya lo estamos preparando.' },
    rejected: { icono: '❌', titulo: 'Pago Rechazado', badge: 'Rechazado', clase: 'badge-rejected', msg: 'Hubo un problema con tu medio de pago. Puedes intentarlo nuevamente.', reintentar: true },
    cancelled: { icono: '❌', titulo: 'Pago Cancelado', badge: 'Cancelado', clase: 'badge-rejected', msg: 'El pago fue cancelado. Tu carrito sigue guardado.', reintentar: true },
    refunded: { icono: '↩️', titulo: 'Pago Reembolsado', badge: 'Reembolsado', clase: 'badge-pending', msg: 'El pago de este pedido fue reembolsado.' },
    awaiting_payment: { icono: '⚠️', titulo: 'Pago no completado', badge: 'Sin pago', clase: 'badge-pending', msg: 'Aún no recibimos tu pago. Tu carrito sigue guardado.', reintentar: true }
  };
  const LIMPIAN_CARRITO = ['approved', 'pending', 'in_process', 'cod'];

  function mensajeSimple(icono, titulo, texto, extra = '') {
    cont.innerHTML = `
      <span style="font-size:3.5rem;display:block;margin-bottom:.5rem;">${icono}</span>
      <h1 style="margin:.5rem 0;font-size:1.7rem;">${esc(titulo)}</h1>
      <p style="margin-bottom:1.2rem;">${esc(texto)}</p>
      <div style="display:flex;flex-wrap:wrap;gap:.8rem;justify-content:center;">${extra}<a href="index.html" class="btn btn-maiz">Volver al Inicio</a></div>`;
  }

  function render(p) {
    const info = ESTADOS[p.status] || ESTADOS.pending;
    if (LIMPIAN_CARRITO.includes(p.status)) window.CartStore?.vaciarCarrito();

    const r = p.resumen;
    const itemsHTML = r.items.map((i) => `
      <div class="resumen-item" style="text-align:left;">
        <span>${i.cantidad}× ${esc(i.nombre)} (${esc(i.etiquetaPresentacion)})</span>
        <strong>${CartStore.formatearMXN(i.precioUnitario * i.cantidad)}</strong>
      </div>`).join('');

    const etiquetaTotal = p.status === 'approved' ? 'Total Pagado' : 'Total';
    const detalle = `
      <div style="text-align:left;background:var(--crema);padding:1.2rem;border-radius:14px;margin:1.5rem 0;border:1px solid #e5d5b5;">
        <p><strong>Cliente:</strong> ${esc(p.clienteNombre)}</p>
        <p><strong>Entrega:</strong> ${p.entregaTipo === 'domicilio' ? '🛵 Domicilio' : '🏪 Recoger en tienda'}</p>
        <p><strong>Método de pago:</strong> ${esc(METODOS[p.metodoPago] || p.metodoPago)}</p>
        ${p.requiereFactura ? '<p><strong>Facturación:</strong> Solicitada (CFDI 4.0)</p>' : ''}
        <hr style="border:0;border-top:1px dashed #cbb894;margin:.8rem 0;">
        ${itemsHTML}
        <div style="margin-top:.8rem;">
          <div class="desglose-fila"><span>Subtotal (sin IVA)</span><span>${CartStore.formatearMXN(r.baseSinIva)}</span></div>
          <div class="desglose-fila"><span>IVA (16%)</span><span>${CartStore.formatearMXN(r.ivaDesglosado)}</span></div>
          <div class="desglose-fila"><span>Incluye envío</span><span>${r.costoEnvio === 0 ? 'GRATIS' : CartStore.formatearMXN(r.costoEnvio)}</span></div>
          <div class="desglose-fila total"><span>${etiquetaTotal}</span><span>${CartStore.formatearMXN(r.total)}</span></div>
        </div>
      </div>`;

    const pendienteSpei = p.status === 'pending' && p.metodoPago === 'spei'
      ? 'Validaremos tu comprobante de transferencia y te avisaremos.' : info.msg;
    const textoWa = encodeURIComponent(`Hola Tamales Don Ramón, acabo de realizar el pedido *${p.folio}* (${info.badge}). ¿Me confirman el tiempo de entrega?`);

    cont.innerHTML = `
      <span style="font-size:3.5rem;display:block;margin-bottom:.5rem;">${info.icono}</span>
      <span class="badge-estado ${info.clase}">${esc(info.badge)}</span>
      <h1 style="margin:.7rem 0 .4rem;font-size:1.9rem;">${esc(info.titulo)}</h1>
      <p style="font-size:1.05rem;">Folio de pedido: <strong style="color:var(--rojo);">${esc(p.folio)}</strong></p>
      <p style="opacity:.85;margin-top:.3rem;">${esc(pendienteSpei)}</p>
      ${detalle}
      <div style="display:flex;flex-wrap:wrap;gap:.8rem;justify-content:center;margin-top:1.2rem;">
        ${info.reintentar
          ? '<a href="checkout.html" class="btn btn-primario">Reintentar pago</a>'
          : `<a href="https://wa.me/526184463758?text=${textoWa}" target="_blank" rel="noopener" class="btn btn-whatsapp">📞 Enviar folio por WhatsApp</a>`}
        <a href="index.html" class="btn btn-maiz">Volver al Inicio</a>
      </div>`;
  }

  async function cargar() {
    if (!/^TDR-\d{6}-[A-F0-9]{12}$/.test(folio)) {
      return mensajeSimple('🔎', 'No encontramos tu pedido', 'El enlace no incluye un folio válido. Si ya pagaste, escríbenos por WhatsApp con tu comprobante.');
    }
    cont.innerHTML = '<p style="padding:2rem 0;">Verificando tu pedido…</p>';

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    try {
      const url = `${API}/api/pedidos/${encodeURIComponent(folio)}${paymentId ? `?payment_id=${paymentId}` : ''}`;
      const resp = await fetch(url, { signal: controller.signal });
      if (resp.status === 404) return mensajeSimple('🔎', 'Pedido no encontrado', `No existe un pedido con el folio ${folio}.`);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      render(await resp.json());
    } catch (e) {
      console.error('Confirmación:', e);
      mensajeSimple('📡', 'No pudimos verificar el estado', `Tu folio es ${folio}. Revisa tu conexión e intenta de nuevo; tu carrito no se ha modificado.`,
        '<button type="button" class="btn btn-primario" id="btn-reintentar-verif">Reintentar</button>');
      document.getElementById('btn-reintentar-verif')?.addEventListener('click', cargar);
    } finally {
      clearTimeout(t);
    }
  }

  cargar();
})();
