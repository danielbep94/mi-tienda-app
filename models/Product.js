// models/Product.js
const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    // Optional business ID (numeric). Keep it if you use it; otherwise rely on _id.
    id: { type: Number, index: true, unique: true, sparse: true },

    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '' },

    precio: { type: Number, required: true, min: 0 },

    // Simple stock (no sizes/variants)
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  {
    collection: 'products',
    timestamps: true,
  }
);

module.exports = mongoose.model('Product', ProductSchema);
