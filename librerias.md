# 🧩 Documentación de Librerías y Flujo de Código

Este archivo explica el propósito de cada librería instalada y cómo interactúan las partes clave del servidor y el cliente.

## I. Dependencias Clave (NPM)

| Librería | Propósito | Explicación |
| :--- | :--- | :--- |
| **mongoose** | Conexión y Modelado de DB | Permite que las operaciones de Node.js se traduzcan a comandos de MongoDB. Define la estructura de las colecciones (`Order` y `Product`). |
| **express** | Servidor Web | Gestiona la arquitectura de las rutas (APIs) y sirve los archivos estáticos (`public/`). |
| **nodemailer** | Envío de Correo | Se utiliza para enviar notificaciones de estado de pedidos y confirmaciones iniciales, usando las credenciales de Gmail/SMTP. |
| **dotenv** | Configuración Segura | Carga las credenciales sensibles (como MONGO_URI y EMAIL_PASS) del archivo .env a la memoria del servidor (`process.env`). |
| **multer** | Manejo de Archivos | Es un *middleware* esencial que permite al servidor Node.js recibir y procesar archivos cargados desde formularios HTML (usado para la carga de Excel). |
| **xlsx** (SheetJS) | Procesamiento de Excel | Lee el archivo binario del Excel/CSV y lo convierte en un array de objetos JSON para que el servidor pueda procesar y cargar los nuevos productos en la DB. |

## II. Flujo de Datos Críticos (Migración a MongoDB)

La lógica de la aplicación se centra en la sincronización del inventario y la creación segura de pedidos.

### A. Sincronización del Inventario (Visualización)

| Archivo | Función | Descripción |
| :--- | :--- | :--- |
| **`server.js`** | `app.get('/api/products')` | Este *endpoint* consulta directamente la colección `products` en MongoDB. Es la **fuente única de verdad** para el inventario. |
| **`public/script.js`** | `renderizarProductos()` | Esta función es **asíncrona** y llama a `/api/products` con `fetch`. Luego, toma la respuesta JSON (el inventario) y genera las tarjetas de producto en el HTML. |

### B. Creación Segura de Órdenes y Descuento de Stock

El *endpoint* `app.post('/apartar-compra')` en `server.js` maneja la transacción más compleja:

1.  **Generación de ID:** Se crea un `orderId` único.
2.  **Guardado:** Se crea y guarda la `nuevaOrden` en la colección **`orders`**.
3.  **Descuento de Stock:** Se recorre el carrito. Por cada ítem, se ejecuta `Product.updateOne({ id: item.id }, { $inc: { stock: -item.cantidad } })`. Esto garantiza que el inventario se descuente solo si hay stock disponible.
4.  **Manejo de Errores (Integridad):** Si el descuento de stock de *cualquier* producto falla, el bloque `catch` se encarga de:
    * Eliminar la orden recién creada (`Order.deleteOne`).
    * Revertir cualquier descuento de stock que se haya aplicado a productos anteriores (rollback).

Este diseño asegura que **nunca se pierda inventario ni se registren pedidos imposibles de cumplir**.


npm install express mongoose nodemailer dotenv multer xlsx