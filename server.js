// server.js

// ─────────────────────────────────────────────────────────────
// 1) Core imports & .env
// ─────────────────────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');

// ─────────────────────────────────────────────────────────────
// 2) Models (asegúrate de que existan en ./models)
// ─────────────────────────────────────────────────────────────
const Product = require('./models/Product');
const Order = require('./models/Order');

// ─────────────────────────────────────────────────────────────
const app = express();
const PORT = Number(process.env.PORT || 3000);

// ─────────────────────────────────────────────────────────────
// 3) MongoDB connection
// ─────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI, {
    // Puedes ajustar opciones si lo necesitas
  })
  .then(async () => {
    console.log('✅ Conexión a MongoDB Atlas exitosa.');
    await seedProducts(); // Inicializar inventario
  })
  .catch((err) => {
    console.error('❌ Error de conexión a MongoDB:', err.message);
    console.error('Verifica tu MONGO_URI en el archivo .env.');
  });

// ─────────────────────────────────────────────────────────────
// 4) App middleware
// ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─────────────────────────────────────────────────────────────
// 5) Nodemailer (usar variables de entorno)
// ─────────────────────────────────────────────────────────────
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.warn('⚠️  Falta EMAIL_USER o EMAIL_PASS en .env. El envío de correos fallará.');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

// (Opcional) verifica configuración al inicio
transporter.verify((err, success) => {
  if (err) console.warn('⚠️  Nodemailer no verificado:', err.message);
  else console.log('✉️  Nodemailer listo para enviar correos.');
});

