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

const btnIniciarPago = document.getElementById('btn-iniciar-pago');
const paymentContainer = document.getElementById('payment-element-container');

// Helpers extra
const STORAGE_KEY = 'CARRITO_STORE_V1';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// ─────────────────────────────────────────────────────────────
// Utilidades y Persistencia
// ─────────────────────────────────────────────────────────────

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

function setMinDateToday() {
  if (!fechaRecoleccionInput) return;
  const tzOffsetMs = new Date().getTimezoneOffset() * 60 * 1000;
  const todayLocalISO = new Date(Date.now() - tzOffsetMs).toISOString().slice(0, 10);
  fechaRecoleccionInput.min = todayLocalISO;
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

    if (paymentContainer) {
      paymentContainer.innerHTML = '';
      paymentContainer.style.display = 'none';
    }
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
  const existente = CARRITO.find((p) => p.id === prod.id);
  if (existente) {
    existente.cantidad += 1;
  } else {
    CARRITO.push({ ...prod, cantidad: 1 });
  }
  guardarCarrito();
  renderizarCarrito();
}

// ─────────────────────────────────────────────────────────────
// Render de productos (Lectura de MongoDB)
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
    inventarioLocal = Array.isArray(productos) ? productos : [];

    if (!inventarioLocal.length) {
      cont.innerHTML = `<div class="productos-grid" style="grid-template-columns: 1fr;">
          <p style="color: #f0ad4e; font-weight: bold;">No hay productos disponibles.</p>
        </div>`;
      return;
    }

    cont.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'productos-grid';
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:16px;';

    inventarioLocal.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'producto-card';
      card.style.cssText = 'border:1px solid #e5e7eb; border-radius:10px; padding:12px; background:#fff;';
      card.innerHTML = `
        <h3 style="margin:0 0 6px 0;">${p.nombre}</h3>
        <p style="margin:0 0 8px 0; color:#4b5563;">${p.descripcion || ''}</p>
        <p><strong>$${fmt(p.precio)}</strong></p>
        <button class="btn-agregar" data-id="${p.id}" style="width:100%;">Añadir al Carrito</button>
      `;
      grid.appendChild(card);
    });

    cont.appendChild(grid);

    $$('.btn-agregar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const prod = inventarioLocal.find((x) => x.id === id);
        if (prod) agregarAlCarrito(prod);
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
// FLUJO DE PAGO Y ORDEN (CORREGIDO)
// ─────────────────────────────────────────────────────────────
async function iniciarFlujoDePago(e) {
  // Manejamos el evento submit/click para iniciar el flujo de pago con tarjeta
  if (e && typeof e.preventDefault === 'function') e.preventDefault();

  if (CARRITO.length === 0) return alert('Tu carrito está vacío.');

  // 1. Obtener y validar datos del cliente
  const nombre = (nombreClienteInput?.value || '').trim();
  const email = (emailClienteInput?.value || '').trim();
  const fecha = (fechaRecoleccionInput?.value || '').trim();
  const hora = (horaRecoleccionInput?.value || '').trim();

  if (!nombre || !email || !fecha || !hora) {
    return alert('Completa todos los campos de detalles de recolección.');
  }
  if (!EMAIL_RE.test(email)) {
    return alert('Ingresa un correo electrónico válido.');
  }

  const total = CARRITO.reduce((acc, it) => acc + (Number(it.precio) * Number(it.cantidad)), 0);

  try {
    // 1. Ocultar botón inicial, mostrar contenedor de Stripe
    if (paymentContainer) paymentContainer.innerHTML = '';
    if (btnIniciarPago) btnIniciarPago.style.display = 'none';
    if (paymentContainer) paymentContainer.style.display = 'block';

    const response = await fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carrito: CARRITO.map(({ id, nombre, precio, cantidad }) => ({ id, nombre, precio, cantidad })),
        cliente: { nombre, email, fecha, hora },
        total: total.toFixed(2),
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.message || 'No se pudo iniciar el pago.');

    // 2. Montar Stripe Elements
    const appearance = { theme: 'stripe' };
    elements = stripe.elements({ appearance, clientSecret: json.clientSecret });

    const paymentElement = elements.create('payment', { layout: 'tabs' });
    paymentElement.mount('#payment-element-container');

    // 3. Botón pagar (adjunto al contenedor)
    const btnPagar = document.createElement('button');
    btnPagar.id = 'btn-pagar';
    btnPagar.type = 'button'; // Asegura que no dispare submit
    btnPagar.textContent = `Pagar $${total.toFixed(2)}`;
    btnPagar.style.cssText =
      'width:100%; padding:10px; margin-top:15px; background-color:#6772e5; color:#fff; border:none; border-radius:6px; cursor:pointer;';
    paymentContainer.appendChild(btnPagar);

    // 4. Asignar la función final al nuevo botón
    btnPagar.addEventListener('click', procesarPagoFinal);

  } catch (err) {
    console.error('Error al iniciar el pago:', err);
    alert(`Error al iniciar el pago: ${err.message}. Revisa tu conexión o intenta de nuevo.`);

    // Fallback: mostrar el botón inicial de nuevo
    if (paymentContainer) paymentContainer.style.display = 'none';
    if (btnIniciarPago) btnIniciarPago.style.display = 'block';
  }
}

