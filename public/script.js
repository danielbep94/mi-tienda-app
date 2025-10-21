// public/script.js

// 1. Datos de productos de ejemplo
const productos = [
    { id: 1, nombre: "Laptop Ultraligera", precio: 850.00, descripcion: "Perfecta para trabajar desde casa." },
    { id: 2, nombre: "Teclado Mecánico RGB", precio: 95.50, descripcion: "Experiencia de tecleo superior." },
    { id: 3, nombre: "Mouse Inalámbrico Ergonómico", precio: 35.75, descripcion: "Comodidad para largas jornadas." },
    { id: 4, nombre: "Monitor Curvo 27''", precio: 299.99, descripcion: "Imágenes vibrantes y fluidas." },
];

let carrito = []; // Array que almacenará los productos en el carrito

// Referencias a elementos del DOM
const listaProductosDiv = document.getElementById('lista-productos');
const listaCarritoUl = document.getElementById('lista-carrito');
const totalCarritoSpan = document.getElementById('total-carrito');
const btnApartar = document.getElementById('btn-apartar-compra');
const btnWhatsapp = document.getElementById('btn-whatsapp-pedido');
const nombreClienteInput = document.getElementById('nombre-cliente');
const emailClienteInput = document.getElementById('email-cliente');
const fechaRecoleccionInput = document.getElementById('fecha-recoleccion');
const horaRecoleccionInput = document.getElementById('hora-recoleccion');

// 2. Función para renderizar (mostrar) los productos
function renderizarProductos() {
    listaProductosDiv.innerHTML = '';
    productos.forEach(producto => {
        const card = document.createElement('div');
        card.className = 'producto-card';
        card.innerHTML = `
            <h3>${producto.nombre}</h3>
            <p>$${producto.precio.toFixed(2)}</p>
            <button onclick="agregarAlCarrito(${producto.id})">Añadir al Carrito</button>
        `;
        listaProductosDiv.appendChild(card);
    });
}

// 3. Función para agregar un producto al carrito
function agregarAlCarrito(productoId) {
    const producto = productos.find(p => p.id === productoId);
    if (producto) {
        const itemExistente = carrito.find(item => item.id === productoId);

        if (itemExistente) {
            itemExistente.cantidad++;
        } else {
            carrito.push({ ...producto, cantidad: 1 });
        }
        renderizarCarrito();
    }
}

// 4. Función para renderizar el carrito y calcular el total
function renderizarCarrito() {
    listaCarritoUl.innerHTML = '';
    let total = 0;

    if (carrito.length === 0) {
        listaCarritoUl.innerHTML = '<li>El carrito está vacío.</li>';
        totalCarritoSpan.textContent = '0.00';
        return;
    }

    carrito.forEach(item => {
        const subtotal = item.precio * item.cantidad;
        total += subtotal;

        const li = document.createElement('li');
        li.innerHTML = `
            <span>${item.nombre} x ${item.cantidad}</span>
            <span>$${subtotal.toFixed(2)}</span>
        `;
        listaCarritoUl.appendChild(li);
    });

    totalCarritoSpan.textContent = total.toFixed(2);
}

// 5. Función para enviar el pedido al servidor (Recolección y Correo)
async function apartarCompra() {
    if (carrito.length === 0) {
        alert('❌ El carrito está vacío. Añade productos para confirmar el apartado.');
        return;
    }
    
    const nombre = nombreClienteInput.value.trim();
    const email = emailClienteInput.value.trim();
    const fecha = fechaRecoleccionInput.value;
    const hora = horaRecoleccionInput.value;
    const total = totalCarritoSpan.textContent;

    if (!nombre || !email || !fecha || !hora) {
        alert('⚠️ Por favor, completa todos los campos para confirmar tu apartado.');
        return;
    }

    const datosPedido = {
        carrito: carrito.map(item => ({
            id: item.id,
            nombre: item.nombre,
            precio: item.precio,
            cantidad: item.cantidad
        })),
        cliente: {
            nombre: nombre,
            email: email,
            fecha: fecha,
            hora: hora
        },
        total: total
    };

    try {
        const response = await fetch('/apartar-compra', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datosPedido)
        });

        const result = await response.json();

        if (result.success) {
            alert(`🎉 ¡Apartado Confirmado, ${nombre}! 🎉\n\nTu total es de $${total}.\n\n✅ Hemos enviado un CORREO DE CONFIRMACIÓN a ${email} con los detalles de recolección.`);

            // Limpiar el estado
            carrito = [];
            renderizarCarrito();
            nombreClienteInput.value = '';
            emailClienteInput.value = '';
            fechaRecoleccionInput.value = '';
            horaRecoleccionInput.value = '';

        } else {
            alert(`❌ Error al procesar el apartado: ${result.message}`);
        }

    } catch (error) {
        console.error('Error de red al enviar el pedido:', error);
        alert('❌ Ocurrió un error de conexión. Asegúrate de que el servidor esté encendido.');
    }
}

// 6. Función para enviar el pedido a WhatsApp Business
function enviarPedidoWhatsapp() {
    if (carrito.length === 0) {
        alert('❌ El carrito está vacío. Añade productos para enviar el pedido.');
        return;
    }
    
    const total = totalCarritoSpan.textContent;
    const numeroWhatsApp = '5211234567890'; // ⚠️ Reemplaza con tu número (código de país + número, sin '+' ni espacios)

    let mensaje = "¡Hola! Me gustaría hacer el siguiente pedido:\n\n";
    
    carrito.forEach(item => {
        mensaje += `${item.cantidad} x ${item.nombre} - $${(item.precio * item.cantidad).toFixed(2)}\n`;
    });

    mensaje += `\nTotal a pagar: $${total}`;
    mensaje += "\n\nPor favor, confírmenme la disponibilidad.";

    const mensajeCodificado = encodeURIComponent(mensaje);
    const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${mensajeCodificado}`;

    window.open(urlWhatsApp, '_blank');
    alert('🌐 Abriendo WhatsApp con los detalles de tu pedido.');
}

// 7. Inicializar y Asignar Eventos
document.addEventListener('DOMContentLoaded', () => {
    renderizarProductos();
    renderizarCarrito(); 
});

btnApartar.addEventListener('click', apartarCompra);
btnWhatsapp.addEventListener('click', enviarPedidoWhatsapp);