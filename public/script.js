// public/script.js

// ─────────────────────────────────────────────────────────────
// Estado simple del carrito y Helpers
// ─────────────────────────────────────────────────────────────
let CARRITO = [];
let inventarioLocal = []; // Almacena el inventario traído de la DB
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmt = (n) => Number(n || 0).toFixed(2);

// Referencias a elementos del DOM (Manteniendo IDs originales)
const listaProductosDiv = document.getElementById('lista-productos'); 
const listaCarritoUl = document.getElementById('lista-carrito');
const totalCarritoSpan = document.getElementById('total-carrito');
const btnApartar = document.getElementById('btn-apartar-compra');
const btnWhatsapp = document.getElementById('btn-whatsapp-pedido');
const nombreClienteInput = document.getElementById('nombre-cliente');
const emailClienteInput = document.getElementById('email-cliente');
const fechaRecoleccionInput = document.getElementById('fecha-recoleccion');
const horaRecoleccionInput = document.getElementById('hora-recoleccion');


// ─────────────────────────────────────────────────────────────
// Render y Lógica del Carrito (Mejorada)
// ─────────────────────────────────────────────────────────────
function renderizarCarrito() {
    const cont = listaCarritoUl; 
    const totalEl = totalCarritoSpan;
    cont.innerHTML = '';

    if (CARRITO.length === 0) {
        cont.innerHTML = '<li>Tu carrito está vacío.</li>';
        totalEl.textContent = '0.00';
        return;
    }

    let total = 0;
    CARRITO.forEach((item, idx) => {
        const li = document.createElement('li');
        const subtotal = item.precio * item.cantidad;
        total += subtotal;

        li.innerHTML = `
            <div>
                <strong>${item.nombre}</strong><br/>
                Cantidad: 
                <input type="number" min="1" value="${item.cantidad}" data-idx="${idx}" class="carrito-cantidad" style="width:70px" />
                &nbsp;|&nbsp; Subtotal: $<span class="subtotal">${fmt(subtotal)}</span>
            </div>
            <button class="btn-eliminar" data-idx="${idx}">Eliminar</button>
        `;
        cont.appendChild(li);
    });

    totalEl.textContent = fmt(total);

    // listeners para cambiar cantidad / eliminar (Añadidos)
    $$('.carrito-cantidad').forEach((inp) => {
        inp.addEventListener('change', (e) => {
            const i = Number(e.target.dataset.idx);
            const val = Math.max(1, Number(e.target.value || 1));
            CARRITO[i].cantidad = val;
            renderizarCarrito(); 
        });
    });
    $$('.btn-eliminar').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const i = Number(e.target.dataset.idx);
            CARRITO.splice(i, 1);
            renderizarCarrito();
        });
    });
}

// Agregar producto al carrito
function agregarAlCarrito(prod) {
    const existente = CARRITO.find((p) => p.id === prod.id);
    if (existente) {
        existente.cantidad += 1;
    } else {
        // Aseguramos que el producto que agregamos sea el objeto completo de la DB
        CARRITO.push({ ...prod, cantidad: 1 }); 
    }
    renderizarCarrito();
}

// ─────────────────────────────────────────────────────────────
// Render de productos (Lectura de MongoDB)
// ─────────────────────────────────────────────────────────────
async function renderizarProductos() {
    const cont = listaProductosDiv; 
    cont.innerHTML = '<p>Cargando inventario…</p>';

    try {
        // --- LLAMADA ASÍNCRONA A MONGODB ---
        const resp = await fetch('/api/products'); 
        if (!resp.ok) {
            // Manejar error de conexión HTTP (servidor está caído)
            throw new Error(`HTTP ${resp.status}`);
        }
        const productos = await resp.json();
        inventarioLocal = productos; // Almacenamos para usar en agregarAlCarrito

        if (!Array.isArray(productos) || productos.length === 0) {
            cont.innerHTML = `<div class="productos-grid" style="grid-template-columns: 1fr;">
                <p style="color: #f0ad4e; font-weight: bold;">No hay productos disponibles por el momento.</p>
                <small>Tip: El administrador puede subir el catálogo en /vendedor.html.</small>
            </div>`;
            return;
        }

        // Pintar catálogo (cards)
        cont.innerHTML = '';
        productos.forEach((p) => {
            const card = document.createElement('div');
            card.className = 'producto-card';
            card.innerHTML = `
                <h3>${p.nombre}</h3>
                <p>${p.descripcion || ''}</p>
                <p><strong>$${fmt(p.precio)}</strong></p>
                <button class="btn-agregar" data-id="${p.id}">Añadir al Carrito</button>
            `;
            cont.appendChild(card);
        });

        // Listeners de "Agregar"
        $$('.btn-agregar').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = Number(btn.dataset.id);
                // Buscamos el producto en el inventario local para agregarlo al carrito
                const prod = inventarioLocal.find((x) => x.id === id); 
                if (prod) agregarAlCarrito(prod);
            });
        });
    } catch (err) {
        console.error('Error obteniendo productos:', err);
        cont.innerHTML = `
            <div style="color:#b00020; font-weight: bold;">
                <p>❌ Error al cargar productos. ¿Servidor caído o falló conexión a DB?</p>
            </div>`;
    }
}


