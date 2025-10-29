// public/script.js

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE STRIPE Y ESTADO
// ─────────────────────────────────────────────────────────────
const STRIPE_PUBLIC_KEY = 'pk_test_51SKln5PiUIQBQWYUgUmBkHpwcjzj6eqZDOX0pmE9ggM52Gg0ry3DBn6pYbQTVjt0VNk2S4uhEvXPy4poVdNDPfAV00KEypgFEK';

const stripe = Stripe(STRIPE_PUBLIC_KEY);
let elements;
let CARRITO = [];
let inventarioLocal = [];

// ─────────────────────────────────────────────────────────────
// [STORE CONFIG NEW] soporte para configuración por tienda
//   - Carga /config/store-config.json (si existe)
//   - Ajusta branding, WhatsApp, horarios, redes, etc.
//   - NUEVO: Render de tira de redes con íconos oficiales
//   - NUEVO: Mostrar dirección y ocultar links antiguos (tel/whatsapp)
// ─────────────────────────────────────────────────────────────
let STORE_CONFIG = null;

async function loadStoreConfig() {
  // [BRAND PATCH] no-cache para ver cambios al instante
  try {
    const r = await fetch('/config/store-config.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    return j || null;
  } catch {
    return null;
  }
}

// [STORE CONFIG] util: sanitizar URL externa básica
function safeURL(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null; // sólo http/https
    return url.toString();
  } catch {
    return null;
  }
}

