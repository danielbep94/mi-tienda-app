// models/Order.js

const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    orderId: { 
        type: String, 
        required: true, 
        unique: true 
    }, 
    fechaCreacion: { 
        type: String, 
        required: true 
    },
    cliente: {
        nombre: { type: String, required: true },
        email: { type: String, required: true },
        fecha: { type: String },
        hora: { type: String }   
    },
    carrito: [ 
        {
            nombre: String,
            precio: Number,
            cantidad: Number
        }
    ],
    total: { 
        type: String, 
        required: true 
    }, 
    status: { 
        type: String, 
        required: true, 
        default: 'PENDIENTE DE PAGO' 
    },
    fechaActualizacion: { 
        type: String 
    }
}, { collection: 'orders' }); // Aseguramos el nombre de la colección

// Exportamos el modelo usando mongoose.model
module.exports = mongoose.model('Order', OrderSchema);