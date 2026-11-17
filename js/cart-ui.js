/* =========================================================
   TAMALES DON RAMÓN — Interfaz del Carrito (Header, Drawer y Toasts)
   ========================================================= */

(function () {
  'use strict';

  if (!window.CartStore) return;

  function inyectarBotonHeader() {
    const headerContenedor = document.querySelector('.header .contenedor');
    const hamburguesa = document.getElementById('btn-hamburguesa');
    if (!headerContenedor || !hamburguesa) return;

    const acciones = document.createElement('div');
    acciones.className = 'header-acciones';

    const btnCarrito = document.createElement('button');
    btnCarrito.type = 'button';
    btnCarrito.className = 'btn-carrito-header';
    btnCarrito.id = 'btn-abrir-carrito';
    btnCarrito.setAttribute('aria-label', 'Abrir carrito de compras');
    btnCarrito.innerHTML = `
      <span aria-hidden="true">🛒</span>
      <span class="carrito-badge oculto" id="carrito-badge">0</span>
    `;

    hamburguesa.parentNode.insertBefore(acciones, hamburguesa);
    acciones.appendChild(btnCarrito);
    acciones.appendChild(hamburguesa);
  }

  function inyectarDrawerYToast() {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="carrito-overlay" id="carrito-overlay"></div>
      <aside class="carrito-drawer" id="carrito-drawer" aria-hidden="true" aria-label="Carrito de compras">
        <div class="carrito-header">
          <h2>🛒 Tu Pedido</h2>
          <button type="button" class="carrito-cerrar" id="carrito-cerrar" aria-label="Cerrar carrito">✕</button>
        </div>
        <div class="barra-envio-gratis" id="barra-envio-gratis">
          🛵 Envío $15 MXN · ¡Gratis en pedidos mayores a $150 MXN!
        </div>
        <div class="carrito-body" id="carrito-lista"></div>
        <div class="carrito-footer" id="carrito-footer"></div>
      </aside>
      <div class="toast-container" id="toast-container" aria-live="polite"></div>
    `;
    document.body.appendChild(wrapper);
  }

  function mostrarToast(texto, esError = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    if (esError) toast.style.borderLeftColor = '#ff5252';
    toast.innerHTML = `<span>${esError ? '⚠️' : '✅'}</span><span>${texto}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 2800);
  }

  window.mostrarToastCarrito = mostrarToast;

  function abrirDrawer() {
    const drawer = document.getElementById('carrito-drawer');
    const overlay = document.getElementById('carrito-overlay');
    if (!drawer || !overlay) return;
    drawer.classList.add('abierto');
    overlay.classList.add('visible');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-abierto');
  }

  function cerrarDrawer() {
    const drawer = document.getElementById('carrito-drawer');
    const overlay = document.getElementById('carrito-overlay');
    if (!drawer || !overlay) return;
    drawer.classList.remove('abierto');
    overlay.classList.remove('visible');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-abierto');
  }

  function renderizarCarrito(estado) {
    const badge = document.getElementById('carrito-badge');
    const lista = document.getElementById('carrito-lista');
    const footer = document.getElementById('carrito-footer');
    const barraEnvio = document.getElementById('barra-envio-gratis');

    if (badge) {
      badge.textContent = estado.totalArticulos;
      badge.classList.toggle('oculto', estado.totalArticulos === 0);
      badge.classList.remove('pop');
      void badge.offsetWidth;
      if (estado.totalArticulos > 0) badge.classList.add('pop');
    }

    if (barraEnvio) {
      if (estado.subtotalConIva === 0) {
        barraEnvio.textContent = '🛵 Envío $15 MXN · ¡Gratis en pedidos mayores a $150 MXN!';
      } else if (estado.costoEnvio === 0) {
        barraEnvio.innerHTML = '🎉 <strong>¡Felicidades! Tienes envío a domicilio GRATIS</strong> (o recoge en tienda sin costo).';
      } else {
        barraEnvio.innerHTML = `🛵 Agrega <strong>${CartStore.formatearMXN(estado.faltanteEnvioGratis)}</strong> más para envío GRATIS (o recoge en tienda $0).`;
      }
    }

    if (!lista || !footer) return;

    if (estado.items.length === 0) {
      lista.innerHTML = `
        <div class="carrito-vacio">
          <span class="icono-vacio">🫔</span>
          <h3>Tu carrito está vacío</h3>
          <p style="margin:.5rem 0 1.2rem;opacity:.8">Agrega tus tamales favoritos por pieza o docena.</p>
          <a href="menu.html" class="btn btn-primario">Ir al Menú</a>
        </div>
      `;
      footer.innerHTML = '';
      return;
    }

    lista.innerHTML = estado.items
      .map(
        (item) => `
        <div class="carrito-item">
          <img src="${item.imagen}" alt="${item.nombre}">
          <div class="carrito-item-info">
            <h4>${item.emoji} ${item.nombre}</h4>
            <span class="carrito-item-sub">${item.etiquetaPresentacion} · ${CartStore.formatearMXN(item.precioUnitario)} c/u</span>
            <span class="carrito-item-precio">${CartStore.formatearMXN(item.precioUnitario * item.cantidad)}</span>
          </div>
          <div class="carrito-controles">
            <div class="qty-box">
              <button type="button" class="qty-btn" data-accion="restar" data-key="${item.key}" aria-label="Disminuir cantidad">−</button>
              <span class="qty-val">${item.cantidad}</span>
              <button type="button" class="qty-btn" data-accion="sumar" data-key="${item.key}" aria-label="Aumentar cantidad">+</button>
            </div>
            <button type="button" class="btn-eliminar-item" data-accion="eliminar" data-key="${item.key}">Eliminar</button>
          </div>
        </div>
      `
      )
      .join('');

    footer.innerHTML = `
      <div class="desglose-fila">
        <span>Subtotal (sin IVA)</span>
        <span>${CartStore.formatearMXN(estado.baseSinIva)}</span>
      </div>
      <div class="desglose-fila">
        <span>IVA (16%)</span>
        <span>${CartStore.formatearMXN(estado.ivaDesglosado)}</span>
      </div>
      <div class="desglose-fila">
        <span>Incluye envío a domicilio</span>
        <span>${estado.costoEnvio === 0 ? '<strong style="color:var(--verde)">GRATIS</strong>' : CartStore.formatearMXN(estado.costoEnvio)}</span>
      </div>
      <div class="desglose-fila total">
        <span>Total MXN</span>
        <span>${CartStore.formatearMXN(estado.total)}</span>
      </div>
      <div class="carrito-footer-btns">
        <button type="button" class="btn-vaciar" id="btn-vaciar-carrito">Vaciar</button>
        <a href="checkout.html" class="btn btn-primario">Finalizar compra →</a>
      </div>
    `;
  }

  function enlazarEventos() {
    document.getElementById('btn-abrir-carrito')?.addEventListener('click', abrirDrawer);
    document.getElementById('carrito-cerrar')?.addEventListener('click', cerrarDrawer);
    document.getElementById('carrito-overlay')?.addEventListener('click', cerrarDrawer);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') cerrarDrawer();
    });

    // Delegación dentro del drawer
    document.getElementById('carrito-drawer')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-accion]');
      if (btn) {
        const key = btn.getAttribute('data-key');
        const accion = btn.getAttribute('data-accion');
        if (accion === 'sumar') {
          const res = CartStore.actualizarCantidad(key, 1);
          if (res && !res.ok) mostrarToast(res.mensaje, true);
        } else if (accion === 'restar') {
          CartStore.actualizarCantidad(key, -1);
        } else if (accion === 'eliminar') {
          CartStore.eliminarItem(key);
        }
      }

      if (e.target.id === 'btn-vaciar-carrito') {
        CartStore.vaciarCarrito();
        mostrarToast('Carrito vaciado');
      }
    });

    // Selectores Pieza / Docena en tarjetas de producto
    document.addEventListener('click', (e) => {
      const btnPres = e.target.closest('.btn-opcion-pres');
      if (btnPres) {
        const tarjeta = btnPres.closest('.tarjeta');
        const pres = btnPres.getAttribute('data-pres');
        const precio = btnPres.getAttribute('data-precio');

        tarjeta.querySelectorAll('.btn-opcion-pres').forEach((b) => b.classList.remove('activa'));
        btnPres.classList.add('activa');

        const btnAgregar = tarjeta.querySelector('[data-add-id]');
        if (btnAgregar) btnAgregar.setAttribute('data-add-pres', pres);

        const precioEl = tarjeta.querySelector('.precio-dinamico');
        if (precioEl) {
          precioEl.innerHTML = `$${precio} <small>MXN · ${pres === 'docena' ? 'Docena (12 pzas)' : 'Por pieza'} (IVA incl.)</small>`;
        }
      }

      // Botón "Añadir al carrito"
      const btnAdd = e.target.closest('[data-add-id]');
      if (btnAdd) {
        const id = btnAdd.getAttribute('data-add-id');
        const pres = btnAdd.getAttribute('data-add-pres') || 'pieza';
        const resultado = CartStore.agregarItem(id, pres, 1);
        mostrarToast(resultado.mensaje, !resultado.ok);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    inyectarBotonHeader();
    inyectarDrawerYToast();
    enlazarEventos();
    CartStore.suscribir(renderizarCarrito);
  });
})();