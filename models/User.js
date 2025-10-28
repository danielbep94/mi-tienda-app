// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    name:  { type: String, default: '' },
    passwordHash: { type: String, required: true },

    // Loyalty / analytics
    transactionsCount: { type: Number, default: 0 },
    lifetimeSpent:     { type: Number, default: 0 }, // USD
    lastOrderId:       { type: String, default: null },

    // marketing preferences (optional)
    marketingOptIn:    { type: Boolean, default: true },

    // ─────────────────────────────────────────────────────────
    // [AUTH RESET NEW] Campos para recuperación de contraseña
    // ─────────────────────────────────────────────────────────
    passwordResetToken:   { type: String, default: null },
    passwordResetExpires: { type: Date,   default: null },

    // ─────────────────────────────────────────────────────────
    // [ADMIN ROLE NEW] Rol del usuario: 'customer' | 'admin'
    //  - Por defecto todos son 'customer'
    //  - Se marcarán como 'admin' si su email aparece en ADMIN_EMAILS
    // ─────────────────────────────────────────────────────────
    role: {
      type: String,
      enum: ['customer', 'admin'],
      default: 'customer',
      index: true, // consultas rápidas por rol
    },
  },
  { timestamps: true }
);

// [AUTH RESET NEW] Índice TTL opcional (no borra doc, sólo ayuda a consultar expiración)
// UserSchema.index({ passwordResetExpires: 1 });

// ─────────────────────────────────────────────────────────────
// [VIRTUAL/HELPER NEW] Atajo para saber si es admin
// (No es requerido, pero útil en el código del servidor/frontend)
// ─────────────────────────────────────────────────────────────
UserSchema.virtual('isAdmin').get(function () {
  return this.role === 'admin';
});

module.exports = mongoose.model('User', UserSchema);