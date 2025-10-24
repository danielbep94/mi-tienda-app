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

// -------------------------------------------------------------
// Utilidades de UI/formatos
// -------------------------------------------------------------
function formatMoney(n) {
  const num = Number(n || 0);
  return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
}

function formatFechaCorta(fechaStr) {
  // Si viene "DD/MM/AAAA, HH:mm:ss" o "MM/DD/AAAA, ..." intentamos construir Date
  // Si falla, devolvemos el trozo de fecha previo a la coma (compatible con tu back)
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
    case 'LISTO PARA RECOGER': return '#16a34a'; // Verde
    case 'EN PROCESO': return '#0ea5e9';         // Azul
    case 'PENDIENTE DE PAGO': return '#a16207';  // Amarillo oscuro
    case 'COMPLETADO': return '#0f766e';         // Verde oscuro
    case 'CANCELADO': return '#ef4444';          // Rojo
    default: return '#64748b';                   // Gris/azulado
  }
}

// Clases de badge según estado (para estilos avanzados si pegaste el CSS sugerido)
function badgeClasePorEstado(status) {
  const s = String(status || '').toUpperCase();
  if (s.includes('CANCEL')) return 'badge-cancelado';
  if (s.includes('COMPLET')) return 'badge-completado';
  if (s.includes('LISTO')) return 'badge-listo';
  if (s.includes('PROCESO')) return 'badge-proceso';
  return 'badge-pendiente';
}

function setStatusBadge(el, statusText) {
  // Mantiene compatibilidad: color inline + clases nuevas si existen
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
  targetDiv.className = 'alert'; // conserva clase base si pegaste el CSS del panel
}

// -------------------------------------------------------------
// 1) Historial de órdenes (listado)
// -------------------------------------------------------------
async function listarOrdenes() {
  try {
    // Pre-estado: “cargando…”
    ordenesTbody.innerHTML = `
      <tr><td colspan="5" style="padding:14px; color:#667085;">Cargando órdenes…</td></tr>
    `;

    const response = await fetch('/api/ordenes/todas');
    const result = await response.json();

    if (result.success) {
      ordenesTbody.innerHTML = '';
      // Ya vienen en orden por fecha desc desde el back; si no, puedes invertir:
      // const ordenes = result.ordenes.slice().reverse();
      const ordenes = result.ordenes || [];

      if (!ordenes.length) {
        ordenesTbody.innerHTML = `
          <tr><td colspan="5" style="padding:14px; color:#667085;">No hay órdenes todavía.</td></tr>
        `;
        return;
      }

      ordenes.forEach((orden) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${orden.orderId}</td>
          <td>${orden?.cliente?.nombre || '-'}</td>
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
    } else {
      ordenesTbody.innerHTML = '<tr><td colspan="5">Error al cargar las órdenes.</td></tr>';
    }
  } catch (error) {
    console.error('Error listarOrdenes:', error);
    ordenesTbody.innerHTML = '<tr><td colspan="5">Error de conexión con el servidor.</td></tr>';
  }
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
      mostrarMensaje(`Orden ${orden.orderId} cargada. Ahora puedes actualizar el estatus.`, 'success');
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

  if (!orderId) {
    mostrarMensaje('Por favor, busque una orden o ingrese un ID válido.', 'error');
    return;
  }

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
      mostrarMensaje(`✅ Éxito: ${result.message}`, 'success');
      // Si estabas mostrando detalles, actualiza la badge
      setStatusBadge(detalleStatus, nuevoStatus);
      // Refresca historial
      listarOrdenes();
      // Limpia búsqueda para el siguiente flujo
      inputOrderId.value = '';
      currentOrderId = null;
      detalleOrdenBuscadaDiv.style.display = 'none';
    } else {
      mostrarMensaje(`❌ Error: ${result.message}`, 'error');
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
  if (catalogoMensaje) {
    catalogoMensaje.style.display = 'block';
  }
  mostrarMensaje('Subiendo y procesando el archivo…', 'info', catalogoMensaje);

  const formData = new FormData(formCatalogoUpload);

  try {
    const response = await fetch('/api/admin/catalogo', {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      mostrarMensaje(`✅ ${result.message} ¡Inventario actualizado!`, 'success', catalogoMensaje);
      // (Opcional) refrescar historial aunque afecte inventario:
      listarOrdenes();
      // Limpia el input file para evitar reenvío accidental
      formCatalogoUpload.reset();
    } else {
      mostrarMensaje(`❌ Error en la carga: ${result.message}`, 'error', catalogoMensaje);
    }
  } catch (error) {
    console.error('Error de subida:', error);
    mostrarMensaje('❌ Error de red al subir el archivo.', 'error', catalogoMensaje);
  }
});

// -------------------------------------------------------------
// Inicialización y eventos
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  listarOrdenes();

  // Enter en el campo de búsqueda
  inputOrderId.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarOrden();
    }
  });
});

btnActualizarStatus.addEventListener('click', actualizarStatusOrden);
btnBuscarOrden.addEventListener('click', buscarOrden);