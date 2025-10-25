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
  },
  { timestamps: true }
);

// [AUTH RESET NEW] Índice TTL opcional (no borra doc, sólo ayuda a consultar expiración)
// UserSchema.index({ passwordResetExpires: 1 });

module.exports = mongoose.model('User', UserSchema);