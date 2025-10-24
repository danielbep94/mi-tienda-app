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

// Stripe SDK + keys
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = require('stripe')(STRIPE_SECRET_KEY);

// Modelos
const Product = require('./models/Product');
const Order = require('./models/Order');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// ─────────────────────────────────────────────────────────────
// 2) Validación temprana de variables de entorno críticas
// ─────────────────────────────────────────────────────────────
const REQUIRED_ENVS = ['MONGO_URI', 'STRIPE_SECRET_KEY', 'EMAIL_USER', 'EMAIL_PASS', 'STRIPE_WEBHOOK_SECRET'];
REQUIRED_ENVS.forEach((k) => {
  if (!process.env[k]) {
    console.warn(`⚠️  Falta variable de entorno: ${k}`);
  }
});

// ─────────────────────────────────────────────────────────────
// 3) Conexión MongoDB
// ─────────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    socketTimeoutMS: 45000,
  })
  .then(async () => {
    console.log('✅ Conexión a MongoDB Atlas exitosa.');
    await seedProducts(); // Inicializar inventario si está vacío
  })
  .catch((err) => {
    console.error('❌ Error de conexión a MongoDB:', err.message);
    console.error('Verifica tu MONGO_URI en el archivo .env.');
    process.exitCode = 1;
  });

// ─────────────────────────────────────────────────────────────
// 4) Nodemailer
// ─────────────────────────────────────────────────────────────
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS },
});

transporter.verify().then(
  () => console.log('✉️  Transporte de correo listo.'),
  (e) => console.warn('⚠️  No se pudo verificar el transporte de correo:', e?.message),
);

// ─────────────────────────────────────────────────────────────
// 5) Helpers
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

  const clienteNombre = orden?.cliente?.nombre || 'Cliente';
  const clienteEmail = orden?.cliente?.email;
  const fechaRecoleccion = orden?.cliente?.fecha || '-';
  const horaRecoleccion = orden?.cliente?.hora || '-';
  if (!clienteEmail) return console.warn(`⚠️  No se puede enviar correo: cliente.email indefinido para orden ${orden.orderId}`);

  const mailOptions = {
    from: EMAIL_USER,
    to: clienteEmail,
    subject: `🔔 Actualización de Estatus de tu Orden #${orden.orderId}`,
    html: `<h2>¡Hola ${clienteNombre}!</h2>
           <p>El estatus de tu orden <b>#${orden.orderId}</b> ha sido actualizado a:</p>
           <h1 style="color: #007bff; text-align: center;">${nuevoStatus}</h1>
           <p><strong>Detalle de la Recolección:</strong></p>
           <ul>
             <li>Día: ${fechaRecoleccion}</li>
             <li>Hora: ${horaRecoleccion}</li>
           </ul>
           <p>Gracias por tu compra.</p>`,
  };
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✉️  Correo de estatus enviado a ${clienteEmail} por orden ${orden.orderId}.`);
  } catch (error) {
    console.error('❌ Error al enviar el correo de estatus:', error.message);
  }
}

async function enviarCorreoConfirmacionPago(orden) {
  if (!EMAIL_USER || !EMAIL_PASS) return;
  const clienteNombre = orden?.cliente?.nombre || 'Cliente';
  const clienteEmail = orden?.cliente?.email;
  if (!clienteEmail) return;

  const detallesProductos = (orden?.carrito || [])
    .map((item) => `<li>${item.nombre} x ${item.cantidad} - $${Number(item.precio * item.cantidad).toFixed(2)}</li>`)
    .join('');

  const mailOptions = {
    from: EMAIL_USER,
    to: clienteEmail,
    subject: `✅ Pago Confirmado — Orden #${orden.orderId}`,
    html: `
      <h2>¡Gracias, ${clienteNombre}!</h2>
      <p>Tu pago fue confirmado correctamente.</p>
      <h3>Resumen de la Orden #${orden.orderId}:</h3>
      <ul>${detallesProductos}</ul>
      <p><strong>Total pagado:</strong> $${Number(orden.total).toFixed(2)}</p>
      <p>Te contactaremos si necesitamos información adicional para tu entrega/recolección.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✉️  Correo final de pago enviado a ${clienteEmail} por orden ${orden.orderId}.`);
  } catch (err) {
    console.error('❌ Error al enviar correo final de pago:', err.message);
  }
}

