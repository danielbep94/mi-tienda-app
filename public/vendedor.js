// public/vendedor.js

// Referencias de la Sección de Actualización
const inputOrderId = document.getElementById('input-order-id');
const selectStatus = document.getElementById('select-status');
const btnActualizarStatus = document.getElementById('btn-actualizar-status');
const btnBuscarOrden = document.getElementById('btn-buscar-orden'); 
const statusMensajeDiv = document.getElementById('status-mensaje');
const detalleOrdenBuscadaDiv = document.getElementById('detalle-orden-buscada');

// Referencias de la Sección de Listado
const ordenesTbody = document.getElementById('ordenes-tbody'); 

// Referencias de Detalle Buscado
const detalleId = document.getElementById('detalle-id');
const detalleCliente = document.getElementById('detalle-cliente');
const detalleStatus = document.getElementById('detalle-status');

let currentOrderId = null; 

function obtenerColorStatus(status) {
    switch (status) {
        case 'LISTO PARA RECOGER': return '#28a745'; // Verde
        case 'EN PROCESO': return '#007bff';        // Azul
        case 'PENDIENTE DE PAGO': return '#ffc107'; // Amarillo/Naranja
        case 'COMPLETADO': return '#6c757d';      // Gris
        case 'CANCELADO': return '#dc3545';       // Rojo
        default: return 'black';
    }
}

function mostrarMensaje(mensaje, tipo) {
    statusMensajeDiv.textContent = mensaje;
    statusMensajeDiv.style.display = 'block';
    statusMensajeDiv.style.padding = '10px';
    statusMensajeDiv.style.border = '1px solid';
    
    if (tipo === 'success') {
        statusMensajeDiv.style.backgroundColor = '#d4edda';
        statusMensajeDiv.style.color = '#155724';
    } else if (tipo === 'error') {
        statusMensajeDiv.style.backgroundColor = '#f8d7da';
        statusMensajeDiv.style.color = '#721c24';
    } else {
        statusMensajeDiv.style.backgroundColor = '#fff3cd';
        statusMensajeDiv.style.color = '#856404';
    }
}

// -------------------------------------------------------------
// Lógica de Listado
// -------------------------------------------------------------

async function listarOrdenes() {
    try {
        const response = await fetch('/api/ordenes/todas');
        const result = await response.json();

        if (result.success) {
            ordenesTbody.innerHTML = ''; 
            // Invertimos el orden para mostrar las más recientes primero
            const ordenesRecientes = result.ordenes.reverse(); 

            ordenesRecientes.forEach(orden => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${orden.orderId}</td>
                    <td>${orden.cliente.nombre}</td>
                    <td>$${orden.total}</td>
                    <td>
                        <span class="status-badge" style="background-color: ${obtenerColorStatus(orden.status)}; color: white;">
                            ${orden.status}
                        </span>
                    </td>
                    <td>${orden.fechaCreacion.split(',')[0]}</td>
                `;
                ordenesTbody.appendChild(tr);
            });
        } else {
            ordenesTbody.innerHTML = '<tr><td colspan="5">Error al cargar las órdenes.</td></tr>';
        }
    } catch (error) {
        ordenesTbody.innerHTML = '<tr><td colspan="5">Error de conexión con el servidor.</td></tr>';
    }
}

// -------------------------------------------------------------
// Lógica de Búsqueda
// -------------------------------------------------------------

async function buscarOrden() {
    const orderId = inputOrderId.value.trim();
    if (!orderId) {
        mostrarMensaje('Ingrese un ID para buscar.', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/orden/${orderId}`);
        const result = await response.json();

        if (result.success) {
            const orden = result.orden;
            
            // Llenar detalles de la orden buscada
            detalleId.textContent = orden.orderId;
            detalleCliente.textContent = `${orden.cliente.nombre} (${orden.cliente.email})`;
            detalleStatus.textContent = orden.status;
            detalleStatus.style.backgroundColor = obtenerColorStatus(orden.status);
            detalleStatus.style.color = 'white'; 
            
            detalleOrdenBuscadaDiv.style.display = 'block';
            currentOrderId = orden.orderId; 
            mostrarMensaje(`Orden ${orden.orderId} cargada. Ahora puede actualizar el estatus.`, 'info');
        } else {
            mostrarMensaje(`Orden con ID ${orderId} no encontrada.`, 'error');
            detalleOrdenBuscadaDiv.style.display = 'none';
            currentOrderId = null;
        }
    } catch (error) {
        mostrarMensaje('Error de conexión al buscar la orden.', 'error');
    }
}

// -------------------------------------------------------------
// Lógica de Actualización de Estatus
// -------------------------------------------------------------

async function actualizarStatusOrden() {
    const orderId = currentOrderId || inputOrderId.value.trim(); 
    const nuevoStatus = selectStatus.value;

    if (!orderId) {
        mostrarMensaje('Por favor, busque una orden o ingrese un ID válido.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/orden/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId, nuevoStatus })
        });

        const result = await response.json();

        if (result.success) {
            mostrarMensaje(`✅ Éxito: ${result.message}`, 'success');
            listarOrdenes(); // Recargar la lista
            inputOrderId.value = ''; // Limpiar campos
            currentOrderId = null;
            detalleOrdenBuscadaDiv.style.display = 'none';
        } else {
            mostrarMensaje(`❌ Error: ${result.message}`, 'error');
        }
    } catch (error) {
        mostrarMensaje('❌ Error de conexión al servidor.', 'error');
    }
}

// -------------------------------------------------------------
// Inicialización
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    listarOrdenes(); 
});

btnActualizarStatus.addEventListener('click', actualizarStatusOrden);
btnBuscarOrden.addEventListener('click', buscarOrden);