// ─────────────────────────────────────────────────────────────
// 6) Helpers
// ─────────────────────────────────────────────────────────────
async function seedProducts() {
  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    console.log('📦 Inicializando colección de productos...');
    const initialProducts = [
      { id: 1, nombre: 'Laptop Ultraligera', descripcion: 'Perfecta para trabajar desde casa.', precio: 850.0, stock: 10 },
      { id: 2, nombre: 'Teclado Mecánico RGB', descripcion: 'Experiencia de tecleo superior.', precio: 95.5, stock: 25 },
      { id: 3, nombre: 'Mouse Inalámbrico Ergonómico', descripcion: 'Comodidad para largas jornadas.', precio: 35.75, stock: 50 },
      { id: 4, nombre: "Monitor Curvo 27''", descripcion: 'Imágenes vibrantes y fluidas.', precio: 299.99, stock: 5 },
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
  if (!EMAIL_USER || !EMAIL_PASS) return;

  const mailOptions = {
    from: EMAIL_USER,
    to: orden?.cliente?.email,
    subject: `🔔 Actualización de Estatus de tu Orden #${orden.orderId}`,
    html: `
      <h2>¡Hola ${orden?.cliente?.nombre || 'Cliente'}!</h2>
      <p>El estatus de tu orden <strong>#${orden.orderId}</strong> ha sido actualizado a:</p>
      <h1 style="color:#007bff;text-align:center;">${nuevoStatus}</h1>
      <p><strong>Detalle de la Recolección:</strong></p>
      <ul>
        <li>Día: ${orden?.cliente?.fecha || '-'}</li>
        <li>Hora: ${orden?.cliente?.hora || '-'}</li>
      </ul>
      <p>Gracias por tu compra.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✉️  Correo de estatus enviado a ${orden?.cliente?.email} por orden ${orden.orderId}.`);
  } catch (error) {
    console.error('❌ Error al enviar el correo de estatus:', error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// 7) Endpoints
// ─────────────────────────────────────────────────────────────

// Salud
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Obtener productos disponibles para el frontend
app.get('/api/products', async (_req, res) => {
  try {
    const products = await Product.find({ stock: { $gt: 0 } }).select('id nombre descripcion precio stock');
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos de MongoDB.' });
  }
});

// Crear orden (apartar compra) + descuento de inventario
app.post('/apartar-compra', async (req, res) => {
  const { carrito, cliente, total } = req.body || {};

  if (!Array.isArray(carrito) || !cliente || typeof total !== 'number') {
    return res.status(400).json({ success: false, message: 'Parámetros inválidos (carrito/cliente/total).' });
  }

  try {
    const orderId = generarOrderId();
    const fechaCreacion = new Date().toLocaleString();

    const nuevaOrden = new Order({
      orderId,
      fechaCreacion,
      cliente,
      carrito,
      total,
      status: 'PENDIENTE DE PAGO',
    });

    // 1) Guardar la orden
    await nuevaOrden.save();

    // 2) Descontar stock por ID de producto
    for (const item of carrito) {
      if (typeof item.id !== 'number' || typeof item.cantidad !== 'number') continue;
      const upd = await Product.updateOne({ id: item.id, stock: { $gte: item.cantidad } }, { $inc: { stock: -item.cantidad } });
      if (upd.matchedCount === 0) {
        // rollback simple: si un producto no tiene stock suficiente, revertir los descuentos previos y abortar
        for (const r of carrito) {
          if (typeof r.id !== 'number' || typeof r.cantidad !== 'number') continue;
          await Product.updateOne({ id: r.id }, { $inc: { stock: r.cantidad } });
        }
        await Order.deleteOne({ orderId });
        return res.status(409).json({ success: false, message: `Stock insuficiente para el producto ID ${item.id}.` });
      }
    }

    // 3) Enviar correo confirmación inicial
    const detallesProductos = carrito
      .map(
        (item) => `<li>${item.nombre} x ${item.cantidad} - $${Number(item.precio * item.cantidad).toFixed(2)}</li>`
      )
      .join('');

    const mailOptions = {
      from: EMAIL_USER,
      to: cliente.email,
      subject: `📦 Confirmación de Apartado de Compra (#${orderId})`,
      html: `
        <h2>¡Hola ${cliente.nombre}! Tu ID de Orden es: #${orderId}</h2>
        <p>Gracias por tu compra. Estamos procesando tu pedido, que tiene un total de <b>$${total.toFixed(2)}</b>.</p>
        <h3>Detalles de Recolección</h3>
        <ul>
          <li>Día de Recolección: <b>${cliente.fecha}</b></li>
          <li>Hora de Recolección: <b>${cliente.hora}</b></li>
        </ul>
        <h3>Resumen del Pedido:</h3>
        <ul>${detallesProductos}</ul>
        <p>Te esperamos en la tienda.</p>
      `,
    };

    if (EMAIL_USER && EMAIL_PASS) {
      await transporter.sendMail(mailOptions);
    }

    res.json({ success: true, message: `Apartado confirmado. ID: ${orderId}`, orderId });
  } catch (error) {
    console.error('❌ Error al procesar la orden:', error.message);
    res.status(500).json({
      success: false,
      message: 'Error al procesar la orden y descontar inventario. Revise logs del servidor.',
    });
  }
});

// Buscar orden por ID
app.get('/api/orden/:id', async (req, res) => {
  try {
    const ordenEncontrada = await Order.findOne({ orderId: req.params.id });
    if (ordenEncontrada) {
      res.json({ success: true, orden: ordenEncontrada });
    } else {
      res.status(404).json({ success: false, message: `Orden con ID ${req.params.id} no encontrada.` });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error en la búsqueda.' });
  }
});

// Listar todas las órdenes
app.get('/api/ordenes/todas', async (_req, res) => {
  try {
    const ordenes = await Order.find({});
    res.json({ success: true, ordenes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al obtener la lista de órdenes.' });
  }
});

// Actualizar estatus de una orden + correo
app.post('/api/orden/status', async (req, res) => {
  const { orderId, nuevoStatus } = req.body || {};
  if (!orderId || !nuevoStatus) {
    return res.status(400).json({ success: false, message: 'Faltan parámetros.' });
  }

  try {
    const result = await Order.findOneAndUpdate(
      { orderId },
      { status: nuevoStatus, fechaActualizacion: new Date().toLocaleString() },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ success: false, message: `Orden ${orderId} no encontrada.` });
    }

    enviarCorreoStatus(result, nuevoStatus);
    res.json({
      success: true,
      message: `Estatus de orden ${orderId} cambiado a ${nuevoStatus}. Correo enviado.`,
      orden: result,
    });
  } catch (error) {
    console.error('❌ Error al actualizar estatus:', error.message);
    res.status(500).json({ success: false, message: 'Error interno al actualizar la orden.' });
  }
});

// ─────────────────────────────────────────────────────────────
// 8) Carga masiva de productos desde Excel (admin)
// ─────────────────────────────────────────────────────────────
const upload = multer({ dest: 'uploads/' });

app.post('/api/admin/catalogo', upload.single('archivoCatalogo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se recibió ningún archivo.' });
  }

  const archivoRuta = req.file.path;

  try {
    // 1) Leer Excel
    const workbook = xlsx.readFile(archivoRuta);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // 2) Convertir a filas (matriz). Primera fila = cabeceras esperadas
    // Esperado: id | nombre | descripcion | precio | stock
    const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });

    if (!rows || rows.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'El archivo Excel está vacío o sin registros (necesita cabecera + filas).',
      });
    }

    const header = rows[0].map((h) => String(h).trim().toLowerCase());
    const required = ['id', 'nombre', 'descripcion', 'precio', 'stock'];
    const missing = required.filter((c) => !header.includes(c));

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Cabeceras faltantes en Excel: ${missing.join(', ')}`,
      });
    }

    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const productosAInsertar = [];

    for (let i = 1; i < rows.length; i++) {
      const fila = rows[i];

      // Saltar filas vacías
      if (!fila || fila.every((cell) => String(cell).trim() === '')) continue;

      const prod = {
        id: Number(fila[idx['id']]),
        nombre: String(fila[idx['nombre']] || '').trim(),
        descripcion: String(fila[idx['descripcion']] || '').trim(),
        precio: Number(fila[idx['precio']]),
        stock: Number(fila[idx['stock']]),
      };

      if (
        Number.isFinite(prod.id) &&
        prod.nombre &&
        Number.isFinite(prod.precio) &&
        Number.isFinite(prod.stock)
      ) {
        productosAInsertar.push(prod);
      } else {
        console.warn(`⚠️  Fila ${i + 1} inválida. Se omitió.`, prod);
      }
    }

    if (productosAInsertar.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No hay filas válidas para insertar. Revisa los datos numéricos y textos.',
      });
    }

    // 3) Reemplazar catálogo
    await Product.deleteMany({});
    const resultado = await Product.insertMany(productosAInsertar);

    res.json({
      success: true,
      message: `Catálogo actualizado con éxito. Se insertaron ${resultado.length} productos desde Excel.`,
      insertedCount: resultado.length,
    });
  } catch (error) {
    console.error('❌ Error en la carga masiva (XLSX):', error.message);
    res.status(500).json({
      success: false,
      message: `Error procesando la carga. Verifique el formato Excel: ${error.message}`,
    });
  } finally {
    // 4) Borrar archivo temporal
    try {
      if (fs.existsSync(archivoRuta)) fs.unlinkSync(archivoRuta);
    } catch (e) {
      console.warn('⚠️  No se pudo eliminar el archivo temporal:', e.message);
    }
  }
});

// ─────────────────────────────────────────────────────────────
// 9) Start server
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Servidor en funcionamiento en http://localhost:${PORT}`);
});

// ─────────────────────────────────────────────────────────────
// 10) Manejo básico de errores no atrapados
// ─────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});
