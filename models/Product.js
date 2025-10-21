// models/Product.js

const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    id: { 
        type: Number, 
        required: true, 
        unique: true 
    }, 
    nombre: { 
        type: String, 
        required: true, 
        trim: true 
    },
    descripcion: { 
        type: String, 
        required: false 
    },
    precio: { 
        type: Number, 
        required: true, 
        min: 0 
    },
    stock: { 
        type: Number, 
        required: true, 
        default: 0, 
        min: 0 
    } 
}, { collection: 'products' }); // Aseguramos el nombre de la colección

module.exports = mongoose.model('Product', ProductSchema);