/* =========================================================
   TAMALES DON RAMÓN — Checkout (valida, envía el pedido al backend y redirige)
   El servidor recalcula precios/IVA/envío: el cliente solo envía ids y cantidades.
   ========================================================= */
(function () {
  'use strict';

  const API = window.TDR_API_BASE || '';
  const form = document.getElementById('form-checkout');
  if (!form || !window.CartStore) return;

  const checkoutVacio = document.getElementById('checkout-vacio');
  const alertaMp = document.getElementById('alerta-mp');
  const btnSubmit = document.getElementById('btn-confirmar-pedido');
  const statusMsg = document.getElementById('checkout-status-msg');
  const chkFactura = document.getElementById('chk-requiere-factura');
  const $ = (id) => document.getElementById(id);

  const TEXTOS_BTN = {
    mercadopago: '💳 Pagar con Mercado Pago',
    spei: '🏦 Confirmar Pedido por SPEI',
    efectivo: '💵 Confirmar Pedido Contra Entrega'
  };

  if (['failure', 'cancelled'].includes(new URLSearchParams(location.search).get('status'))) {
    alertaMp?.classList.remove('oculto');
  }

  const obtenerTipoEntrega = () => form.querySelector('input[name="tipoEntrega"]:checked')?.value || 'domicilio';
  const obtenerMetodoPago = () => form.querySelector('input[name="metodoPago"]:checked')?.value || 'mercadopago';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function actualizarResumenUI() {
    const resumen = CartStore.obtenerResumen(obtenerTipoEntrega());
    if (resumen.items.length === 0) {
      form.classList.add('oculto');
      checkoutVacio.classList.remove('oculto');
      return;
    }
    form.classList.remove('oculto');
    checkoutVacio.classList.add('oculto');

    $('resumen-productos').innerHTML = resumen.items.map((i) => `
      <div class="resumen-item">
        <div><strong>${i.cantidad}× ${esc(i.nombre)}</strong>
          <div style="font-size:.8rem;color:var(--cafe);">${esc(i.etiquetaPresentacion)}</div></div>
        <strong>${CartStore.formatearMXN(i.precioUnitario * i.cantidad)}</strong>
      </div>`).join('');

    $('res-subtotal').textContent = CartStore.formatearMXN(resumen.baseSinIva);
    $('res-iva').textContent = CartStore.formatearMXN(resumen.ivaDesglosado);
    $('res-envio').innerHTML = resumen.costoEnvio === 0
      ? '<strong style="color:var(--verde)">GRATIS ($0.00)</strong>'
      : CartStore.formatearMXN(resumen.costoEnvio);
    $('res-total').textContent = CartStore.formatearMXN(resumen.total);
  }

  // Radio cards (entrega y pago)
  form.querySelectorAll('.radio-card input[type="radio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      form.querySelectorAll(`input[name="${radio.name}"]`).forEach((r) => r.closest('.radio-card').classList.toggle('seleccionada', r.checked));

      if (radio.name === 'tipoEntrega') {
        const dom = obtenerTipoEntrega() === 'domicilio';
        $('bloque-direccion').classList.toggle('oculto', !dom);
        $('bloque-tienda').classList.toggle('oculto', dom);
        actualizarResumenUI();
      }
      if (radio.name === 'metodoPago') {
        const m = obtenerMetodoPago();
        $('panel-pago-spei').classList.toggle('oculto', m !== 'spei');
        $('panel-pago-efectivo').classList.toggle('oculto', m !== 'efectivo');
        btnSubmit.textContent = TEXTOS_BTN[m];
      }
    });
  });

  chkFactura?.addEventListener('change', () => $('bloque-factura').classList.toggle('oculto', !chkFactura.checked));

  // Datos SPEI desde el backend (.env), nunca escritos a mano en el HTML
  fetch(`${API}/api/config`).then((r) => r.json()).then((c) => {
    const box = $('spei-datos');
    if (!box) return;
    box.innerHTML = c.spei?.clabe && c.spei.clabe !== '000000000000000000'
      ? `<strong>Banco:</strong> ${esc(c.spei.banco)}<br><strong>CLABE:</strong> ${esc(c.spei.clabe)}<br><strong>Beneficiario:</strong> ${esc(c.spei.beneficiario)}<br><strong>Concepto:</strong> Tu nombre y folio`
      : 'Pídenos los datos bancarios por WhatsApp al 618 446 3758.';
    if (c.mercadopago === false) {
      const rad = form.querySelector('input[value="mercadopago"]');
      rad?.closest('.radio-card').querySelector('small')?.append(' (no disponible por ahora)');
    }
  }).catch(() => { const b = $('spei-datos'); if (b) b.textContent = 'No pudimos cargar los datos bancarios. Pídelos por WhatsApp al 618 446 3758.'; });

  /* ---------- Validación ---------- */
  function setError(input, msg) {
    const campo = input.closest('.campo');
    if (!campo) return;
    campo.classList.toggle('error', Boolean(msg));
    const span = campo.querySelector('.mensaje-error');
    if (span) span.textContent = msg || '';
  }

  function validarFormulario() {
    let ok = true;
    const check = (id, cond, msg) => { const el = $(id); setError(el, cond ? '' : msg); if (!cond) ok = false; };

    check('chk-nombre', $('chk-nombre').value.trim().length >= 3, 'Ingresa tu nombre completo.');
    check('chk-email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('chk-email').value.trim()), 'Ingresa un correo electrónico válido.');
    check('chk-telefono', /^\d{10}$/.test($('chk-telefono').value.replace(/\D/g, '')), 'Ingresa un teléfono válido de 10 dígitos.');

    if (obtenerTipoEntrega() === 'domicilio') {
      check('chk-calle', $('chk-calle').value.trim().length >= 4, 'Ingresa calle y número.');
      check('chk-colonia', $('chk-colonia').value.trim().length >= 3, 'Ingresa tu colonia.');
      check('chk-cp', /^\d{5}$/.test($('chk-cp').value.trim()), 'Código postal de 5 dígitos.');
    }

    if (chkFactura.checked) {
      const rfcOk = /^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z\d]{2}[A\d]$/i.test($('chk-rfc').value.trim());
      check('chk-rfc', rfcOk, 'RFC inválido (12 o 13 caracteres, sin espacios).');
      check('chk-razon', $('chk-razon').value.trim().length >= 3, 'Ingresa la razón social tal como aparece en tu constancia.');
      check('chk-cp-fiscal', /^\d{5}$/.test($('chk-cp-fiscal').value.trim()), 'Código postal fiscal de 5 dígitos.');
    }

    if (obtenerMetodoPago() === 'spei') {
      const f = $('chk-comprobante').files[0];
      const tipoOk = f && ['image/jpeg', 'image/png', 'application/pdf'].includes(f.type);
      check('chk-comprobante', Boolean(f) && tipoOk && f.size <= 5 * 1024 * 1024,
        !f ? 'Adjunta tu comprobante de transferencia.' : !tipoOk ? 'Solo JPG, PNG o PDF.' : 'El archivo no debe pasar de 5 MB.');
    }
    return ok;
  }

  function mostrarError(msg) {
    statusMsg.innerHTML = '';
    const s = document.createElement('span');
    s.style.color = '#b3171f';
    s.textContent = '⚠️ ' + msg;
    statusMsg.appendChild(s);
  }

  function restaurarBoton() {
    btnSubmit.disabled = false;
    btnSubmit.textContent = TEXTOS_BTN[obtenerMetodoPago()];
  }
  // Si el usuario regresa con "Atrás" desde Mercado Pago, la página puede venir en caché con el botón bloqueado
  window.addEventListener('pageshow', (e) => { if (e.persisted) { restaurarBoton(); statusMsg.textContent = ''; } });

  /* ---------- Envío del pedido ---------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btnSubmit.disabled) return;
    if (!validarFormulario()) {
      form.querySelector('.campo.error input, .campo.error select')?.focus();
      return;
    }

    const tipoEntrega = obtenerTipoEntrega();
    const metodoPago = obtenerMetodoPago();
    const resumen = CartStore.obtenerResumen(tipoEntrega);
    if (!resumen.items.length) return actualizarResumenUI();

    // Solo se envían ids y cantidades; el servidor calcula los montos
    const orden = {
      cliente: { nombre: $('chk-nombre').value.trim(), email: $('chk-email').value.trim(), telefono: $('chk-telefono').value.replace(/\D/g, '') },
      entrega: {
        tipo: tipoEntrega,
        calle: $('chk-calle').value.trim(), colonia: $('chk-colonia').value.trim(),
        cp: $('chk-cp').value.trim(), referencias: $('chk-referencias').value.trim()
      },
      facturacion: chkFactura.checked ? {
        rfc: $('chk-rfc').value.trim().toUpperCase(), razonSocial: $('chk-razon').value.trim(),
        cpFiscal: $('chk-cp-fiscal').value.trim(), regimen: $('chk-regimen').value, usoCfdi: $('chk-cfdi').value
      } : null,
      metodoPago,
      efectivoCon: $('chk-billete').value.trim(),
      items: resumen.items.map((i) => ({ productoId: i.productoId, presentacion: i.presentacion, cantidad: i.cantidad }))
    };

    const fd = new FormData();
    fd.append('orden', JSON.stringify(orden));
    if (metodoPago === 'spei') fd.append('comprobante', $('chk-comprobante').files[0]);

    btnSubmit.disabled = true;
    btnSubmit.textContent = metodoPago === 'mercadopago' ? 'Conectando con Mercado Pago...' : 'Enviando pedido...';
    statusMsg.textContent = metodoPago === 'mercadopago' ? 'Generando enlace seguro de pago...' : 'Registrando tu pedido...';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const resp = await fetch(`${API}/api/pedidos`, { method: 'POST', body: fd, signal: controller.signal });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || `Error del servidor (${resp.status})`);

      if (metodoPago === 'mercadopago') {
        if (!data.init_point) throw new Error('No se recibió la URL de pago de Mercado Pago.');
        // El carrito se conserva hasta que se confirme el pago (confirmacion.js)
        location.href = data.init_point;
      } else {
        CartStore.vaciarCarrito();
        location.href = `confirmacion.html?folio=${encodeURIComponent(data.folio)}`;
      }
    } catch (err) {
      console.error('Checkout:', err);
      restaurarBoton();
      mostrarError(err.name === 'AbortError'
        ? 'El servidor tardó demasiado en responder. Intenta de nuevo o elige otro método de pago.'
        : (err instanceof TypeError
          ? 'No se pudo conectar con el servidor de pedidos. Intenta de nuevo o pide por WhatsApp al 618 446 3758.'
          : err.message));
    } finally {
      clearTimeout(timeoutId);
    }
  });

  CartStore.suscribir(actualizarResumenUI);
})();