async function procesarPagoFinal() {
  try {
    const btnPagar = document.getElementById('btn-pagar');
    if (btnPagar) {
      btnPagar.disabled = true;
      btnPagar.textContent = 'Procesando…';
    }

    // 1. Confirmar el pago con la URL de redirección
    const total = CARRITO.reduce((acc, it) => acc + (Number(it.precio) * Number(it.cantidad)), 0);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        // La URL de redirección final es CRÍTICA para que Stripe termine el flujo.
        return_url: `${window.location.origin}${window.location.pathname}?payment_success=true&total_paid=${total.toFixed(2)}`,
      },
      redirect: 'if_required', 
    });

    // 2. Manejo de errores de confirmación de Stripe
    if (error) {
      alert(error.message || 'No se pudo confirmar el pago. Verifica tus datos.');
      if (btnPagar) {
        btnPagar.disabled = false;
        btnPagar.textContent = 'Pagar de nuevo';
      }
      return;
    }
    
    // 3. Si el pago es exitoso pero NO redirigió (raro), notificamos manualmente.
    if (paymentIntent && paymentIntent.status === 'succeeded') {
        alert('✅ Pago Exitoso. Redirigiendo para confirmación final.');
        window.location.href = `${window.location.origin}${window.location.pathname}?payment_success=true&total_paid=${total.toFixed(2)}`;
    }
    // Si no hubo error ni éxito inmediato, Stripe maneja la redirección.

  } catch (err) {
    console.error('Error en confirmación de pago:', err);
    alert('Ocurrió un error al confirmar el pago.');
  }
}

// Función para enviar el pedido a WhatsApp Business (Mantenido)
function enviarPedidoWhatsapp() {
  if (CARRITO.length === 0) return alert('Tu carrito está vacío.');

  const nombre = (nombreClienteInput?.value || '').trim();
  const fecha = (fechaRecoleccionInput?.value || '').trim();
  const hora = (horaRecoleccionInput?.value || '').trim();

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
// Inicio y Listeners
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Configurar fecha mínima
  setMinDateToday();

  // Carga carrito persistido (si lo hay)
  cargarCarrito();

  // Render inicial
  await renderizarProductos();
  renderizarCarrito();

  // Listeners
  if (formOrden) {
    // Escuchar el submit del formulario para iniciar el flujo de pago.
    formOrden.addEventListener('submit', (e) => {
      e.preventDefault();
      iniciarFlujoDePago(e);
    });
  }

  // Listener explícito en el botón de WhatsApp
  if (btnWhatsapp) btnWhatsapp.addEventListener('click', enviarPedidoWhatsapp);

  // Manejo de retorno (Stripe return_url)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('payment_success') === 'true') {
    const totalPaid = urlParams.get('total_paid');
    alert(`🎉 ¡Pago completado con éxito!${totalPaid ? ` Importe: $${totalPaid}.` : ''} Recibirás un correo de confirmación de tu pedido.`);
    // Limpia carrito después de éxito
    CARRITO = [];
    guardarCarrito();
    renderizarCarrito();
    // Limpia query params
    history.replaceState(null, '', window.location.pathname);
  }
});