// public/script.js

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE STRIPE Y ESTADO
// ─────────────────────────────────────────────────────────────
const STRIPE_PUBLIC_KEY = 'pk_test_51SKln5PiUIQBQWYUgUmBkHpwcjzj6eqZDOX0pmE9ggM52Gg0ry3DBn6pYbQTVjt0VNk2S4uhEvXPy4poVdNDPfAV00KEypgFEK';

const stripe = Stripe(STRIPE_PUBLIC_KEY);
let elements;
let CARRITO = [];
let inventarioLocal = [];

// Referencias DOM
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (n) => Number(n || 0).toFixed(2);
const listaCarritoUl = document.getElementById('lista-carrito');
const totalCarritoSpan = document.getElementById('total-carrito');
const btnWhatsapp = document.getElementById('btn-whatsapp-pedido');
const nombreClienteInput = document.getElementById('nombre-cliente');
const emailClienteInput = document.getElementById('email-cliente');
const fechaRecoleccionInput = document.getElementById('fecha-recoleccion');
const horaRecoleccionInput = document.getElementById('hora-recoleccion');
const formOrden = document.getElementById('form-orden');

// Helpers extra
const STORAGE_KEY = 'CARRITO_STORE_V1';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const btnIniciarPago = document.getElementById('btn-iniciar-pago');
const paymentContainer = document.getElementById('payment-element-container');

// ─────────────────────────────────────────────────────────────
// reCAPTCHA v3 helper
// ─────────────────────────────────────────────────────────────
async function getRecaptchaToken(action = 'checkout') {
  return new Promise((resolve) => {
    try {
      if (!window.grecaptcha || !window.RECAPTCHA_SITE_KEY) {
        resolve(null);
        return;
      }
      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(window.RECAPTCHA_SITE_KEY, { action })
          .then((token) => resolve(token))
          .catch(() => resolve(null));
      });
    } catch (_) {
      resolve(null);
    }
  });
}

// Persistencia ligera
function guardarCarrito() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(CARRITO)); } catch (_) {}
}
function cargarCarrito() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    CARRITO = raw ? JSON.parse(raw) : [];
  } catch (_) {
    CARRITO = [];
  }
}

// ─────────────────────────────────────────────────────────────
// Lógica de Carrito y Render
// ─────────────────────────────────────────────────────────────
function renderizarCarrito() {
  const cont = listaCarritoUl;
  const totalEl = totalCarritoSpan;
  cont.innerHTML = '';

  if (!Array.isArray(CARRITO) || CARRITO.length === 0) {
    cont.innerHTML = '<li>El carrito está vacío.</li>';
    totalEl.textContent = '0.00';
    guardarCarrito();
    if (paymentContainer) paymentContainer.style.display = 'none';
    if (btnIniciarPago) btnIniciarPago.style.display = '';
    return;
  }

  let total = 0;
  CARRITO.forEach((item, idx) => {
    const li = document.createElement('li');
    const subtotal = Number(item.precio) * Number(item.cantidad);
    total += subtotal;

    li.innerHTML = `
      <div class="carrito-item" style="display:flex; align-items:center; gap:8px; justify-content:space-between;">
        <div style="flex:1;">
          <strong>${item.nombre}</strong><br/>
          Cantidad:
          <input type="number" min="1" value="${item.cantidad}" data-idx="${idx}" class="carrito-cantidad" style="width:70px" />
          &nbsp;|&nbsp; Subtotal: $<span class="subtotal">${fmt(subtotal)}</span>
        </div>
        <button class="btn-eliminar" data-idx="${idx}" aria-label="Eliminar ${item.nombre}">Eliminar</button>
      </div>
    `;
    cont.appendChild(li);
  });

  totalEl.textContent = fmt(total);

  $$('.carrito-cantidad').forEach((inp) => {
    inp.addEventListener('input', () => {
      const idx = Number(inp.dataset.idx);
      const val = Math.max(1, Math.floor(Number(inp.value || 1)));
      CARRITO[idx].cantidad = val;
      guardarCarrito();
      renderizarCarrito();
    });
  });

  $$('.btn-eliminar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      CARRITO.splice(idx, 1);
      guardarCarrito();
      renderizarCarrito();
    });
  });
}

function agregarAlCarrito(prod) {
  const existente = CARRITO.find((p) => String(p.id) === String(prod.id));
  if (existente) {
    existente.cantidad += 1;
  } else {
    CARRITO.push({ ...prod, cantidad: 1 });
  }
  guardarCarrito();
  renderizarCarrito();
}