// [STORE CONFIG] íconos SVG oficiales embebidos (sin dependencias)
const SOCIAL_SVGS = {
  instagram: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7 2C4.24 2 2 4.24 2 7v10c0 2.76 2.24 5 5 5h10c2.76 0 5-2.24 5-5V7c0-2.76-2.24-5-5-5H7zm0 2h10c1.67 0 3 1.33 3 3v10c0 1.67-1.33 3-3 3H7c-1.67 0-3-1.33-3-3V7c0-1.67 1.33-3 3-3zm11 1.75a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM12 7a5 5 0 100 10 5 5 0 000-10zm0 2a3 3 0 110 6 3 3 0 010-6z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M22 12a10 10 0 10-11.6 9.9v-7h-2.6V12h2.6V9.8c0-2.6 1.6-4 3.9-4 1.1 0 2.3.2 2.3.2v2.6h-1.3c-1.3 0-1.7.8-1.7 1.6V12h2.9l-.5 2.9h-2.4v7A10 10 0 0022 12z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21 8.3a6.9 6.9 0 01-4.2-1.4v7.1a6.4 6.4 0 11-5.5-6.3v2.9a3.6 3.6 0 103 3.6V2h2.5a6.9 6.9 0 006.2 6.3z"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M18.9 2H21l-6.6 7.5L22 22h-6.8l-5.3-6.8L3.8 22H2l7-8-6.5-8H9l4.8 6.1L18.9 2zm-3.2 18h3.6L8.5 4H4.7l11 16z"/></svg>`
};

// [STORE CONFIG] construye la tira de redes si hay contenedor #social-strip
function renderSocialStrip(cfg) {
  try {
    const wrap = document.getElementById('social-strip');
    if (!wrap) return;

    const socials = cfg?.socials || {};

    // [SOCIAL LABEL FIX] brand-correct names
    const LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X', twitter: 'X' };

    // [URL SANITIZE] only keep safe http/https links
    const entries = [
      ['instagram', socials.instagram],
      ['facebook',  socials.facebook],
      ['tiktok',    socials.tiktok],
      ['x',         socials.x || socials.twitter],
    ]
      .map(([k, u]) => [k, safeURL(u)])     // normalize/validate
      .filter(([, u]) => !!u);              // drop invalid/empty

    if (!entries.length) {
      wrap.style.display = 'none';
      return;
    }

    // build chips
    wrap.innerHTML = '';
    wrap.style.display = 'flex';

    entries.forEach(([key, href]) => {
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'social-link';                 // styles come from CSS
      a.dataset.platform = key;                    // (useful for future tweaks)

      // final label (fallback = capitalize)
      const label = LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1));

      // [A11Y] label+title
      a.setAttribute('aria-label', label);
      a.title = label;

      // icon + text (SVG falls back to empty string if not found)
      const svg = (SOCIAL_SVGS && SOCIAL_SVGS[key]) ? SOCIAL_SVGS[key] : '';
      a.innerHTML = `
        <span class="social-icon" aria-hidden="true">${svg}</span>
        <span class="social-text">${label}</span>
      `;

      wrap.appendChild(a);
    });
  } catch (_) {
    // swallow to avoid breaking the rest of the page
  }
}
/* ────────────────────────────────────────────────────────────
   [THEME FROM CONFIG NEW]
   Sobrescribe variables CSS a partir de cfg.ui
   y actualiza meta theme-color.
   ──────────────────────────────────────────────────────────── */
/* ────────────────────────────────────────────────────────────
   [THEME FROM CONFIG NEW]
   Sobrescribe variables CSS a partir de cfg.ui
   y actualiza meta theme-color.
   + Lee imagen de cabecera desde config (opcional)
   ──────────────────────────────────────────────────────────── */
   function applyThemeFromConfig(cfg) {
    try {
      const ui = cfg?.ui || {};
      const rootStyle = document.documentElement.style;
  
      // Colores base (igual que antes)
      const primary    = ui.primary || ui.accentColor || '#2563eb';
      const primary600 = ui.primary600 || '#1e4fd6';
      const success    = ui.success || '#22c55e';
      const success600 = ui.success600 || '#16a34a';
  
      rootStyle.setProperty('--primary', primary);
      rootStyle.setProperty('--primary-600', primary600);
      rootStyle.setProperty('--success', success);
      rootStyle.setProperty('--success-600', success600);
  
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.setAttribute('content', primary);
  
      /* ──────────────────────────────────────────────────────
         [HEADER IMAGE NEW]
         Si viene una imagen en cfg.ui.headerImage, activamos
         el fondo con foto y opcionalmente un overlay y color
         de texto. Si NO viene, volvemos al gradiente default.
         ────────────────────────────────────────────────────── */
      const headerImage   = ui.headerImage || ui.headerBackground || null;    // e.g. "/img/headers/fondo.jpg"
      const headerOverlay = ui.headerOverlay ?? 'rgba(0,0,0,.25)';            // opcional
      const headerText    = ui.headerText ?? '#ffffff';                       // opcional
  
      const siteHeader = document.querySelector('.site-header');
  
      if (headerImage) {
        // Variables que usa el CSS para renderizar ::before/::after
        rootStyle.setProperty('--header-image', `url('${headerImage}')`);     /* [HEADER IMAGE NEW] */
        rootStyle.setProperty('--header-overlay', headerOverlay);             /* [HEADER IMAGE NEW] */
        rootStyle.setProperty('--header-text', headerText);                   /* [HEADER IMAGE NEW] */
  
        if (siteHeader) siteHeader.classList.add('header-has-image');         /* [HEADER IMAGE NEW] */
      } else {
        // Limpia cualquier estado previo para volver al gradiente
        rootStyle.removeProperty('--header-image');                           /* [HEADER IMAGE NEW] */
        rootStyle.removeProperty('--header-overlay');                         /* [HEADER IMAGE NEW] */
        rootStyle.removeProperty('--header-text');                            /* [HEADER IMAGE NEW] */
  
        if (siteHeader) siteHeader.classList.remove('header-has-image');      /* [HEADER IMAGE NEW] */
      }
    } catch {}
  }

function applyStoreConfig(cfg) { if (!cfg) return;

  // 1) Branding (title, nombre, emoji, logo)
  try {
    const name = cfg.company?.name || 'Mi Empresa';
    const emoji = cfg.company?.brandEmoji || '🛒';
    const logoSrc = cfg.company?.logoUrl || cfg.company?.logo;

    document.title = `Tienda de Productos - ${name}`;

    const brandNameEl = document.getElementById('brand-name');
    if (brandNameEl) brandNameEl.textContent = name;

    const brandEmojiEl = document.getElementById('brand-emoji');
    if (brandEmojiEl) brandEmojiEl.textContent = emoji;

    const brandLogoEl = document.getElementById('brand-logo');
    if (brandLogoEl) {
      if (logoSrc) {
        brandLogoEl.src = logoSrc;
        brandLogoEl.alt = `${name} logo`;
        brandLogoEl.style.display = 'inline-block'; // [BRAND PATCH]
      } else {
        brandLogoEl.style.display = 'none';
      }
    }

    const brandTextEl = document.querySelector('.brand');
    if (brandTextEl && !brandNameEl) {
      brandTextEl.textContent = `${emoji} ${name}`;
    }
  } catch {}

  // [THEME FROM CONFIG NEW] aplicar variables de color
  applyThemeFromConfig(cfg);

  // 2) Horario de recolección
  try {
    const open = cfg.businessHours?.open;
    const close = cfg.businessHours?.close;
    const timeInput = document.getElementById('hora-recoleccion');
    if (timeInput && open && close) {
      timeInput.min = open;
      timeInput.max = close;
      if (!timeInput.value) timeInput.value = open;

      const help = document.getElementById('hora-ayuda');
      if (help) help.innerHTML = `Formato <strong>HH:MM</strong>. Rango: ${open}–${close}.`;
      timeInput.setAttribute('title', `Ingresa una hora válida entre ${open} y ${close}`);
    }
  } catch {}

  // 3) Contacto (tarjeta de carrito y footer)
  try {
    const addr = cfg.company?.address || '—';
    const phone = cfg.contacts?.phone || '';
    const waRaw = cfg.contacts?.whatsapp || '';

    // Mostrar dirección
    const contactAddr = document.getElementById('contact-address');
    if (contactAddr) contactAddr.textContent = addr;
    const footerAddr = document.getElementById('footer-address');
    if (footerAddr) footerAddr.textContent = addr;

    // Teléfono (tel:) — oculto en la tienda
    const telHref = phone ? `tel:${String(phone).replace(/\s+/g, '')}` : '#';
    const contactPhone = document.getElementById('contact-phone');
    if (contactPhone) { contactPhone.href = telHref; contactPhone.style.display = 'none'; }
    const footerPhone = document.getElementById('footer-phone');
    if (footerPhone) { footerPhone.href = telHref; footerPhone.style.display = 'none'; }

    // WhatsApp (wa.me) — oculto; se usa solo el botón verde
    const waDigits = String(waRaw || phone || '').replace(/\D+/g, '');
    const waHref = waDigits ? `https://wa.me/${waDigits}` : '#';
    const contactWA = document.getElementById('contact-whatsapp');
    if (contactWA) { contactWA.href = waHref; contactWA.style.display = 'none'; }
    const footerWA = document.getElementById('footer-whatsapp');
    if (footerWA) { footerWA.href = waHref; footerWA.style.display = 'none'; }

    const btn = document.getElementById('btn-whatsapp-pedido');
    if (btn && waDigits) btn.dataset.phone = waDigits;
  } catch {}

  // 4) Redes sociales (header y footer)
  try {
    const socials = cfg.socials || {};
    const pairs = [
      // header
      ['social-instagram', socials.instagram],
      ['social-facebook',  socials.facebook],
      ['social-tiktok',    socials.tiktok],
      // footer
      ['footer-instagram', socials.instagram],
      ['footer-facebook',  socials.facebook],
      ['footer-tiktok',    socials.tiktok],
    ];
    pairs.forEach(([id, url]) => {
      const a = document.getElementById(id);
      if (!a) return;

      if (url) {
        const clean = safeURL(url);
        a.href = clean || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        // [SOCIAL ICONS PATCH] asegura ícono inline incluso si no hay /img/*.svg
        let platform = '';
        if (/instagram/i.test(id)) platform = 'instagram';
        else if (/facebook/i.test(id)) platform = 'facebook';
        else if (/tiktok/i.test(id)) platform = 'tiktok';

        if (platform) {
          let iconEl = a.querySelector('.social-icon');
          if (!iconEl) {
            iconEl = document.createElement('span');
            iconEl.className = 'social-icon';
            a.insertAdjacentElement('afterbegin', iconEl);
          }
          // si el span no tiene SVG dentro, lo inyectamos
          if (!iconEl.querySelector('svg')) {
            iconEl.innerHTML = SOCIAL_SVGS[platform] || '';
          }
          if (!a.getAttribute('aria-label')) {
            a.setAttribute('aria-label', platform.charAt(0).toUpperCase() + platform.slice(1));
          }
        }

        a.style.pointerEvents = '';
        a.style.opacity = '';
      } else {
        a.href = '#';
        a.removeAttribute('target');
        a.removeAttribute('rel');
        a.style.pointerEvents = 'none';
        a.style.opacity = '0.35';
      }
    });
  } catch {}
}

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
// [AUTH NEW] UI refs & helpers
// ─────────────────────────────────────────────────────────────
const AUTH_TOKEN_KEY = 'AUTH_TOKEN_V1';
const authModal = $('#auth-modal');
const btnOpenLogin = $('#btn-open-login');
const btnOpenSignup = $('#btn-open-signup');
const btnLogout = $('#btn-logout');
const authUserBadge = $('#auth-user-badge');
const authModalClose = $('#auth-modal-close');
const tabLogin = $('#tab-login');
const tabSignup = $('#tab-signup');
const formLogin = $('#form-login');
const formSignup = $('#form-signup');
const toastEl = $('#toast');

