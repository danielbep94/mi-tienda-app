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
const { Types } = mongoose;
const multer = require('multer');
const xlsx = require('xlsx');

// [AUTH NEW] deps
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Stripe SDK + keys
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const stripe = require('stripe')(STRIPE_SECRET_KEY);

// 🔐 reCAPTCHA
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || '';
const RECAPTCHA_MIN_SCORE = Number(process.env.RECAPTCHA_MIN_SCORE ?? 0.5);

// Modelos
const Product = require('./models/Product');
const Order = require('./models/Order');
// [AUTH NEW] User model
const User = require('./models/User');

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Si estás detrás de un proxy (ngrok, render, nginx) esto permite leer req.ip real
app.set('trust proxy', true);

// [AUTH NEW] JWT secret
const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'change_me';

// ─────────────────────────────────────────────────────────────
// 2) Validación temprana de variables de entorno críticas
// ─────────────────────────────────────────────────────────────
const REQUIRED_ENVS = [
  'MONGO_URI',
  'STRIPE_SECRET_KEY',
  'EMAIL_USER',
  'EMAIL_PASS',
  'STRIPE_WEBHOOK_SECRET',
];
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

// [AUTH WELCOME NEW] correo de bienvenida
async function enviarCorreoBienvenida({ to, name }) {
  if (!EMAIL_USER || !EMAIL_PASS || !to) return;
  const mail = {
    from: EMAIL_USER,
    to,
    subject: '🎉 ¡Bienvenido a Mi Tienda!',
    html: `
      <h2>¡Hola ${name || 'amigo'}!</h2>
      <p>Gracias por registrarte en <strong>Mi Tienda</strong>.</p>
      <p>Como miembro podrás recibir descuentos, llevar el historial de compras y más.</p>
    `,
  };
  try {
    await transporter.sendMail(mail);
    console.log(`✉️  Correo de bienvenida enviado a ${to}`);
  } catch (e) {
    console.warn('[AUTH WELCOME NEW] error enviando bienvenida:', e?.message);
  }
}

// [AUTH RESET NEW] helpers reset password (token por email)
function hashTokenSha256(token) {
  // [NOTE] Actualmente NO usamos el hash porque el modelo guarda el token en claro
  // (passwordResetToken). Dejamos la función por si más adelante deseas cambiar
  // a guardar hash en DB.
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
function buildBaseUrlFromReq(req) {
  // Usa x-forwarded headers si existen; fallback a Origin/Host
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host  = req.headers['x-forwarded-host']  || req.headers.host;
  const baseFromHeaders = (proto && host) ? `${proto}://${host}` : null;
  return baseFromHeaders || req.headers.origin || (process.env.APP_BASE_URL || 'http://localhost:3000');
}

/* ────────────────────────────────────────────────────────────
   [FIX HELPERS NEW] AÑADIDO: helpers de carrito/stock
   Motivo: evitar "validarYCalcularTotal is not defined" y
   centralizar la validación de totales/stock.
   NOTA: Declaraciones de función (se hoistean).
   ──────────────────────────────────────────────────────────── */
function buildProductQueryFromCart(carrito) {
  const idsNum = [];
  const idsObj = [];

  for (const item of carrito || []) {
    const raw = item?.id ?? item?._id ?? item?.productKey;
    if (raw == null) continue;

    const asNum = Number(raw);
    if (Number.isFinite(asNum) && String(asNum) === String(raw)) {
      idsNum.push(asNum);
    } else if (typeof raw === 'string' && Types.ObjectId.isValid(raw)) {
      idsObj.push(new Types.ObjectId(raw));
    }
  }

  const or = [];
  if (idsNum.length) or.push({ id: { $in: idsNum } });
  if (idsObj.length) or.push({ _id: { $in: idsObj } });
  return or.length ? { $or: or } : null;
}

function matchesItemToDoc(item, doc) {
  const raw = item?.id ?? item?._id ?? item?.productKey;
  if (raw == null) return false;
  if (doc.id != null && String(doc.id) === String(raw)) return true;
  return String(doc._id) === String(raw);
}

async function validarYCalcularTotal(carrito) {
  if (!Array.isArray(carrito) || carrito.length === 0) {
    return { ok: false, message: 'Carrito vacío.' };
  }

  const query = buildProductQueryFromCart(carrito);
  if (!query) return { ok: false, message: 'IDs de productos inválidos.' };

  const productos = await Product.find(query);

  let serverTotal = 0;
  const faltantes = [];

  for (const item of carrito) {
    const prod = productos.find((p) => matchesItemToDoc(item, p));
    if (!prod) {
      faltantes.push(item?.id ?? item?._id ?? item?.productKey);
      continue;
    }
    const cantidad = Number(item.cantidad || 0);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      return { ok: false, message: `Cantidad inválida para producto ${prod.nombre}.` };
    }
    if ((prod.stock || 0) < cantidad) {
      return { ok: false, message: `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock || 0}, solicitado: ${cantidad}.` };
    }
    serverTotal += Number(prod.precio) * cantidad;
  }

  if (faltantes.length) return { ok: false, message: `Productos no encontrados: ${faltantes.join(', ')}` };
  serverTotal = Math.round(serverTotal * 100) / 100;
  return { ok: true, serverTotal };
}

