// server.js

const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = 3000;

// -------------------------------------------------------------
// Configuración del Servidor y Middleware
// -------------------------------------------------------------

// Servir archivos estáticos (Frontend) desde la carpeta 'public'
app.use(express.static(path.join(__dirname, 'public')));
// Para que Express pueda leer los datos enviados en formato JSON
app.use(express.json());

// -------------------------------------------------------------
// Configuracion del Correo (Nodemailer)
// -------------------------------------------------------------

// ⚠️ ATENCIÓN: Reemplaza con tus credenciales reales.
const transporter = nodemailer.createTransport({
    service: 'gmail', // Usar 'gmail' o el que corresponda
    auth: {
        user: 'danielhdz9409@gmail.com', // ⚠️ TU CORREO
        pass: 'rbvx pydv exfa ibat' // ⚠️ TU CLAVE DE APLICACIÓN
    }
});

// -------------------------------------------------------------
// Rutas del Servidor
// -------------------------------------------------------------

// Endpoint para procesar el apartado de compra (Recolección y Correo)
app.post('/apartar-compra', async (req, res) => {
    const { carrito, cliente, total } = req.body;

    if (!carrito || carrito.length === 0 || !cliente || !cliente.email) {
        return res.status(400).json({ success: false, message: 'Datos de pedido incompletos.' });
    }

    // 1. SIMULACIÓN de Base de Datos
    console.log(`✅ Pedido recibido. Cliente: ${cliente.nombre}, Total: $${total}`);

    // 2. Crear el cuerpo del correo de confirmación
    let detallesProductos = carrito.map(item =>
        `<li>${item.nombre} x ${item.cantidad} - $${(item.precio * item.cantidad).toFixed(2)}</li>`
    ).join('');

    const mailOptions = {
        from: 'danielhdz9409@gmail.com',
        to: cliente.email,
        subject: '📦 Confirmación de Apartado de Compra y Recolección',
        html: `
            <h2>¡Hola ${cliente.nombre}! Tu apartado ha sido confirmado.</h2>
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
            <p>Te esperamos en la tienda en el día y hora seleccionados.</p>
        `
    };

    // 3. Enviar el correo electrónico
    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Correo de confirmación enviado a ${cliente.email}`);
        res.json({ success: true, message: 'Apartado confirmado y correo enviado.' });
    } catch (error) {
        console.error('❌ Error al enviar el correo:', error.message);
        res.status(500).json({ success: false, message: 'Error al procesar la orden y enviar el correo.' });
    }
});

// Iniciar el Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor en funcionamiento en http://localhost:${PORT}`);
});