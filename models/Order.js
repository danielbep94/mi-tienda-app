// models/Order.js
const mongoose = require('mongoose');

const CartItemSchema = new mongoose.Schema(
  {
    // Soporta ambos tipos de identificador que puede mandar el frontend
    id: { type: Number, required: false },
    _id: { type: mongoose.Schema.Types.ObjectId, required: false },

    nombre: { type: String, required: true },
    precio: { type: Number, required: true, min: 0 }, // snapshot del precio al momento de la compra
    cantidad: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },

    // Fechas como String para mantener compatibilidad con tu implementación actual
    fechaCreacion: { type: String, required: true },
    fechaActualizacion: { type: String },

    cliente: {
      nombre: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true },
      fecha: { type: String }, // día de recolección
      hora: { type: String },  // hora de recolección
    },

    carrito: {
      type: [CartItemSchema],
      validate: v => Array.isArray(v) && v.length > 0,
    },

    // Guarda total como número; tu servidor ya usa Number(orden.total).toFixed(2)
    total: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      required: true,
      default: 'PENDIENTE DE PAGO',
      enum: [
        'PENDIENTE DE PAGO',
        'PAGO PENDIENTE',
        'PROCESANDO PAGO',
        'PAGADO',
        'PAGO FALLIDO',
        'PENDIENTE DE RECOLECCIÓN/PAGO OFFLINE',
        'CANCELADO',
      ],
    },

    // Campos de control para idempotencia/seguimiento del webhook
    stockDeducted: { type: Boolean, default: false },
    paymentIntentId: { type: String },
    paymentError: { type: String },
    paidAt: { type: String }, // ISO string cuando marques pago completado
  },
  { collection: 'orders' }
);

// Índices auxiliares
OrderSchema.index({ status: 1 });
OrderSchema.index({ 'cliente.email': 1 });

// Exportamos el modelo
module.exports = mongoose.model('Order', OrderSchema);