async function descontarStockSeguro(carrito) {
  let ok = 0;

  for (const item of carrito || []) {
    const qty = Math.max(1, Math.floor(Number(item.cantidad || 0)));
    const raw = item?.id ?? item?._id ?? item?.productKey;

    if (!raw || !Number.isFinite(qty)) {
      console.warn('[Stock] Item inválido en carrito:', item);
      continue;
    }

    const matchOr = [];
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && String(asNum) === String(raw)) {
      matchOr.push({ id: asNum });
    }
    if (typeof raw === 'string' && Types.ObjectId.isValid(raw)) {
      matchOr.push({ _id: new Types.ObjectId(raw) });
    }
    if (!matchOr.length) {
      console.warn('[Stock] ID no válido para item:', raw, item);
      continue;
    }

    const prod = await Product.findOne({ $or: matchOr }).select('id _id nombre stock');
    if (!prod) {
      console.warn('[Stock] Producto no encontrado para', raw, '(item:', item, ')');
      continue;
    }

    if ((prod.stock || 0) < qty) {
      console.warn(`[Stock] Insuficiente: "${prod.nombre}" stock=${prod.stock} solicitado=${qty}`);
      continue;
    }

    const updated = await Product.findOneAndUpdate(
      { $or: matchOr, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true }
    ).select('id _id nombre stock');

    if (updated) {
      ok += 1;
      console.log(`[Stock] "${updated.nombre}" descontado: ahora stock=${updated.stock}`);
    } else {
      console.warn('[Stock] No se pudo actualizar (condición no cumplida) para', prod);
    }
  }

  console.log(`[Stock] Productos actualizados: ${ok}/${(carrito || []).length}`);
  if (ok < (carrito || []).length) {
    throw new Error('No se pudo descontar el stock de todos los productos (posible falta de stock o ID inválido).');
  }
}
/* ────────────────────────────────────────────────────────────
   [FIN FIX HELPERS NEW]
   ──────────────────────────────────────────────────────────── */

