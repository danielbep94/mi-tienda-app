// server.js

const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// -------------------------------------------------------------
// Configuracion General y Middleware
// -------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// -------------------------------------------------------------
// Configuracion del Correo (Nodemailer)
// -------------------------------------------------------------

const EMAIL_USER = 'danielhdz9409@gmail.com'; 
const EMAIL_PASS = 'rbvx pydv exfa ibat';

const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// -------------------------------------------------------------
// Lógica para Persistencia (Archivo JSON)
// -------------------------------------------------------------

const ORDERS_FILE = path.join(__dirname, 'orders.json');

function generarOrderId() {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `ORD-${fecha}-${random}`;
}

function leerOrdenes() {
    try {
        if (fs.existsSync(ORDERS_FILE)) {
            const data = fs.readFileSync(ORDERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error al leer orders.json, iniciando con array vacío:', error.message);
    }
    return [];
}

function guardarTodasOrdenes(ordenes) {
    try {
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(ordenes, null, 2));
        return true;
    } catch (error) {
        console.error('❌ Error al escribir orders.json:', error.message);
        return false;
    }
}

// -------------------------------------------------------------
// Notificación por Correo
// -------------------------------------------------------------

async function enviarCorreoStatus(orden, nuevoStatus) {
    const mailOptions = {
        from: EMAIL_USER, 
        to: orden.cliente.email,           
        subject: `🔔 Actualización de Estatus de tu Orden #${orden.orderId}`,
        html: `
            <h2>¡Hola ${orden.cliente.nombre}!</h2>
            <p>El estatus de tu orden **#${orden.orderId}** ha sido actualizado a:</p>
            
            <h1 style="color: #007bff; text-align: center;">${nuevoStatus}</h1>

            <p><strong>Detalle de la Recolección:</strong> Día: ${orden.cliente.fecha}, Hora: ${orden.cliente.hora}</p>
            <p>Gracias por tu compra.</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Correo de estatus enviado a ${orden.cliente.email} por orden ${orden.orderId}.`);
    } catch (error) {
        console.error('❌ Error al enviar el correo de estatus:', error.message);
    }
}


// -------------------------------------------------------------
// ENDPOINTS
// -------------------------------------------------------------

// ENDPOINT 1: CREAR ORDEN (APARTAR COMPRA)
app.post('/apartar-compra', async (req, res) => {
    const { carrito, cliente, total } = req.body;
    
    // Generar ID y registrar
    const orderId = generarOrderId();
    const fechaCreacion = new Date().toLocaleString();

    const nuevaOrden = {
        orderId: orderId,
        fechaCreacion: fechaCreacion,
        cliente: cliente,
        carrito: carrito,
        total: total,
        status: 'PENDIENTE DE PAGO'
    };

    // GUARDAR DATOS DEL CLIENTE Y ORDEN
    const ordenes = leerOrdenes();
    ordenes.push(nuevaOrden);
    guardarTodasOrdenes(ordenes);

    // Crear y enviar correo de confirmación inicial
    let detallesProductos = carrito.map(item =>
        `<li>${item.nombre} x ${item.cantidad} - $${(item.precio * item.cantidad).toFixed(2)}</li>`
    ).join('');

    const mailOptions = {
        from: EMAIL_USER, 
        to: cliente.email,           
        subject: `📦 Confirmación de Apartado de Compra (#${orderId})`,
        html: `
            <h2>¡Hola ${cliente.nombre}! Tu ID de Orden es: #${orderId}</h2>
            <p>Gracias por tu compra. Estamos procesando tu pedido, que tiene un total de <b>$${total}</b>.</p>
            <h3>Detalles de Recolección</h3>
            <ul>
                <li>Día de Recolección: <b>${cliente.fecha}</b></li>
                <li>Hora de Recolección: <b>${cliente.hora}</b></li>
            </ul>
            <h3>Resumen del Pedido:</h3>
            <ul>
                ${detallesProductos}
            </ul>
            <p>Te esperamos en la tienda.</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: `Apartado confirmado. ID: ${orderId}`, orderId: orderId });
    } catch (error) {
        console.error('❌ Error al enviar el correo de confirmación inicial:', error.message);
        res.status(500).json({ success: false, message: 'Error al procesar la orden y enviar el correo.' });
    }
});


// ENDPOINT 2: BUSCAR ORDEN POR ID 
app.get('/api/orden/:id', (req, res) => {
    const ordenes = leerOrdenes();
    const ordenEncontrada = ordenes.find(orden => orden.orderId === req.params.id);

    if (ordenEncontrada) {
        res.json({ success: true, orden: ordenEncontrada });
    } else {
        res.status(404).json({ success: false, message: `Orden con ID ${req.params.id} no encontrada.` });
    }
});


// ENDPOINT 3: LISTAR TODAS LAS ÓRDENES
app.get('/api/ordenes/todas', (req, res) => {
    try {
        const ordenes = leerOrdenes();
        res.json({ success: true, ordenes: ordenes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener la lista de órdenes.' });
    }
});


// ENDPOINT 4: ACTUALIZAR ESTATUS Y ENVIAR CORREO
app.post('/api/orden/status', (req, res) => {
    const { orderId, nuevoStatus } = req.body;

    if (!orderId || !nuevoStatus) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros.' });
    }

    const ordenes = leerOrdenes();
    const index = ordenes.findIndex(orden => orden.orderId === orderId);

    if (index === -1) {
        return res.status(404).json({ success: false, message: `Orden ${orderId} no encontrada.` });
    }

    const ordenActual = ordenes[index];
    const statusAnterior = ordenActual.status;

    if (statusAnterior === nuevoStatus) {
        return res.json({ success: true, message: `El estatus ya es ${nuevoStatus}. No se envió correo.` });
    }

    // 1. ACTUALIZAR EL ESTATUS
    ordenes[index].status = nuevoStatus;
    ordenes[index].fechaActualizacion = new Date().toLocaleString();
    guardarTodasOrdenes(ordenes);
    
    // 2. ENVIAR CORREO DE NOTIFICACIÓN
    enviarCorreoStatus(ordenes[index], nuevoStatus);

    res.json({ success: true, message: `Estatus de orden ${orderId} cambiado a ${nuevoStatus}. Correo enviado.` });
});


// Iniciar el Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor en funcionamiento en http://localhost:${PORT}`);
});