// [AUTH NEW] mini-toast
function showToast(msg, ms = 2800) {
  if (!toastEl) return alert(msg);
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  setTimeout(() => (toastEl.style.display = 'none'), ms);
}

// [AUTH NEW] token helpers
function getAuthToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || null; } catch { return null; }
}
function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {}
}
async function fetchAuth(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const token = getAuthToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(url, { ...opts, headers });
}

// [AUTH NEW] actualizar barra de usuario
function updateAuthUI(user) {
  const isLogged = !!(user && (user.name || user.email));
  if (isLogged) {
    authUserBadge.style.display = 'inline-flex';
    authUserBadge.textContent = `Hola, ${user.name || user.email}`;
    btnLogout.style.display = '';
    btnOpenLogin.style.display = 'none';
    btnOpenSignup.style.display = 'none';
    if (user.name && nombreClienteInput && !nombreClienteInput.value) nombreClienteInput.value = user.name;
    if (user.email && emailClienteInput && !emailClienteInput.value) emailClienteInput.value = user.email;
  } else {
    authUserBadge.style.display = 'none';
    authUserBadge.textContent = '';
    btnLogout.style.display = 'none';
    btnOpenLogin.style.display = '';
    btnOpenSignup.style.display = '';
  }
}

// [AUTH NEW] abrir/cerrar modal + tabs
function openAuthModal(mode = 'login') {
  if (!authModal) return;
  authModal.style.display = 'block';
  switchTab(mode);
}
function closeAuthModal() { if (authModal) authModal.style.display = 'none'; }
function switchTab(mode) {
  if (!tabLogin || !tabSignup || !formLogin || !formSignup) return;
  if (mode === 'signup') {
    tabSignup.setAttribute('aria-selected', 'true');
    tabLogin.setAttribute('aria-selected', 'false');
    formSignup.style.display = '';
    formLogin.style.display = 'none';
  } else {
    tabLogin.setAttribute('aria-selected', 'true');
    tabSignup.setAttribute('aria-selected', 'false');
    formLogin.style.display = '';
    formSignup.style.display = 'none';
  }
}