// ─────────────────────────────────────────────────────────────
// 5.1) Helper reCAPTCHA (usa fetch nativo o node-fetch dinámico)
// ─────────────────────────────────────────────────────────────
const _fetch = (typeof fetch !== 'undefined')
  ? fetch
  : (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function verifyRecaptcha(token, remoteip = undefined) {
  if (!token || !RECAPTCHA_SECRET_KEY) {
    return { success: false, score: 0, action: null, error: 'missing_token_or_secret' };
  }
  const params = new URLSearchParams();
  params.append('secret', RECAPTCHA_SECRET_KEY);
  params.append('response', token);
  if (remoteip) params.append('remoteip', remoteip);

  try {
    const resp = await _fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await resp.json();
    return {
      success: !!data.success,
      score: Number(data.score ?? 0),
      action: data.action || null,
      errorCodes: data['error-codes'] || [],
    };
  } catch (e) {
    console.error('reCAPTCHA verify error:', e.message);
    return { success: false, score: 0, action: null, error: e.message };
  }
}

// (Opcional) Ruta de debug para probar un token manualmente (usar con POST: {token})
app.post('/api/debug-recaptcha', express.json(), async (req, res) => {
  const token = req.body?.token;
  const result = await verifyRecaptcha(token, req.ip);
  res.json(result);
});

// ─────────────────────────────────────────────────────────────
// [AUTH NEW] Helpers JWT & middleware
// ─────────────────────────────────────────────────────────────
function signUserToken(user) {
  return jwt.sign(
    { uid: String(user._id), email: user.email, name: user.name || '' },
    USER_JWT_SECRET,
    { expiresIn: '15d' }
  );
}

function authOptional(req, _res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, USER_JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

// ─────────────────────────────────────────────────────────────
// 6) ⚠️ WEBHOOK DE STRIPE (debe ir ANTES de los body-parsers)
// ─────────────────────────────────────────────────────────────
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

        if (actualizado) {
          // [AUTH NEW] actualizar métricas de usuario si existe con ese email
          try {
            const userEmail = actualizado?.cliente?.email;
            if (userEmail) {
              const u = await User.findOne({ email: userEmail });
              if (u) {
                u.transactionsCount = (u.transactionsCount || 0) + 1;
                u.lifetimeSpent = Number((u.lifetimeSpent || 0) + Number(actualizado.total || 0));
                u.lastOrderId = actualizado.orderId;
                await u.save();
              }
              // Si deseas crear el usuario automáticamente cuando paga, descomenta:
              // else {
              //   const placeholderHash = await bcrypt.hash(crypto.randomBytes(12).toString('hex'), 10);
              //   await User.create({
              //     email: userEmail,
              //     name: actualizado?.cliente?.nombre || '',
              //     passwordHash: placeholderHash,
              //     transactionsCount: 1,
              //     lifetimeSpent: Number(actualizado.total || 0),
              //     lastOrderId: actualizado.orderId,
              //   });
              // }
            }
          } catch (uErr) {
            console.warn('[AUTH NEW] No se pudo actualizar métricas de usuario:', uErr?.message);
          }

          await enviarCorreoConfirmacionPago(actualizado);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        console.log('❌ payment_intent.payment_failed');
        const pi = event.data.object;
        const theOrderId = pi.metadata?.order_id;
        if (theOrderId) {
          await Order.findOneAndUpdate(
            { orderId: theOrderId, status: { $ne: 'PAGADO' } },
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
// [AUTH NEW] Endpoints de autenticación (signup/login/me)
// ─────────────────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, name, password, marketingOptIn } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y password son requeridos.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'El password debe tener al menos 6 caracteres.' });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Este email ya está registrado.' });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await User.create({
      email,
      name: name || '',
      passwordHash,
      marketingOptIn: marketingOptIn !== false,
    });

    // [AUTH WELCOME NEW] enviar correo de bienvenida (no bloqueante)
    enviarCorreoBienvenida({ to: user.email, name: user.name }).catch(() => {});

    const token = signUserToken(user);
    res.json({ success: true, token, user: { email: user.email, name: user.name, transactionsCount: user.transactionsCount, lifetimeSpent: user.lifetimeSpent } });
  } catch (e) {
    console.error('[AUTH NEW] signup error:', e.message);
    res.status(500).json({ success: false, message: 'Error al registrar usuario.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y password son requeridos.' });
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    const ok = await bcrypt.compare(String(password), user.passwordHash || '');
    if (!ok) return res.status(401).json({ success: false, message: 'Credenciales inválidas.' });
    const token = signUserToken(user);
    res.json({ success: true, token, user: { email: user.email, name: user.name, transactionsCount: user.transactionsCount, lifetimeSpent: user.lifetimeSpent, lastOrderId: user.lastOrderId } });
  } catch (e) {
    console.error('[AUTH NEW] login error:', e.message);
    res.status(500).json({ success: false, message: 'Error al iniciar sesión.' });
  }
});