// ─────────────────────────────────────────────────────────────
// Envío de orden (apartar-compra) y WhatsApp
// ─────────────────────────────────────────────────────────────
async function apartarCompra() {
    if (CARRITO.length === 0) {
        alert('❌ El carrito está vacío. Añade productos para confirmar el apartado.');
        return;
    }
    
    // Obtención de datos
    const nombre = nombreClienteInput.value.trim();
    const email = emailClienteInput.value.trim();
    const fecha = fechaRecoleccionInput.value;
    const hora = horaRecoleccionInput.value;
    const total = CARRITO.reduce((acc, it) => acc + (it.precio * it.cantidad), 0);

    // VALIDACIÓN FLEXIBLE
    if (!nombre || !email) { 
        alert('⚠️ Por favor, ingresa tu Nombre y Correo Electrónico. Los campos de Día y Hora son opcionales para esta prueba.');
        return;
    }
    
    const fechaFinal = fecha || 'No especificada'; 
    const horaFinal = hora || 'No especificada';

    const datosPedido = {
        // CRÍTICO: Enviamos el ID para el descuento de inventario en el backend
        carrito: CARRITO.map(({ id, nombre, precio, cantidad }) => ({ id, nombre, precio, cantidad })),
        cliente: {
            nombre: nombre,
            email: email,
            fecha: fechaFinal,
            hora: horaFinal
        },
        total: total.toFixed(2)
    };

    try {
        const response = await fetch('/apartar-compra', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosPedido)
        });
        
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || `HTTP ${response.status}`);
        }

        alert(`🎉 ¡Apartado Confirmado, ${nombre}! \n\nTu ID de Orden es: #${result.orderId}\n\n✅ Hemos enviado un CORREO DE CONFIRMACIÓN.`);
        
        // Limpiar
        CARRITO = [];
        renderizarCarrito();
        nombreClienteInput.value = '';
        emailClienteInput.value = '';
        fechaRecoleccionInput.value = '';
        horaRecoleccionInput.value = '';

    } catch (err) {
        console.error('Error al crear la orden:', err);
        alert(`❌ No se pudo crear la orden. Mensaje: ${err.message}. Revise los logs del servidor.`);
    }
}

// Función para enviar el pedido a WhatsApp Business
function enviarPedidoWhatsapp() {
    if (CARRITO.length === 0) {
        alert('❌ El carrito está vacío. Añade productos para enviar el pedido.');
        return;
    }
    
    const total = CARRITO.reduce((acc, it) => acc + (it.precio * it.cantidad), 0);
    const numeroWhatsApp = '5211234567890'; 

    let mensaje = "¡Hola! Me gustaría hacer el siguiente pedido:\n\n";
    
    CARRITO.forEach(item => {
        mensaje += `${item.cantidad} x ${item.nombre} - $${fmt(item.precio * item.cantidad)}\n`;
    });

    mensaje += `\nTotal a pagar: $${fmt(total)}`;
    mensaje += "\n\nPor favor, confírmenme la disponibilidad.";

    const mensajeCodificado = encodeURIComponent(mensaje);
    const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${mensajeCodificado}`;

    window.open(urlWhatsApp, '_blank');
    alert('🌐 Abriendo WhatsApp con los detalles de tu pedido. ¡No olvides enviar el mensaje!');
}

// ─────────────────────────────────────────────────────────────
// Inicio y Listeners
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // Render inicial
    await renderizarProductos();
    renderizarCarrito();

    // Listeners
    btnApartar.addEventListener('click', apartarCompra);
    btnWhatsapp.addEventListener('click', enviarPedidoWhatsapp);
});