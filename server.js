// server.js

// 1. CARGA DE VARIABLES DE ENTORNO (.env)
require('dotenv').config(); 

const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs'); 
const crypto = require('crypto');
const mongoose = require('mongoose'); 

// Importar Modelos (Asegúrate de que estos archivos existan en la carpeta models/)
const Product = require('./models/Product');
const Order = require('./models/Order');

const app = express();
const PORT = 3000;

// -------------------------------------------------------------
// CONEXIÓN A MONGODB
// -------------------------------------------------------------

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Conexión a MongoDB Atlas exitosa.');
        seedProducts(); // Inicializar inventario
    })
    .catch(err => {
        console.error('❌ Error de conexión a MongoDB:', err.message);
        console.error('Verifica tu MONGO_URI en el archivo .env.');
    });


// -------------------------------------------------------------
// Configuracion General y Middleware
// -------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Configuracion de Nodemailer usando variables de entorno
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

// -------------------------------------------------------------
// Inicialización y Funciones Auxiliares
// -------------------------------------------------------------

// Función de inicialización de inventario (SEEDING)
async function seedProducts() {
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
        console.log('📦 Inicializando colección de productos...');
        const initialProducts = [
            { id: 1, nombre: "Laptop Ultraligera", descripcion: "Perfecta para trabajar desde casa.", precio: 850.00, stock: 10 },
            { id: 2, nombre: "Teclado Mecánico RGB", descripcion: "Experiencia de tecleo superior.", precio: 95.50, stock: 25 },
            { id: 3, nombre: "Mouse Inalámbrico Ergonómico", descripcion: "Comodidad para largas jornadas.", precio: 35.75, stock: 50 },
            { id: 4, nombre: "Monitor Curvo 27''", descripcion: "Imágenes vibrantes y fluidas.", precio: 299.99, stock: 5 },
        ];
        await Product.insertMany(initialProducts);
        console.log('✅ Productos insertados y listos en MongoDB.');
    } else {
        console.log(`✅ Inventario listo (${productCount} productos).`);
    }
}

function generarOrderId() {
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `ORD-${fecha}-${random}`;
}

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

// ENDPOINT NUEVO: Obtener productos del inventario (para el frontend)
app.get('/api/products', async (req, res) => {
    try {
        // Obtenemos los productos con stock > 0 y solo los campos necesarios
        const products = await Product.find({ stock: { $gt: 0 } }).select('id nombre descripcion precio');
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener productos de MongoDB.' });
    }
});


// ENDPOINT 1: CREAR ORDEN (APARTAR COMPRA) - Lógica de MongoDB
app.post('/apartar-compra', async (req, res) => {
    const { carrito, cliente, total } = req.body;
    
    try {
        const orderId = generarOrderId();
        const fechaCreacion = new Date().toLocaleString();

        const nuevaOrden = new Order({
            orderId: orderId,
            fechaCreacion: fechaCreacion,
            cliente: cliente,
            carrito: carrito,
            total: total,
            status: 'PENDIENTE DE PAGO'
        });

        // 1. Guardar la orden en MongoDB
        await nuevaOrden.save();

        // 2. Descontar stock (Lógica de inventario corregida)
        for (const item of req.body.carrito) {
            // CORRECCIÓN CLAVE: Buscar por ID en lugar de nombre para garantizar el match
            await Product.updateOne(
                { id: item.id }, 
                { $inc: { stock: -item.cantidad } } 
            );
        }
        
        // 3. Enviar correo de confirmación inicial
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

        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: `Apartado confirmado. ID: ${orderId}`, orderId: orderId });

    } catch (error) {
        console.error('❌ Error al procesar la orden:', error.message);
        // Devolvemos un mensaje de error más genérico al cliente
        res.status(500).json({ success: false, message: 'Error al procesar la orden y descontar inventario. Revise logs del servidor.' });
    }
});


// ENDPOINT 2: BUSCAR ORDEN POR ID (para el panel del vendedor)
app.get('/api/orden/:id', async (req, res) => {
    try {
        const ordenEncontrada = await Order.findOne({ orderId: req.params.id });

        if (ordenEncontrada) {
            res.json({ success: true, orden: ordenEncontrada });
        } else {
            res.status(404).json({ success: false, message: `Orden con ID ${req.params.id} no encontrada.` });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error en la búsqueda.' });
    }
});


// ENDPOINT 3: LISTAR TODAS LAS ÓRDENES
app.get('/api/ordenes/todas', async (req, res) => {
    try {
        // Usa .find() para obtener todas las órdenes de la colección
        const ordenes = await Order.find({});
        res.json({ success: true, ordenes: ordenes });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al obtener la lista de órdenes.' });
    }
});


// ENDPOINT 4: ACTUALIZAR ESTATUS Y ENVIAR CORREO
app.post('/api/orden/status', async (req, res) => {
    const { orderId, nuevoStatus } = req.body;

    if (!orderId || !nuevoStatus) {
        return res.status(400).json({ success: false, message: 'Faltan parámetros.' });
    }

    try {
        // 1. Actualizar el estatus en MongoDB
        const result = await Order.findOneAndUpdate(
            { orderId: orderId },
            { status: nuevoStatus, fechaActualizacion: new Date().toLocaleString() },
            { new: true } // Devuelve el documento actualizado
        );

        if (!result) {
            return res.status(404).json({ success: false, message: `Orden ${orderId} no encontrada.` });
        }
        
        // 2. ENVIAR CORREO DE NOTIFICACIÓN
        enviarCorreoStatus(result, nuevoStatus);

        res.json({ success: true, message: `Estatus de orden ${orderId} cambiado a ${nuevoStatus}. Correo enviado.`, orden: result });
    } catch (error) {
        console.error('❌ Error al actualizar estatus:', error.message);
        res.status(500).json({ success: false, message: 'Error interno al actualizar la orden.' });
    }
});


// Iniciar el Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor en funcionamiento en http://localhost:${PORT}`);
});