// public/vendedor.js

// Referencias de la Sección de Actualización
const inputOrderId = document.getElementById('input-order-id');
const selectStatus = document.getElementById('select-status');
const btnActualizarStatus = document.getElementById('btn-actualizar-status');
const btnBuscarOrden = document.getElementById('btn-buscar-orden'); 
const statusMensajeDiv = document.getElementById('status-mensaje');
const detalleOrdenBuscadaDiv = document.getElementById('detalle-orden-buscada');
const formCatalogoUpload = document.getElementById('form-catalogo-upload'); // Nuevo
const catalogoMensaje = document.getElementById('catalogo-mensaje');       // Nuevo

// Referencias de la Sección de Listado
const ordenesTbody = document.getElementById('ordenes-tbody'); 

// Referencias de Detalle Buscado
const detalleId = document.getElementById('detalle-id');
const detalleCliente = document.getElementById('detalle-cliente');
const detalleStatus = document.getElementById('detalle-status');

let currentOrderId = null; 

// -------------------------------------------------------------
// Funciones Auxiliares
// -------------------------------------------------------------

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

function mostrarMensaje(mensaje, tipo, targetDiv = statusMensajeDiv) {
    targetDiv.textContent = mensaje;
    targetDiv.style.display = 'block';
    targetDiv.style.border = '1px solid';
    targetDiv.style.color = 'white'; 
    
    if (tipo === 'success') {
        targetDiv.style.backgroundColor = '#28a745'; // Usamos un verde oscuro para que se lea mejor sobre fondo blanco
        targetDiv.style.color = 'white';
    } else if (tipo === 'error') {
        targetDiv.style.backgroundColor = '#dc3545'; // Rojo
        targetDiv.style.color = 'white';
    } else {
        targetDiv.style.backgroundColor = '#f0ad4e'; // Naranja (info/warning)
        targetDiv.style.color = 'white';
    }
}

// -------------------------------------------------------------
// 1. Lógica de Historial (Listado)
// -------------------------------------------------------------

async function listarOrdenes() {
    try {
        const response = await fetch('/api/ordenes/todas');
        const result = await response.json();

        if (result.success) {
            ordenesTbody.innerHTML = ''; 
            const ordenesRecientes = result.ordenes.reverse(); 

            ordenesRecientes.forEach(orden => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${orden.orderId}</td>
                    <td>${orden.cliente.nombre}</td>
                    <td>$${orden.total}</td>
                    <td>
                        <span class="status-badge" style="background-color: ${obtenerColorStatus(orden.status)};">
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
// 2. Lógica de Búsqueda y Actualización
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
            
            detalleOrdenBuscadaDiv.style.display = 'block';
            currentOrderId = orden.orderId; 
            mostrarMensaje(`Orden ${orden.orderId} cargada. Ahora puede actualizar el estatus.`, 'success');
        } else {
            mostrarMensaje(`Orden con ID ${orderId} no encontrada.`, 'error');
            detalleOrdenBuscadaDiv.style.display = 'none';
            currentOrderId = null;
        }
    } catch (error) {
        mostrarMensaje('Error de conexión al buscar la orden.', 'error');
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
// 3. Lógica de Carga de Catálogo (Excel)
// -------------------------------------------------------------

formCatalogoUpload.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    mostrarMensaje('Subiendo y procesando el archivo Excel...', 'info', catalogoMensaje);

    const formData = new FormData(formCatalogoUpload);

    try {
        const response = await fetch('/api/admin/catalogo', {
            method: 'POST',
            body: formData, 
        });

        const result = await response.json();

        if (result.success) {
            mostrarMensaje(`✅ ${result.message} ¡Inventario actualizado!`, 'success', catalogoMensaje);
            // Recargar la lista de órdenes, aunque el cambio está en el catálogo, es buena práctica.
            listarOrdenes(); 
        } else {
            mostrarMensaje(`❌ Error en la carga: ${result.message}`, 'error', catalogoMensaje);
        }
    } catch (error) {
        mostrarMensaje('❌ Error de red al subir el archivo.', 'error', catalogoMensaje);
        console.error('Error de subida:', error);
    }
});


// -------------------------------------------------------------
// Inicialización
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    listarOrdenes(); 
});

btnActualizarStatus.addEventListener('click', actualizarStatusOrden);
btnBuscarOrden.addEventListener('click', buscarOrden);