// [AUTH NEW] UI: “¿Olvidaste tu contraseña?”
(function addForgotLink() {
  if (!formLogin) return;
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'btn-link';
  link.textContent = '¿Olvidaste tu contraseña?';
  link.style.marginTop = '8px';
  link.addEventListener('click', async () => {
    const email = prompt('Ingresa tu correo para restablecer la contraseña:');
    if (!email) return;
    if (!EMAIL_RE.test(email)) return showToast('Correo inválido.');
    try {
      const r = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'No se pudo enviar el correo.');
      showToast('Si el correo existe, se enviaron instrucciones.');
    } catch (e) {
      showToast(e.message || 'No se pudo procesar la solicitud.');
    }
  });
  formLogin.appendChild(link);
})();

// ─────────────────────────────────────────────────────────────
// reCAPTCHA v3 helper
// ─────────────────────────────────────────────────────────────
async function getRecaptchaToken(action = 'checkout') {
  return new Promise((resolve) => {
    try {
      if (!window.grecaptcha || !window.RECAPTCHA_SITE_KEY) {
        resolve(null); return;
      }
      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(window.RECAPTCHA_SITE_KEY, { action })
          .then((token) => resolve(token))
          .catch(() => resolve(null));
      });
    } catch (_) { resolve(null); }
  });
}

