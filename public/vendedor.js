// public/vendedor.js

// -------------------------------------------------------------
// Referencias (se conservan los mismos IDs/variables)
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

let currentOrderId = null;
let allOrders = []; // [ADMIN FILTER NEW] cache global para filtrar/exportar

// [ADMIN CSV FIX] helper para querySelectorAll (faltaba en este archivo)
const $$ = (sel) => document.querySelectorAll(sel);

// -------------------------------------------------------------
// Utilidades de UI/formatos
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
  switch (status) {
    case 'LISTO PARA RECOGER': return '#16a34a';
    case 'EN PROCESO': return '#0ea5e9';
    case 'PENDIENTE DE PAGO': return '#a16207';
    case 'COMPLETADO': return '#0f766e';
    case 'CANCELADO': return '#ef4444';
    default: return '#64748b';
  }
}

function badgeClasePorEstado(status) {
  const s = String(status || '').toUpperCase();
  if (s.includes('CANCEL')) return 'badge-cancelado';
  if (s.includes('COMPLET')) return 'badge-completado';
  if (s.includes('LISTO')) return 'badge-listo';
  if (s.includes('PROCESO')) return 'badge-proceso';
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
// 1) Historial de órdenes (listado)
// -------------------------------------------------------------
async function listarOrdenes() {
  try {
    ordenesTbody.innerHTML = `
      <tr><td colspan="5" style="padding:14px; color:#667085;">Cargando órdenes…</td></tr>
    `;
    const response = await fetch('/api/ordenes/todas');
    const result = await response.json();

    if (result.success) {
      ordenesTbody.innerHTML = '';
      allOrders = result.ordenes || []; // [ADMIN FILTER NEW]
      renderOrdenes(allOrders);
    } else {
      ordenesTbody.innerHTML = '<tr><td colspan="5">Error al cargar las órdenes.</td></tr>';
    }
  } catch (error) {
    console.error('Error listarOrdenes:', error);
    ordenesTbody.innerHTML = '<tr><td colspan="5">Error de conexión con el servidor.</td></tr>';
  }
}

// [ADMIN FILTER NEW] Renderizar tabla con filtros aplicados
function renderOrdenes(list) {
  ordenesTbody.innerHTML = '';
  if (!list.length) {
    ordenesTbody.innerHTML = `<tr><td colspan="5" style="padding:14px;">Sin resultados.</td></tr>`;
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
// 2) Búsqueda y actualización
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

    const response = await fetch(`/api/orden/${encodeURIComponent(orderId)}`);
    const result = await response.json();

    if (result.success && result.orden) {
      const orden = result.orden;
      detalleId.textContent = orden.orderId;
      detalleCliente.textContent = `${orden?.cliente?.nombre || '-'} (${orden?.cliente?.email || '-'})`;
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

    const response = await fetch('/api/orden/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, nuevoStatus }),
    });
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
// 3) Carga de catálogo (Excel/CSV)
// -------------------------------------------------------------
formCatalogoUpload.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (catalogoMensaje) catalogoMensaje.style.display = 'block';
  mostrarMensaje('Subiendo y procesando el archivo…', 'info', catalogoMensaje);
  const formData = new FormData(formCatalogoUpload);
  try {
    const response = await fetch('/api/admin/catalogo', { method: 'POST', body: formData });
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
// [ADMIN FILTER NEW] Filtros y exportación
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

function aplicarFiltros() {
  renderOrdenes(getFilteredList());
}

// [ADMIN CSV IMPROVE] Exportar a CSV desde la lista filtrada + descarga robusta
function exportarCSV() {
  try {
    const list = getFilteredList();
    if (!list.length) {
      mostrarMensaje('No hay filas para exportar.', 'error');
      return;
    }

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
    document.body.appendChild(a);      // Safari/iOS necesita que el link esté en el DOM
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 0);
  } catch (e) {
    console.error('exportarCSV error:', e);
    mostrarMensaje('No se pudo exportar el CSV.', 'error');
  }
}

// [ADMIN FILTER NEW] Generar controles dinámicamente en la parte superior de la tabla
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

  // Eventos
  div.querySelectorAll('input, select').forEach(el => el.addEventListener('input', aplicarFiltros));
  div.querySelector('#btn-exportar-csv').addEventListener('click', exportarCSV);
}

// -------------------------------------------------------------
// Inicialización
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  listarOrdenes();
  crearControlesFiltros(); // [ADMIN FILTER NEW]

  inputOrderId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarOrden();
    }
  });
});
btnActualizarStatus.addEventListener('click', actualizarStatusOrden);
btnBuscarOrden.addEventListener('click', buscarOrden);