// ─────────────────────────────────────────────────────────────
// Render de productos (Lectura de MongoDB) con fallback
// ─────────────────────────────────────────────────────────────
async function fetchProductosConFallback() {
  try {
    const r1 = await fetch('/api/products', { credentials: 'same-origin' });
    if (r1.ok) return r1.json();
    throw new Error(`HTTP ${r1.status}`);
  } catch (_) {
    const r2 = await fetch('http://localhost:3000/api/products');
    if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
    return r2.json();
  }
}

async function renderizarProductos() {
  const cont = document.getElementById('lista-productos');
  if (!cont) return;
  cont.innerHTML = '<p>Cargando inventario…</p>';

  try {
    const productos = await fetchProductosConFallback();
    inventarioLocal = Array.isArray(productos)
      ? productos.map(p => ({
          id: (p.id != null ? Number(p.id) : (p._id || String(p._id))),
          nombre: p.nombre,
          descripcion: p.descripcion,
          precio: Number(p.precio),
          stock: Number(p.stock || 0),
          _raw: p,
        }))
      : [];

    if (!inventarioLocal.length) {
      cont.innerHTML = `
        <div class="productos-grid" style="grid-template-columns: 1fr;">
          <p style="color: #f0ad4e; font-weight: bold;">No hay productos disponibles.</p>
        </div>`;
      return;
    }

    cont.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'productos-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
    grid.style.gap = '16px';

    inventarioLocal.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'producto-card';
      card.style.cssText = 'border:1px solid #e5e7eb; border-radius:10px; padding:12px; background:#fff;';
      card.innerHTML = `
        <h3 style="margin:0 0 6px 0;">${p.nombre}</h3>
        <p style="margin:0 0 8px 0; color:#4b5563;">${p.descripcion || ''}</p>
        <p style="margin:0 0 12px 0;"><strong>$${fmt(p.precio)}</strong></p>
        <button class="btn-agregar" data-id="${p.id}" style="width:100%;">Añadir al Carrito</button>
      `;
      grid.appendChild(card);
    });

    cont.appendChild(grid);

    $$('.btn-agregar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const raw = btn.dataset.id;
        const id = Number.isFinite(Number(raw)) && String(Number(raw)) === String(raw) ? Number(raw) : String(raw);
        const prod = inventarioLocal.find((x) => String(x.id) === String(id));
        if (prod) {
          agregarAlCarrito({
            id,
            nombre: prod.nombre,
            precio: Number(prod.precio)
          });
        }
      });
    });
  } catch (err) {
    console.error('❌ Error CRÍTICO al obtener productos:', err);
    cont.innerHTML = `<div style="color:#b00020; font-weight: bold;">
        <p>❌ Error de conexión al inventario. Revisa que el servidor esté corriendo.</p>
      </div>`;
  }
}

// ─────────────────────────────────────────────────────────────
// FLUJO DE PAGO Y ORDEN (CORREGIDO + MEJORAS + reCAPTCHA)
// ─────────────────────────────────────────────────────────────
async function iniciarFlujoDePago(e) {
  e.preventDefault();

  if (CARRITO.length === 0) return alert('Tu carrito está vacío.');

  const nombre = nombreClienteInput.value.trim();
  const email  = emailClienteInput.value.trim();
  const fecha  = fechaRecoleccionInput.value;
  const hora   = horaRecoleccionInput.value;

  if (!nombre || !email || !fecha || !hora) {
    return alert('Completa todos los campos de detalles de recolección.');
  }
  if (!EMAIL_RE.test(email)) {
    return alert('Ingresa un correo electrónico válido.');
  }

  const total = CARRITO.reduce((acc, it) => acc + (Number(it.precio) * Number(it.cantidad)), 0);

  try {
    if (paymentContainer) {
      paymentContainer.innerHTML = '';
      paymentContainer.style.display = 'block';
    }
    if (btnIniciarPago) btnIniciarPago.style.display = 'none';

    // 🔐 Obtener token reCAPTCHA v3
    const recaptchaToken = await getRecaptchaToken('create_payment_intent');
    console.log('[reCAPTCHA] token prefix:', recaptchaToken ? recaptchaToken.slice(0, 18) + '…' : '(sin token)');
    const recaptchaInput = document.getElementById('recaptcha_token');
    if (recaptchaInput) recaptchaInput.value = recaptchaToken || '';

    // 2) Crear PaymentIntent en backend
    const response = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carrito: CARRITO.map(({ id, nombre, precio, cantidad }) => ({ id, nombre, precio, cantidad })),
        cliente: { nombre, email, fecha, hora },
        total: total.toFixed(2),
        recaptchaToken
      }),
    });

    const json = await response.json();
    if (!json.success) throw new Error(json.message || 'No se pudo iniciar el pago.');

    // 3) Stripe Elements
    const appearance = { theme: 'stripe' };
    elements = stripe.elements({ appearance, clientSecret: json.clientSecret });

    const paymentElement = elements.create('payment', { layout: 'tabs' });
    paymentElement.mount(paymentContainer);

    // 4) Botón "Pagar"
    const btnPagar = document.createElement('button');
    btnPagar.id = 'btn-pagar';
    btnPagar.textContent = `Pagar $${total.toFixed(2)}`;
    btnPagar.style.cssText = 'width: 100%; padding: 10px; margin-top: 15px; background-color: #6772e5; color: white; border: none; border-radius: 6px; cursor: pointer;';
    paymentContainer.appendChild(btnPagar);
    btnPagar.addEventListener('click', procesarPagoFinal);

  } catch (err) {
    console.error('Error al iniciar el pago:', err);
    alert(`Error al iniciar el pago: ${err.message}. Revisa tu conexión o intenta de nuevo.`);
    if (paymentContainer) paymentContainer.style.display = 'none';
    if (btnIniciarPago) btnIniciarPago.style.display = '';
  }
}