// Persistencia ligera
function guardarCarrito() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(CARRITO)); } catch {} }
function cargarCarrito() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    CARRITO = raw ? JSON.parse(raw) : [];
  } catch { CARRITO = []; }
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
  if (existente) existente.cantidad += 1;
  else CARRITO.push({ ...prod, cantidad: 1 });
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
  } catch {
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
          agregarAlCarrito({ id, nombre: prod.nombre, precio: Number(prod.precio) });
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
// [AUTH NEW] Listeners de autenticación
// ─────────────────────────────────────────────────────────────
if (btnOpenLogin) btnOpenLogin.addEventListener('click', () => openAuthModal('login'));
if (btnOpenSignup) btnOpenSignup.addEventListener('click', () => openAuthModal('signup'));
if (authModalClose) authModalClose.addEventListener('click', closeAuthModal);
if (tabLogin) tabLogin.addEventListener('click', () => switchTab('login'));
if (tabSignup) tabSignup.addEventListener('click', () => switchTab('signup'));

if (btnLogout) btnLogout.addEventListener('click', () => {
  setAuthToken(null);
  updateAuthUI(null);
  showToast('Sesión cerrada.');
});

// Login
if (formLogin) {
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#login-email')?.value.trim();
    const password = $('#login-password')?.value;
    if (!email || !password) return showToast('Completa correo y contraseña.');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'No se pudo iniciar sesión.');
      setAuthToken(j.token);
      updateAuthUI(j.user);
      closeAuthModal();
      showToast('¡Bienvenido!');
    } catch (err) {
      showToast(err.message || 'Error de login.');
    }
  });
}

// Signup
if (formSignup) {
  formSignup.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#signup-name')?.value.trim();
    const email = $('#signup-email')?.value.trim();
    const password = $('#signup-password')?.value;
    const marketingOptIn = $('#signup-optin')?.checked ?? true;
    if (!email || !password) return showToast('Correo y contraseña son requeridos.');
    if (!EMAIL_RE.test(email)) return showToast('Correo inválido.');
    if (String(password).length < 6) return showToast('Mínimo 6 caracteres.');

    try {
      const r = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, marketingOptIn }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || 'No se pudo registrar.');
      setAuthToken(j.token);
      updateAuthUI(j.user);
      closeAuthModal();
      showToast('Cuenta creada. ¡Bienvenido!');
    } catch (err) {
      showToast(err.message || 'Error al crear cuenta.');
    }
  });
}

// ─────────────────────────────────────────────────────────────
// [AUTH RESET FRONT] Soporte para reset-password.html
// ─────────────────────────────────────────────────────────────
(function initResetPasswordPage() {
  const isResetPath = /\/reset-password\.html$/i.test(window.location.pathname);
  const resetForm = document.getElementById('reset-password-form') || document.getElementById('rp-form');
  if (!isResetPath && !resetForm) return;

  const emailInput = document.getElementById('rp-email') || document.getElementById('reset-email');
  const pass1Input = document.getElementById('rp-password') || document.getElementById('reset-password');
  const pass2Input = document.getElementById('rp-password-2') || document.getElementById('reset-password-2');

  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get('token') || '';
  const emailFromUrl = params.get('email') || '';   // [FIX RESET TYPO] ← corregido

  if (emailInput && emailFromUrl) emailInput.value = emailFromUrl;

  if (resetForm) {
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (emailInput?.value || '').trim();
      const p1 = pass1Input?.value || '';
      const p2 = pass2Input?.value || '';

      if (!EMAIL_RE.test(email)) return showToast('Correo inválido.');
      if (!tokenFromUrl) return showToast('Token no encontrado en el enlace.');
      if (p1.length < 6) return showToast('La nueva contraseña debe tener al menos 6 caracteres.');
      if (p1 !== p2) return showToast('Las contraseñas no coinciden.');

      try {
        const r = await fetch('/api/auth/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, token: tokenFromUrl, newPassword: p1 }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.message || 'No se pudo actualizar la contraseña.');
        showToast('Contraseña actualizado. Ya puedes iniciar sesión.');
        setTimeout(() => { window.location.href = '/'; }, 1200);
      } catch (err) {
        showToast(err.message || 'Error al restablecer contraseña.');
      }
    });
  }
})();

// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // [STORE CONFIG NEW] Cargar config de tienda antes de cualquier otra cosa UI
  STORE_CONFIG = await loadStoreConfig();
  applyStoreConfig(STORE_CONFIG);

  // [SOCIAL STRIP NEW] construir la franja de redes (si existe contenedor)
  renderSocialStrip(STORE_CONFIG);

  cargarCarrito();

  // [AUTH NEW] cargar sesión si hay token
  try {
    const token = getAuthToken();
    if (token) {
      const r = await fetchAuth('/api/auth/me');
      const j = await r.json();
      if (r.ok && j?.success) {
        updateAuthUI(j.user);
      } else {
        setAuthToken(null);
        updateAuthUI(null);
      }
    } else {
      updateAuthUI(null);
    }
  } catch { updateAuthUI(null); }

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