app.get('/api/auth/me', authOptional, async (req, res) => {
  try {
    if (!req.user?.email) return res.status(401).json({ success: false, message: 'No autenticado.' });
    const user = await User.findOne({ email: req.user.email }).select('email name transactionsCount lifetimeSpent lastOrderId');
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
    res.json({ success: true, user });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error al cargar perfil.' });
  }
});

// [AUTH RESET NEW] Solicitar restablecimiento de contraseña (envía email con link)
app.post('/api/auth/forgot', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ success: false, message: 'Email requerido.' });

    const user = await User.findOne({ email });
    // Respondemos 200 aunque no exista para no revelar cuentas
    if (!user) return res.json({ success: true, message: 'Si el email existe, enviaremos instrucciones.' });

    const rawToken = crypto.randomBytes(32).toString('hex');

    // [AUTH RESET FIX] usar los campos del modelo: passwordResetToken / passwordResetExpires
    user.passwordResetToken   = rawToken;                                     // [AUTH RESET FIX]
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);        // [AUTH RESET FIX]
    await user.save();

    const baseUrl = buildBaseUrlFromReq(req);
    const link = `${baseUrl}/reset-password.html?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}`;

    if (EMAIL_USER && EMAIL_PASS) {
      await transporter.sendMail({
        from: EMAIL_USER,
        to: email,
        subject: '🔐 Restablecer contraseña - Mi Tienda',
        html: `
          <p>Has solicitado restablecer tu contraseña.</p>
          <p>Haz clic en el siguiente enlace (válido por 1 hora):</p>
          <p><a href="${link}">${link}</a></p>
          <p>Si no solicitaste este cambio, ignora este mensaje.</p>
        `,
      });
    }
    res.json({ success: true, message: 'Si el email existe, enviaremos instrucciones.' });
  } catch (e) {
    console.error('[AUTH RESET NEW] forgot error:', e.message);
    res.status(500).json({ success: false, message: 'No se pudo procesar la solicitud.' });
  }
});

// [AUTH RESET NEW] Restablecer contraseña con token
app.post('/api/auth/reset', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body || {};
    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Datos incompletos.' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'El password debe tener al menos 6 caracteres.' });
    }

    // [AUTH RESET FIX] buscar por los campos correctos del modelo
    const user = await User.findOne({
      email,
      passwordResetToken: token,                                             // [AUTH RESET FIX]
      passwordResetExpires: { $gt: new Date() }                              // [AUTH RESET FIX]
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Token inválido o expirado.' });
    }

    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    user.passwordResetToken = null;                                          // [AUTH RESET FIX]
    user.passwordResetExpires = null;                                        // [AUTH RESET FIX]
    await user.save();

    res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (e) {
    console.error('[AUTH RESET NEW] reset error:', e.message);
    res.status(500).json({ success: false, message: 'No se pudo actualizar la contraseña.' });
  }
});

// ─────────────────────────────────────────────────────────────
// 8) Endpoints de negocio
// ─────────────────────────────────────────────────────────────

// Inventario
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product
      .find({ stock: { $gt: 0 } })
      .select('id _id nombre descripcion precio stock');
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener productos de MongoDB.' });
  }
});

// Crear PaymentIntent + Orden (con correo inicial de registro) + reCAPTCHA
app.post('/api/create-payment-intent', async (req, res) => {
  const { carrito, cliente, total, recaptchaToken } = req.body;

  // 🔐 1) Verificar reCAPTCHA
  try {
    const result = await verifyRecaptcha(recaptchaToken, req.ip);
    console.log('[reCAPTCHA] success:', result.success, 'score:', result.score, 'action:', result.action, 'ip:', req.ip);
    if (!result.success || result.score < RECAPTCHA_MIN_SCORE) {
      return res.status(400).json({
        success: false,
        message: 'Verificación reCAPTCHA fallida. Por favor recarga e inténtalo de nuevo.',
      });
    }
  } catch (recErr) {
    console.error('❌ Error verificando reCAPTCHA:', recErr.message);
    return res.status(400).json({
      success: false,
      message: 'No se pudo verificar reCAPTCHA.',
    });
  }

  // 2) Lógica de negocio (igual que antes)
  try {
    console.log('[DEBUG] Carrito recibido:', carrito);
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
/* 9) Errores y Arranque */
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