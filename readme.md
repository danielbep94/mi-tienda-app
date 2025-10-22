# 🛒 Plantilla de E-commerce Escalable (Node.js + MongoDB Atlas)

Esta plantilla es una solución de comercio electrónico mínima, robusta y escalable, diseñada para ser la base de múltiples tiendas. Utiliza Node.js para el servidor, MongoDB Atlas para la persistencia de datos (inventario, pedidos) y maneja las transacciones críticas como el descuento de inventario y las notificaciones por correo.

## 🚀 Características Principales

* **Arquitectura Escalable:** Migración completa de archivos JSON a **MongoDB Atlas** para un manejo seguro y concurrente de datos.
* **Gestión de Inventario (DB):** El catálogo de productos se lee directamente de la base de datos, y el stock se descuenta automáticamente con cada orden.
* **Carga Masiva de Catálogo:** El administrador puede actualizar el inventario cargando un archivo **Excel/XLSX** a través del panel de vendedor.
* **Notificaciones al Cliente:** Envío de correos de confirmación de pedido y de **actualización de estatus** (Ej: "Listo para Recoger").
* **Panel de Gestión:** Interfaz de vendedor separada para ver órdenes, buscar por ID y cambiar el estatus.

## 🛠️ Requisitos del Sistema

Antes de iniciar, asegúrate de tener instalado:

1.  **Node.js y npm** (versión LTS recomendada).
2.  **Cuenta de MongoDB Atlas** con un clúster desplegado y la IP de acceso configurada.

## ⚙️ Guía de Instalación y Configuración

### 1. Clonar el Repositorio

```bash
git clone [URL_DE_TU_REPOSITORIO]
cd mi-tienda-app