// Validación de carrito contra DB
async function validarYCalcularTotal(carrito) {
  if (!Array.isArray(carrito) || carrito.length === 0) {
    return { ok: false, message: 'Carrito vacío.' };
  }
  const ids = carrito.map((i) => i.id);
  const productos = await Product.find({ id: { $in: ids } });
  const map = new Map(productos.map((p) => [p.id, p]));

  let serverTotal = 0;
  const faltantes = [];

  for (const item of carrito) {
    const prod = map.get(item.id);
    if (!prod) {
      faltantes.push(item.id);
      continue;
    }
    const cantidad = Number(item.cantidad || 0);
    if (cantidad <= 0) return { ok: false, message: `Cantidad inválida para producto ${prod.nombre}.` };
    if (prod.stock < cantidad) return { ok: false, message: `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock}, solicitado: ${cantidad}.` };
    serverTotal += Number(prod.precio) * cantidad;
  }

  if (faltantes.length) return { ok: false, message: `Productos no encontrados: ${faltantes.join(', ')}` };
  serverTotal = Math.round(serverTotal * 100) / 100;
  return { ok: true, serverTotal };
}

// Descuento de stock seguro
async function descontarStockSeguro(carrito) {
  const ops = carrito.map((item) => ({
    updateOne: {
      filter: { id: item.id, stock: { $gte: item.cantidad } },
      update: { $inc: { stock: -item.cantidad } },
    },
  }));
  const res = await Product.bulkWrite(ops, { ordered: true });
  if (res.modifiedCount !== carrito.length) {
    throw new Error('No se pudo descontar el stock de todos los productos (posible falta de stock).');
  }
}

// ─────────────────────────────────────────────────────────────
// 6) ⚠️ WEBHOOK DE STRIPE (debe ir ANTES de los body-parsers)
// ─────────────────────────────────────────────────────────────
// (ESTE ES EL BLOQUE QUE ME PEDISTE TAL CUAL)
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('[WEBHOOK] recibido', new Date().toISOString());

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Firma inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.processing': {
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          await Order.findOneAndUpdate(
            { orderId, status: { $ne: 'PAGADO' } },
            { status: 'PROCESANDO PAGO', fechaActualizacion: new Date().toLocaleString() },
            { new: true }
          );
        }
        console.log('ℹ️ payment_intent.processing');
        break;
      }

      case 'payment_intent.succeeded': {
        console.log('✅ payment_intent.succeeded');
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id;
        if (!orderId) break;

        const orden = await Order.findOne({ orderId });
        if (!orden) break;

        // Idempotencia
        if (orden.status === 'PAGADO' || orden.stockDeducted === true) {
          console.log(`ℹ️ Orden ${orderId} ya procesada como PAGADO. Saltando...`);
          break;
        }

        try {
          await descontarStockSeguro(orden.carrito);
        } catch (e) {
          console.error(`❌ No se pudo descontar stock para ${orderId}:`, e.message);
        }

        const actualizado = await Order.findOneAndUpdate(
          { orderId },
          {
            status: 'PAGADO',
            stockDeducted: true,
            paidAt: new Date().toISOString(),
            paymentIntentId: pi.id,
            fechaActualizacion: new Date().toLocaleString(),
          },
          { new: true }
        );

        if (actualizado) await enviarCorreoConfirmacionPago(actualizado);
        break;
      }

      case 'payment_intent.payment_failed': {
        console.log('❌ payment_intent.payment_failed');
        const pi = event.data.object;
        const orderId = pi.metadata?.order_id;
        if (orderId) {
          await Order.findOneAndUpdate(
            { orderId, status: { $ne: 'PAGADO' } },
            {
              status: 'PAGO FALLIDO',
              paymentError: pi.last_payment_error?.message || 'Error de pago desconocido',
              fechaActualizacion: new Date().toLocaleString(),
            },
            { new: true }
          );
        }
        break;
      }

      default:
        console.log('ℹ️ evento no manejado:', event.type);
        break;
    }

    res.json({ received: true });
  } catch (handlerErr) {
    console.error('❌ Error manejando evento de webhook:', handlerErr.message);
    res.status(500).send('Webhook handler error');
  }
});