async function procesarPagoFinal() {
  try {
    const btnPagar = document.getElementById('btn-pagar');
    if (btnPagar) {
      btnPagar.disabled = true;
      btnPagar.textContent = 'Procesando…';
    }

    const total = CARRITO.reduce((acc, it) => acc + (Number(it.precio) * Number(it.cantidad)), 0);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}${window.location.pathname}?payment_success=true&total_paid=${total.toFixed(2)}`
      },
      redirect: 'if_required',
    });

    if (error) {
      alert(error.message || 'No se pudo confirmar el pago. Verifica tus datos.');
      if (btnPagar) {
        btnPagar.disabled = false;
        btnPagar.textContent = 'Fallo al Pagar (Reintentar)';
      }
      return;
    }

    if (paymentIntent && paymentIntent.status === 'succeeded') {
      alert('✅ Pago Exitoso. Redirigiendo para confirmación final.');
      window.location.href = `${window.location.origin}${window.location.pathname}?payment_success=true&total_paid=${total.toFixed(2)}`;
    }
  } catch (err) {
    console.error('Error en confirmación de pago:', err);
    alert('Ocurrió un error al confirmar el pago.');
  }
}

// WhatsApp
function enviarPedidoWhatsapp() {
  if (CARRITO.length === 0) return alert('Tu carrito está vacío.');

  const nombre = (nombreClienteInput.value || '').trim();
  const fecha = (fechaRecoleccionInput.value || '').trim();
  const hora = (horaRecoleccionInput.value || '').trim();

  const resumen = CARRITO.map((i) => `• ${i.nombre} x${i.cantidad} — $${fmt(i.precio * i.cantidad)}`).join('\n');
  const total = CARRITO.reduce((acc, it) => acc + (Number(it.precio) * Number(it.cantidad)), 0);

  const msg =
    `Hola, me gustaría apartar mi pedido:\n\n` +
    `${resumen}\n\n` +
    `Total: $${fmt(total)}\n` +
    `Nombre: ${nombre || 'N/D'}\n` +
    `Recolección: ${fecha || 'N/D'} a las ${hora || 'N/D'}`;

  const phone = btnWhatsapp?.dataset?.phone || '0000000000';
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  cargarCarrito();

  await renderizarProductos();
  renderizarCarrito();

  if (formOrden) formOrden.addEventListener('submit', iniciarFlujoDePago);
  if (btnWhatsapp) btnWhatsapp.addEventListener('click', enviarPedidoWhatsapp);

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('payment_success') === 'true') {
    const totalPaid = urlParams.get('total_paid');
    alert(`🎉 ¡Pago COMPLETADO con éxito!${totalPaid ? ` Importe: $${totalPaid}.` : ''} El vendedor procesará la orden y recibirás un correo final.`);
    CARRITO = [];
    guardarCarrito();
    renderizarCarrito();
    history.replaceState(null, '', window.location.pathname);
  }
});