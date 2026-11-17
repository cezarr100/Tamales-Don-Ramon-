/* =========================================================
   TAMALES DON RAMÓN — JavaScript vanilla
   - Menú hamburguesa (panel lateral, ESC, clic fuera)
   - Animaciones de scroll (IntersectionObserver)
   - Validación del formulario de contacto
   - Pedidos por WhatsApp con mensaje prellenado
   ========================================================= */

(function () {
  'use strict';

  const WHATSAPP = '526184463758';

  /* ---------- 1. Menú hamburguesa ---------- */
  const boton = document.getElementById('btn-hamburguesa');
  const panel = document.getElementById('panel-lateral');
  const overlay = document.getElementById('overlay');
  const cerrarBtn = document.getElementById('panel-cerrar');

  function abrirMenu() {
    panel.classList.add('abierto');
    overlay.classList.add('visible');
    boton.classList.add('abierto');
    boton.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('menu-abierto');
    cerrarBtn.focus();
  }

  function cerrarMenu() {
    panel.classList.remove('abierto');
    overlay.classList.remove('visible');
    boton.classList.remove('abierto');
    boton.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('menu-abierto');
  }

  if (boton && panel && overlay) {
    boton.addEventListener('click', () => {
      panel.classList.contains('abierto') ? cerrarMenu() : abrirMenu();
    });
    cerrarBtn.addEventListener('click', () => { cerrarMenu(); boton.focus(); });
    overlay.addEventListener('click', cerrarMenu);                       // clic fuera
    panel.querySelectorAll('a').forEach(a => a.addEventListener('click', cerrarMenu)); // clic en enlace
    document.addEventListener('keydown', (e) => {                        // tecla ESC
      if (e.key === 'Escape' && panel.classList.contains('abierto')) {
        cerrarMenu();
        boton.focus();
      }
    });
  }

  /* ---------- 2. Animaciones al hacer scroll ---------- */
  const elementos = document.querySelectorAll('.fade-in-up');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visible');
          observer.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.12 });
    elementos.forEach((el, i) => {
      el.style.transitionDelay = (i % 4) * 0.08 + 's'; // pequeño efecto escalonado
      observer.observe(el);
    });
  } else {
    elementos.forEach((el) => el.classList.add('visible'));
  }

  /* ---------- 3. Pedidos por WhatsApp ---------- */
  // Cualquier botón con data-pedido="Nombre del producto" abre WhatsApp con mensaje prellenado
  document.querySelectorAll('[data-pedido]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const producto = btn.getAttribute('data-pedido');
      const texto = 'Hola Tamales Don Ramón, quiero pedir: ' + producto + '. ¿Me pueden ayudar?';
      window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
    });
  });

  /* ---------- 4. Validación del formulario de contacto ---------- */
  const form = document.getElementById('form-contacto');
  if (form) {
    const exito = document.getElementById('mensaje-exito');

    const reglas = {
      nombre: (v) => v.trim().length >= 3 ? '' : 'Escribe tu nombre (mínimo 3 letras).',
      telefono: (v) => /^[0-9\s\-+()]{10,15}$/.test(v.trim()) ? '' : 'Ingresa un teléfono válido de 10 dígitos.',
      email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Ingresa un correo electrónico válido.',
      mensaje: (v) => v.trim().length >= 10 ? '' : 'El mensaje debe tener al menos 10 caracteres.'
    };

    function validarCampo(input) {
      const error = reglas[input.name](input.value);
      const contenedor = input.closest('.campo');
      contenedor.classList.toggle('error', Boolean(error));
      contenedor.querySelector('.mensaje-error').textContent = error;
      input.setAttribute('aria-invalid', error ? 'true' : 'false');
      return !error;
    }

    form.querySelectorAll('input, textarea').forEach((input) => {
      input.addEventListener('blur', () => validarCampo(input));
      input.addEventListener('input', () => {
        if (input.closest('.campo').classList.contains('error')) validarCampo(input);
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let valido = true;
      form.querySelectorAll('input, textarea').forEach((input) => {
        if (!validarCampo(input)) valido = false;
      });
      if (!valido) {
        form.querySelector('.error input, .error textarea').focus();
        return;
      }
      // Aquí podrías enviar los datos a un servidor (fetch). Por ahora solo mostramos éxito.
      exito.classList.add('visible');
      exito.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.reset();
      setTimeout(() => exito.classList.remove('visible'), 8000);
    });
  }
})();