// ─────────────────────────────────────────────────────────────
// 7) Body parsers y archivos estáticos (DESPUÉS del webhook)
// ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─────────────────────────────────────────────────────────────
// 8) Endpoints de negocio
// ─────────────────────────────────────────────────────────────

// Inventario
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find({ stock: { $gt: 0 } }).select('id nombre descripcion precio stock');
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos de MongoDB.' });
  }
});

// Crear PaymentIntent + Orden (con correo inicial de registro)
app.post('/api/create-payment-intent', async (req, res) => {
  const { carrito, cliente, total } = req.body;
  try {
    const check = await validarYCalcularTotal(carrito);
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    const serverTotal = check.serverTotal;
    const amountInCents = Math.round(serverTotal * 100);
    if (amountInCents < 50) return res.status(400).json({ success: false, message: 'El monto total es demasiado bajo.' });

    const diff = Math.abs(Number(total || 0) - serverTotal);
    if (diff > 0.01) console.warn(`⚠️  Total del cliente (${total}) difiere del servidor (${serverTotal}). Usando total del servidor.`);

    // Crear orden PAGO PENDIENTE
    const orderId = generarOrderId();
    const fechaCreacion = new Date().toLocaleString();
    const nuevaOrden = new Order({
      orderId,
      fechaCreacion,
      cliente,
      carrito,
      total: serverTotal,
      status: 'PAGO PENDIENTE',
    });
    await nuevaOrden.save();

    // Correo inicial de registro (pago pendiente)
    try {
      const detallesProductos = carrito
        .map((item) => `<li>${item.nombre} x ${item.cantidad} - $${Number(item.precio * item.cantidad).toFixed(2)}</li>`)
        .join('');

      const mailOptions = {
        from: EMAIL_USER,
        to: cliente?.email,
        subject: `📦 Confirmación de Pedido (Pago Pendiente) #${orderId}`,
        html: `
          <h2>¡Hola ${cliente?.nombre || 'Cliente'}! Tu pedido #${orderId} ha sido REGISTRADO.</h2>
          <p>Estamos esperando la confirmación final de tu pago. Si el pago es exitoso, recibirás un segundo correo de confirmación.</p>
          <h3>Resumen del Pedido:</h3>
          <ul>${detallesProductos}</ul>
          <p><strong>Total:</strong> $${serverTotal.toFixed(2)}</p>
        `,
      };

      if (EMAIL_USER && EMAIL_PASS && cliente?.email) {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ Correo inicial de REGISTRO enviado para orden #${orderId}.`);
      } else {
        console.warn('⚠️ No se envió correo inicial: faltan credenciales o email del cliente.');
      }
    } catch (mailErr) {
      console.warn('⚠️ Error enviando correo inicial de registro:', mailErr?.message);
    }

    // Crear PaymentIntent
    const idempotencyKey = crypto.randomUUID();
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: 'usd',
        metadata: { order_id: orderId },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey }
    );

    res.json({ success: true, clientSecret: paymentIntent.client_secret, orderId });
  } catch (error) {
    console.error('❌ Error creando Payment Intent:', error.message);
    res.status(500).json({ success: false, message: 'Error en el servidor al iniciar el pago.' });
  }
});

