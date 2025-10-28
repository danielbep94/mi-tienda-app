// public/vendedor.js
// =============================================================
// ADMIN PANEL – with JWT auth headers + admin guard
// (ADDED) everything new is marked with  [ADMIN GATE NEW]
// (FIXED) wrapped in IIFE to avoid global collisions [ADMIN GATE FIX]
// (SYNC) read token from window.__ADMIN_TOKEN__ too [ADMIN SYNC NEW]
// (RETRY) auto-recheck when token appears [ADMIN RETRY NEW]
// =============================================================
(() => {
    // -------------------------------------------------------------
    // (ADDED) Auth helpers  [ADMIN GATE NEW]
    // -------------------------------------------------------------
    // [ADMIN GATE FIX] use a local-scoped key name and fall back to window.AUTH_TOKEN_KEY if present
    const ADMIN_AUTH_TOKEN_KEY = 'AUTH_TOKEN_V1';
  
    // [ADMIN SYNC NEW] prefer the token provided by the gate (window.__ADMIN_TOKEN__),
    // then fall back to localStorage using the shared key (window.AUTH_TOKEN_KEY or default)
    function getAuthToken() {
      try {
        if (typeof window !== 'undefined' && window.__ADMIN_TOKEN__) {
          return window.__ADMIN_TOKEN__;
        }
        const k =
          (typeof window !== 'undefined' && window.AUTH_TOKEN_KEY) ||
          ADMIN_AUTH_TOKEN_KEY;
        return localStorage.getItem(k) || null;
      } catch {
        return null;
      }
    }
  
    async function fetchAuth(url, opts = {}) {
      const headers = new Headers(opts.headers || {});
      const token = getAuthToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      // only set JSON when body is plain object (not FormData)
      if (!headers.has('Content-Type') && !(opts.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
      return fetch(url, { ...opts, headers });
    }
  
    // Utility to build a button element
    function makeButton(label, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-primary';
      b.style.marginLeft = '10px';
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    }
  
    // (ADDED) Show a friendly blocker when not authorized  [ADMIN GATE NEW]
    function showBlocked(reason = 'No autorizado.', withRetry = false) {
      // [TWEAK] avoid duplicating the soft-block element
      const existing = document.getElementById('admin-soft-block');  /* [NEW] */
      if (existing) existing.remove();                               /* [NEW] */
  
      const blocker = document.createElement('div');
      blocker.id = 'admin-soft-block';
      blocker.style.cssText = `
        max-width: 820px; margin: 24px auto; padding: 16px; border-radius: 12px;
        background:#fff7e6; border:1px solid #f0ad4e; color:#7a4e00; font-weight:600;
      `;
      blocker.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:1.2rem;">🔒</span>
          <div>
            <div>${reason}</div>
            <div style="margin-top:6px; font-weight:500;">
              Abre el diálogo de inicio de sesión del panel y vuelve a intentarlo.
            </div>
          </div>
        </div>
      `;
      const host = document.querySelector('.admin-container');
      if (host) {
        host.prepend(blocker);
        if (withRetry) {
          blocker.appendChild(
            makeButton('Reintentar', async () => {
              blocker.remove();
              try {
                await assertAdmin();
                // if passes now, continue normal boot
                crearControlesFiltros();
                listarOrdenes();
              } catch {
                // ignore; blocker will be shown again by caller if needed
              }
            })
          );
        }
      }
    }
  
    // (ADDED) Guard: verify session and admin access before loading panel  [ADMIN GATE NEW]
    async function assertAdmin() {
      const token = getAuthToken();
      if (!token) {
        showBlocked('No hay sesión activa.', true /*withRetry*/);
        throw new Error('no-session');
      }
      const r = await fetchAuth('/api/auth/me');
      if (!r.ok) {
        showBlocked('Tu sesión no es válida o expiró.', true /*withRetry*/);
        throw new Error('me-failed');
      }
      // If /api/auth/me ever returns isAdmin, you can enforce it here:
      // const j = await r.json();
      // if (!j?.isAdmin) { showBlocked('No tienes permisos de administrador.'); throw new Error('not-admin'); }
    }
  
    // -------------------------------------------------------------
    // DOM references (existing)
    // -------------------------------------------------------------
    const inputOrderId = document.getElementById('input-order-id');
    const selectStatus = document.getElementById('select-status');
    const btnActualizarStatus = document.getElementById('btn-actualizar-status');
    const btnBuscarOrden = document.getElementById('btn-buscar-orden');
    const statusMensajeDiv = document.getElementById('status-mensaje');
    const detalleOrdenBuscadaDiv = document.getElementById('detalle-orden-buscada');
  
    const formCatalogoUpload = document.getElementById('form-catalogo-upload');
    const catalogoMensaje = document.getElementById('catalogo-mensaje');
  
    const ordenesTbody = document.getElementById('ordenes-tbody');
  
    const detalleId = document.getElementById('detalle-id');
    const detalleCliente = document.getElementById('detalle-cliente');
    const detalleStatus = document.getElementById('detalle-status');
    const detalleEmail = document.getElementById('detalle-email');  /* [NEW] fill separate Email span */
  
    let currentOrderId = null;
    let allOrders = [];
    const $$ = (sel) => document.querySelectorAll(sel);
  
    // -------------------------------------------------------------
    // Store config (unchanged, except tiny fix)
    // -------------------------------------------------------------
    async function loadStoreConfig() {
      try {
        const resp = await fetch(`/config/store-config.json?_=${Date.now()}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const cfg = await resp.json();
        applyStoreConfig(cfg);
      } catch (e) {
        console.warn('[STORE CONFIG] No se pudo cargar store-config.json:', e?.message);
      }
    }
    function applyStoreConfig(cfg) {
      if (!cfg || typeof cfg !== 'object') return;
      const company  = cfg.company  || {};
      const contacts = cfg.contacts || {};
      const socials  = cfg.socials  || {};
      const ui       = cfg.ui       || {};
  
      const name    = company.name || 'Mi Tienda';
      const emoji   = company.brandEmoji || '🛒';
      const logoSrc = company.logo || null;
  
      try { document.title = `${name} — Panel de Vendedor`; } catch {}
  
      const nameEl  = document.getElementById('brand-name');
      const emojiEl = document.getElementById('brand-emoji');
      const logoEl  = document.getElementById('brand-logo');
  
      if (nameEl)  nameEl.textContent  = `${name} — Panel de Gestión de Órdenes`;
      if (emojiEl) emojiEl.textContent = emoji;
      if (logoEl && logoSrc) {
        logoEl.src = logoSrc;
        logoEl.alt = name;
        logoEl.style.display = 'inline-block';
      }
  
      const ig = document.getElementById('ig-link');
      const fb = document.getElementById('fb-link');
      const tt = document.getElementById('tt-link');   /* [FIX] typo: 'the tt' -> 'const tt' */
      const wa = document.getElementById('wa-link');
      const socialBar = document.getElementById('social-bar');
  
      let hasAny = false;
      if (ig && socials.instagram) { ig.href = socials.instagram; ig.style.display = 'inline-flex'; hasAny = true; }
      if (fb && socials.facebook)  { fb.href = socials.facebook;  fb.style.display = 'inline-flex'; hasAny = true; }
      if (tt && socials.tiktok)    { tt.href = socials.tiktok;    tt.style.display = 'inline-flex'; hasAny = true; }
      if (wa && contacts.whatsapp) { wa.href = `https://wa.me/${String(contacts.whatsapp).replace(/\D+/g,'')}`; wa.style.display = 'inline-flex'; hasAny = true; }
      if (socialBar && hasAny) socialBar.style.display = 'flex';
  
      const contactPieces = [
        company.address ? `📍 ${company.address}` : '',
        contacts.phone  ? `☎️ ${contacts.phone}` : '',
        contacts.whatsapp ? `💬 WhatsApp: ${contacts.whatsapp}` : ''
      ].filter(Boolean);
      const contactLineEl = document.getElementById('contact-line');
      if (contactLineEl) contactLineEl.textContent = contactPieces.join(' · ');
  
      if (ui && typeof ui === 'object') {
        const r = document.documentElement;
        if (ui.accentColor) r.style.setProperty('--primary', ui.accentColor);
        if (ui.cartColor)   r.style.setProperty('--cart-accent', ui.cartColor);
      }
    }
  
    // -------------------------------------------------------------
    // UI utils (existing)
    // -------------------------------------------------------------
    function formatMoney(n) {
      const num = Number(n || 0);
      return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
    }
    function formatFechaCorta(fechaStr) {
      if (!fechaStr) return '-';
      const soloFecha = String(fechaStr).split(',')[0]?.trim();
      const d = new Date(fechaStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
      }
      return soloFecha || fechaStr;
    }
    function obtenerColorStatus(status) {
      // [FIX] match exact label used in selects/responses: "PAGO PENDIENTE" (not "PENDIENTE DE PAGO")
      switch (status) {                                                /* [FIX] */
        case 'LISTO PARA RECOGER': return '#16a34a';
        case 'EN PROCESO': return '#0ea5e9';
        case 'PAGO PENDIENTE': return '#a16207';                       /* [FIX] */
        case 'COMPLETADO': return '#0f766e';
        case 'CANCELADO': return '#ef4444';
        case 'PAGADO': return '#2563eb';                               /* [NEW] optional color for PAGADO */
        default: return '#64748b';
      }
    }
    function badgeClasePorEstado(status) {
      const s = String(status || '').toUpperCase();
      if (s.includes('CANCEL')) return 'badge-cancelado';
      if (s.includes('COMPLET')) return 'badge-completado';
      if (s.includes('LISTO')) return 'badge-listo';
      if (s.includes('PROCESO')) return 'badge-proceso';
      if (s.includes('PAGADO')) return 'badge-proceso'; // reuse style                      /* [NEW] */
      return 'badge-pendiente';
    }
    function setStatusBadge(el, statusText) {
      el.textContent = statusText || '-';
      el.style.backgroundColor = obtenerColorStatus(statusText);
      el.className = 'status-badge ' + badgeClasePorEstado(statusText);
    }
    function mostrarMensaje(mensaje, tipo, targetDiv = statusMensajeDiv) {
      if (!targetDiv) return;
      targetDiv.textContent = mensaje;
      targetDiv.style.display = 'block';
      targetDiv.style.border = '1px solid';
      targetDiv.style.color = '#344054';
  
      if (tipo === 'success') {
        targetDiv.style.backgroundColor = '#e7f7ef';
        targetDiv.style.borderColor = '#24a148';
        targetDiv.style.color = '#054f31';
      } else if (tipo === 'error') {
        targetDiv.style.backgroundColor = '#fde7ea';
        targetDiv.style.borderColor = '#dc3545';
        targetDiv.style.color = '#7a0619';
      } else {
        targetDiv.style.backgroundColor = '#fff7e6';
        targetDiv.style.borderColor = '#f0ad4e';
        targetDiv.style.color = '#7a4e00';
      }
    }
    function ocultarMensaje(targetDiv = statusMensajeDiv) {
      if (!targetDiv) return;
      targetDiv.style.display = 'none';
      targetDiv.textContent = '';
      targetDiv.removeAttribute('style');
      targetDiv.className = 'alert';
    }
  
    // -------------------------------------------------------------
    // 1) Historial de órdenes (now uses fetchAuth)  [ADMIN GATE NEW]
    // -------------------------------------------------------------
    async function listarOrdenes() {
      try {
        ordenesTbody.innerHTML = `
          <tr><td colspan="6" style="padding:14px; color:#667085;">Cargando órdenes…</td></tr>
        `;
        const response = await fetchAuth('/api/ordenes/todas');
        if (response.status === 401 || response.status === 403) {
          ordenesTbody.innerHTML = '';
          showBlocked('No tienes permisos para ver el historial.', true);
          return;
        }
        const result = await response.json();
  
        if (result.success) {
          ordenesTbody.innerHTML = '';
          allOrders = result.ordenes || [];
          renderOrdenes(allOrders);
        } else {
          ordenesTbody.innerHTML = '<tr><td colspan="6">Error al cargar las órdenes.</td></tr>';
        }
      } catch (error) {
        console.error('Error listarOrdenes:', error);
        ordenesTbody.innerHTML = '<tr><td colspan="6">Error de conexión con el servidor.</td></tr>';
      }
    }
    function renderOrdenes(list) {
      ordenesTbody.innerHTML = '';
      if (!list.length) {
        ordenesTbody.innerHTML = `<tr><td colspan="6" style="padding:14px;">Sin resultados.</td></tr>`;
        return;
      }
      list.forEach((orden) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${orden.orderId}</td>
          <td>${orden?.cliente?.nombre || '-'}</td>
          <td>${orden?.cliente?.email || '-'}</td>
          <td>${formatMoney(orden.total)}</td>
          <td>
            <span class="status-badge ${badgeClasePorEstado(orden.status)}"
                  style="background-color:${obtenerColorStatus(orden.status)};">
              ${orden.status}
            </span>
          </td>
          <td>${formatFechaCorta(orden.fechaCreacion)}</td>
        `;
        ordenesTbody.appendChild(tr);
      });
    }
  
    // -------------------------------------------------------------
    // 2) Búsqueda y actualización (now uses fetchAuth)  [ADMIN GATE NEW]
    // -------------------------------------------------------------
    async function buscarOrden() {
      const orderId = inputOrderId.value.trim();
      if (!orderId) {
        mostrarMensaje('Ingrese un ID para buscar.', 'error');
        return;
      }
      try {
        btnBuscarOrden.disabled = true;
        btnBuscarOrden.textContent = 'Buscando…';
        ocultarMensaje();
  
        const response = await fetchAuth(`/api/orden/${encodeURIComponent(orderId)}`);
        if (response.status === 401 || response.status === 403) {
          showBlocked('No tienes permisos para buscar órdenes.', true);
          return;
        }
        const result = await response.json();
  
        if (result.success && result.orden) {
          const orden = result.orden;
          detalleId.textContent = orden.orderId;
          detalleCliente.textContent = `${orden?.cliente?.nombre || '-'}`;
          if (detalleEmail) detalleEmail.textContent = `${orden?.cliente?.email || '-'}`; /* [NEW] */
          setStatusBadge(detalleStatus, orden.status);
          detalleOrdenBuscadaDiv.style.display = 'block';
          currentOrderId = orden.orderId;
          mostrarMensaje(`Orden ${orden.orderId} cargada.`, 'success');
        } else {
          mostrarMensaje(`Orden con ID ${orderId} no encontrada.`, 'error');
          detalleOrdenBuscadaDiv.style.display = 'none';
          currentOrderId = null;
        }
      } catch (error) {
        console.error('buscarOrden error:', error);
        mostrarMensaje('Error de conexión al buscar la orden.', 'error');
      } finally {
        btnBuscarOrden.disabled = false;
        btnBuscarOrden.textContent = 'Buscar Orden';
      }
    }
  
    async function actualizarStatusOrden() {
      const orderId = currentOrderId || inputOrderId.value.trim();
      const nuevoStatus = selectStatus.value;
      if (!orderId) return mostrarMensaje('Por favor, busque una orden o ingrese un ID válido.', 'error');
  
      try {
        btnActualizarStatus.disabled = true;
        btnActualizarStatus.textContent = 'Actualizando…';
        ocultarMensaje();
  
        const response = await fetchAuth('/api/orden/status', {
          method: 'POST',
          body: JSON.stringify({ orderId, nuevoStatus }),
        });
        if (response.status === 401 || response.status === 403) {
          mostrarMensaje('No tienes permisos para actualizar estatus.', 'error');
          showBlocked('No tienes permisos para actualizar estatus.', true);
          return;
        }
        const result = await response.json();
  
        if (result.success) {
          mostrarMensaje(`✅ ${result.message}`, 'success');
          setStatusBadge(detalleStatus, nuevoStatus);
          listarOrdenes();
          inputOrderId.value = '';
          currentOrderId = null;
          detalleOrdenBuscadaDiv.style.display = 'none';
        } else {
          mostrarMensaje(`❌ ${result.message}`, 'error');
        }
      } catch (error) {
        console.error('actualizarStatusOrden error:', error);
        mostrarMensaje('❌ Error de conexión al servidor.', 'error');
      } finally {
        btnActualizarStatus.disabled = false;
        btnActualizarStatus.textContent = 'Actualizar Estatus y Notificar';
      }
    }
  
    // -------------------------------------------------------------
    // 3) Carga de catálogo (now uses fetchAuth)  [ADMIN GATE NEW]
    // -------------------------------------------------------------
    formCatalogoUpload.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (catalogoMensaje) catalogoMensaje.style.display = 'block';
      mostrarMensaje('Subiendo y procesando el archivo…', 'info', catalogoMensaje);
      const formData = new FormData(formCatalogoUpload);
      try {
        const response = await fetchAuth('/api/admin/catalogo', { method: 'POST', body: formData });
        if (response.status === 401 || response.status === 403) {
          mostrarMensaje('No tienes permisos para cargar el catálogo.', 'error', catalogoMensaje);
          return;
        }
        const result = await response.json();
        if (result.success) {
          mostrarMensaje(`✅ ${result.message}`, 'success', catalogoMensaje);
          listarOrdenes();
          formCatalogoUpload.reset();
        } else {
          mostrarMensaje(`❌ ${result.message}`, 'error', catalogoMensaje);
        }
      } catch (error) {
        console.error('Error de subida:', error);
        mostrarMensaje('❌ Error de red al subir el archivo.', 'error', catalogoMensaje);
      }
    });
  
    // -------------------------------------------------------------
    // Filters/export (unchanged except relies on allOrders)
    // -------------------------------------------------------------
    function getFilteredList() {
      const statusSel = document.getElementById('filtro-status')?.value || 'TODOS';
      const emailTerm = document.getElementById('filtro-email')?.value.trim().toLowerCase();
      const desde = document.getElementById('filtro-desde')?.value;
      const hasta = document.getElementById('filtro-hasta')?.value;
  
      let filtered = [...allOrders];
      if (statusSel !== 'TODOS') filtered = filtered.filter(o => o.status === statusSel);
      if (emailTerm) {
        filtered = filtered.filter(o =>
          (o?.cliente?.email || '').toLowerCase().includes(emailTerm) ||
          (o?.cliente?.nombre || '').toLowerCase().includes(emailTerm)
        );
      }
      if (desde) {
        const d1 = new Date(desde);
        filtered = filtered.filter(o => new Date(o.fechaCreacion) >= d1);
      }
      if (hasta) {
        const d2 = new Date(hasta);
        filtered = filtered.filter(o => new Date(o.fechaCreacion) <= d2);
      }
      return filtered;
    }
    function aplicarFiltros() { renderOrdenes(getFilteredList()); }
    function exportarCSV() {
      try {
        const list = getFilteredList();
        if (!list.length) { mostrarMensaje('No hay filas para exportar.', 'error'); return; }
        const rows = [['ID','Cliente','Email','Total','Estatus','Fecha']];
        list.forEach(o => {
          rows.push([
            o.orderId,
            o?.cliente?.nombre || '-',
            o?.cliente?.email || '-',
            Number(o.total || 0).toFixed(2),
            o.status || '-',
            formatFechaCorta(o.fechaCreacion)
          ]);
        });
        const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ordenes_${new Date().toISOString().slice(0,10)}.csv`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 0);
      } catch (e) {
        console.error('exportarCSV error:', e);
        mostrarMensaje('No se pudo exportar el CSV.', 'error');
      }
    }
    function crearControlesFiltros() {
      const tableWrap = document.querySelector('.table-wrap');
      if (!tableWrap) return;
      const div = document.createElement('div');
      div.style.marginBottom = '10px';
      div.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
          <select id="filtro-status" class="input" style="max-width:180px;">
            <option value="TODOS">Todos los Estatus</option>
            <option value="PAGO PENDIENTE">PAGO PENDIENTE</option>
            <option value="PAGADO">PAGADO</option>
            <option value="EN PROCESO">EN PROCESO</option>
            <option value="LISTO PARA RECOGER">LISTO PARA RECOGER</option>
            <option value="COMPLETADO">COMPLETADO</option>
            <option value="CANCELADO">CANCELADO</option>
          </select>
          <input type="search" id="filtro-email" placeholder="Buscar por email o nombre" class="input" style="max-width:220px;">
          <input type="date" id="filtro-desde" class="input" style="max-width:150px;">
          <input type="date" id="filtro-hasta" class="input" style="max-width:150px;">
          <button id="btn-exportar-csv" class="btn btn-success" type="button">Exportar CSV</button>
        </div>
      `;
      tableWrap.parentNode.insertBefore(div, tableWrap);
      div.querySelectorAll('input, select').forEach(el => el.addEventListener('input', aplicarFiltros));
      div.querySelector('#btn-exportar-csv').addEventListener('click', exportarCSV);
    }
  
    // -------------------------------------------------------------
    // Init – enforce admin  [ADMIN GATE NEW]
    // -------------------------------------------------------------
    async function bootIfAuthorized() {
      try {
        await assertAdmin(); // 🔒 block early if not admin/session
      } catch {
        return; // stop initializing the panel
      }
      crearControlesFiltros();
      listarOrdenes();
      inputOrderId.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); buscarOrden(); }
      });
    }
  
    document.addEventListener('DOMContentLoaded', async () => {
      await loadStoreConfig();
      await bootIfAuthorized();
    });
    btnActualizarStatus.addEventListener('click', actualizarStatusOrden);
    btnBuscarOrden.addEventListener('click', buscarOrden);
  
    // [ADMIN RETRY NEW] if token is written to localStorage from the auth modal,
    // attempt to re-run the admin check without requiring a manual refresh.
    window.addEventListener('storage', async (e) => {
      try {
        const key =
          (typeof window !== 'undefined' && window.AUTH_TOKEN_KEY) ||
          ADMIN_AUTH_TOKEN_KEY;
        if (e.key === key && e.newValue) {
          await bootIfAuthorized();
        }
      } catch {}
    });
  
  })(); // ← [ADMIN GATE FIX] end IIFE wrapper