// Apartar/Offline (descuenta stock de inmediato)
app.post('/apartar-compra', async (req, res) => {
  const { carrito, cliente } = req.body;
  try {
    const check = await validarYCalcularTotal(carrito);
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });

    const orderId = generarOrderId();
    const fechaCreacion = new Date().toLocaleString();

    const nuevaOrden = new Order({
      orderId,
      cliente,
      carrito,
      total: check.serverTotal,
      status: 'PENDIENTE DE RECOLECCIÓN/PAGO OFFLINE',
      fechaCreacion,
    });
    await nuevaOrden.save();

    await descontarStockSeguro(carrito);
    await enviarCorreoStatus(nuevaOrden, nuevaOrden.status);

    res.json({ success: true, message: `Apartado confirmado. ID: ${orderId}`, orderId });
  } catch (error) {
    console.error('❌ Error al procesar la orden:', error.message);
    res.status(500).json({ success: false, message: 'Error al procesar la orden.' });
  }
});

// Consultas de órdenes
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

app.get('/api/ordenes/todas', async (req, res) => {
  try {
    const ordenes = await Order.find({}).sort({ fechaCreacion: -1 });
    res.json({ success: true, ordenes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Error al obtener la lista de órdenes.' });
  }
});

// Actualizar estatus y enviar correo
app.post('/api/orden/status', async (req, res) => {
  const { orderId, nuevoStatus } = req.body;
  if (!orderId || !nuevoStatus) return res.status(400).json({ success: false, message: 'Faltan parámetros.' });

  try {
    const result = await Order.findOneAndUpdate(
      { orderId },
      { status: nuevoStatus, fechaActualizacion: new Date().toLocaleString() },
      { new: true }
    );
    if (!result) return res.status(404).json({ success: false, message: `Orden ${orderId} no encontrada.` });

    enviarCorreoStatus(result, nuevoStatus);
    res.json({ success: true, message: `Estatus de orden ${orderId} cambiado a ${nuevoStatus}. Correo enviado.`, orden: result });
  } catch (error) {
    console.error('❌ Error al actualizar estatus:', error.message);
    res.status(500).json({ success: false, message: 'Error interno al actualizar la orden.' });
  }
});

// Carga masiva de productos
const upload = multer({ dest: 'uploads/' });
app.post('/api/admin/catalogo', upload.single('archivoCatalogo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Archivo no recibido.' });
  const archivoRuta = req.file.path;

  try {
    const workbook = xlsx.readFile(archivoRuta, { cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    const docs = rows
      .map((r) => ({
        id: Number(r.id),
        nombre: String(r.nombre || '').trim(),
        descripcion: String(r.descripcion || '').trim(),
        precio: Number(r.precio || 0),
        stock: Number(r.stock || 0),
      }))
      .filter((d) => Number.isFinite(d.id) && d.nombre);

    if (!docs.length) return res.status(400).json({ success: false, message: 'No hay filas válidas para importar.' });

    const ops = docs.map((d) => ({
      updateOne: {
        filter: { id: d.id },
        update: { $set: d },
        upsert: true,
      },
    }));

    await Product.bulkWrite(ops, { ordered: false });
    fs.unlink(req.file.path, () => {});

    res.json({ success: true, message: `Catálogo importado/actualizado: ${docs.length} productos.` });
  } catch (error) {
    console.error('❌ Error al procesar el catálogo:', error.message);
    res.status(500).json({ success: false, message: 'Error al procesar el catálogo.' });
  } finally {
    if (fs.existsSync(req.file?.path)) fs.unlink(req.file.path, () => {});
  }
});

// ─────────────────────────────────────────────────────────────
// 9) Errores y Arranque
// ─────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor en funcionamiento en http://localhost:${PORT}`);
  console.log('➡️  Asegúrate de exponer /webhook/stripe con ngrok/tu dominio y que STRIPE_WEBHOOK_SECRET esté en .env');
});
