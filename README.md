# Poké-Trainer - Proyecto Integrador de Bases de Datos para Aplicaciones Móviles

Bienvenido al laboratorio práctico de **Bases de Datos para Aplicaciones Móviles**. En este proyecto transformarás una PWA (Progressive Web App) que inicialmente solo consultaba Pokémon aleatorios de la _PokeAPI_ en una **aplicación interactiva con arquitectura Cliente-Servidor, Base de Datos SQLite (Relacional + JSON1), Autenticación por Token, Sincronización Offline con Transacciones ACID y Monitoreo en Tiempo Real en la Consola de VS Code**.

---

## Temas de la Asignatura Integrados en el Proyecto

| Módulo / Unidad                             | Conceptos Aplicados en el Código                                                                                                                                                                                                                                             | Archivos Clave                                                                     |
| :------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| **Módulo 1: Introducción a BD Móviles**     | Caché local, Cola de operaciones sin conexión (`offline_queue`), Modelos Relacionales vs Documentos JSON flexibles.                                                                                                                                                          | [`frontend/app.js`](./frontend/app.js), [`frontend/sw.js`](./frontend/sw.js)       |
| **Módulo 2: Modelado de Datos Móviles**     | Diseño 3NF (`usuarios` 1:N `capturas`), Claves Primarias (`PK`) y Foráneas (`FK`), Índices B-Tree (`CREATE INDEX`), Tipos de datos (`INTEGER`, `REAL`, `TEXT`), URLs en lugar de `BLOB`, Directivas `PRAGMA` (`WAL`, `foreign_keys`) y extensión **JSON1** (`json_extract`). | [`Backend/database.js`](./Backend/database.js)                                     |
| **Unidad 3: Integración de BD y API**       | Arquitectura Cliente-Servidor (App <-> API REST <-> SQLite), Registro y Login sencillos con Tokens (`Bearer`), Sincronización diferida (`POST /api/sync`).                                                                                                                   | [`Backend/server.js`](./Backend/server.js), [`frontend/app.js`](./frontend/app.js) |
| **Módulo 4: Consultas y Operaciones (DML)** | Operaciones CRUD parametrizadas (`?` contra SQL Injection), `JOIN`, Agregaciones (`COUNT`, `AVG`, `MAX`, `GROUP BY`), Paginación (`LIMIT` y `OFFSET`), Transacciones **ACID** (`BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`) y diagnóstico con `EXPLAIN QUERY PLAN`.          | [`Backend/server.js`](./Backend/server.js)                                         |

---

## Cómo Ejecutar el Proyecto y Visualizar la Base de Datos en la Terminal

1. Abre una terminal en la carpeta `Backend` (o en la raíz del proyecto):
   ```powershell
   cd Backend
   npm install
   npm run dev
   ```
   _(También puedes usar `npm start` para ejecución estándar, o `npm run dev` para que el servidor se reinicie automáticamente al guardar cambios en `server.js` o `database.js`)._
2. Abre tu navegador en:
   `http://localhost:3000`
3. **Observa la Consola de VS Code mientras usas la App**:
   Cada vez que te registres, inicies sesión, captures un Pokémon, edites su apodo, lo liberes o sincronices la cola offline, **la terminal del PC mostrará automáticamente**:
   - La petición HTTP recibida por la API.
   - La sentencia SQL exacta ejecutada en SQLite y sus parámetros vinculados (`?`).
   - La respuesta JSON enviada a la aplicación móvil.
   - **Las tablas `usuarios` y `capturas` en vivo (`console.table`)**, incluyendo los campos extraídos del documento JSON con `json_extract()`, además de las agregaciones SQL (`COUNT`, `AVG`, `MAX`, `GROUP BY`).

### Comandos Interactivos en la Consola de VS Code

Mientras el servidor está corriendo en la terminal, puedes escribir cualquiera de estos comandos y presionar `Enter`:

- `tablas` -> Imprime en la terminal todas las filas actuales de `usuarios` y `capturas` junto con el resumen estadístico.
- `plan` -> Ejecuta `EXPLAIN QUERY PLAN` en vivo comparando una búsqueda con Índice B-Tree (`SEARCH TABLE USING INDEX`) frente a un recorrido completo (`SCAN TABLE`).
- `pragma` -> Muestra el estado activo de `journal_mode = wal`, `foreign_keys = 1` y `synchronous`.

---

## Guía de Actividades Prácticas

### Actividad 1: Modelado de Datos, Normalización (3NF) y Directivas `PRAGMA` (Módulo 2)

**Objetivo:** Implementar el esquema físico en SQLite optimizado para dispositivos móviles.

1. Abre el archivo [`Backend/database.js`](./Backend/database.js) y revisa la función `inicializarEsquema()`.
2. **Preguntas y tareas de desarrollo:**
   - Configura las directivas `PRAGMA foreign_keys = ON;`, `PRAGMA journal_mode = WAL;` y `PRAGMA synchronous = NORMAL;`. Escribe en la terminal `pragma` y verifica que `journal_mode` devuelva `wal`.
   - Construye el Diagrama Entidad-Relación (ER) de las tablas `usuarios` y `capturas` identificando las claves primarias (`PK`), la clave foránea (`usuario_id`) y la cardinalidad **Uno a Muchos (1:N)**.
   - **Justificación técnica (3NF y Tipos de Datos):** Explica por qué guardamos la imagen del Pokémon en la columna `sprite_url` como `TEXT` en lugar de almacenar el archivo binario como `BLOB`.
   - **Diseño Híbrido (Relacional + JSON1):** Observa la columna `datos_json` en la tabla `capturas`. Explica cómo el uso de un campo JSON evita migraciones costosas de esquema si en el futuro queremos guardar nuevos atributos del Pokémon (como habilidades o movimientos) sin usar `ALTER TABLE`.

---

### Actividad 2: Autenticación por Token y Arquitectura Cliente-Servidor (Unidad 3)

**Objetivo:** Conectar la aplicación con la API evitando exponer la base de datos directamente al cliente.

1. Revisa los endpoints `POST /api/auth/register` y `POST /api/auth/login` en [`Backend/server.js`](./Backend/server.js) y el formulario de acceso en [`frontend/app.js`](./frontend/app.js).
2. **Tareas prácticas:**
   - Registra dos entrenadores distintos desde la interfaz web (ej. `ash` de `Kanto` y `misty` de `Johto`).
   - Observa en la **Terminal de VS Code** cómo se inserta cada usuario en la tabla `usuarios` y cómo el servidor devuelve un `token` único de sesión.
   - Verifica el funcionamiento del middleware `autenticarToken`: explica cómo garantiza que un entrenador solo pueda consultar y modificar sus propios Pokémon capturados (Autorización y aislamiento de datos).

---

### Actividad 3: Operaciones CRUD, `json_extract()` y Paginación (Módulo 4)

**Objetivo:** Dominar las sentencias `INSERT`, `SELECT`, `UPDATE` y `DELETE` con parámetros vinculados (`?`).

1. En la aplicación, busca o genera al menos **6 Pokémon** de la PokeAPI, asígnales un apodo y una nota de entrenamiento, y presiona **"Capturar Pokémon"**.
2. **Tareas prácticas y verificación en Terminal:**
   - **Lectura Híbrida (`SELECT` + `json_extract`)**: Revisa el endpoint `GET /api/capturas` en [`Backend/server.js`](./Backend/server.js). Observa cómo se extraen `$.tipo_principal` y `$.hp` desde la columna `datos_json` sin usar `SELECT *`.
   - **Paginación (`LIMIT` y `OFFSET`)**: Navega entre la **Página 1** y la **Página 2** de tu equipo en la app y observa en la terminal cómo cambian los parámetros `LIMIT 4 OFFSET 0` y `LIMIT 4 OFFSET 4`.
   - **Actualización (`UPDATE`)**: Usa los botones **Favorito** y **Entrenar** en cualquiera de tus Pokémon. Verifica en la tabla de la terminal cómo se actualizan las columnas `favorito`, `apodo` y `notas` filtrando por clave primaria (`WHERE id = ?`).
   - **Eliminación (`DELETE`)**: Presiona el botón **Liberar** sobre un Pokémon y verifica en la terminal la sentencia `DELETE FROM capturas WHERE id = ? AND usuario_id = ?`.

---

### Actividad 4: Modo Sin Conexión (Offline Queue) y Transacciones ACID (Módulo 1, Unidad 3 y Módulo 4)

**Objetivo:** Simular caídas de red, encolar escrituras localmente en el dispositivo y sincronizarlas mediante una transacción atómica (`BEGIN TRANSACTION` ... `COMMIT`).

1. En la barra superior de la aplicación, activa la casilla **"Modo Sin Conexión"**.
2. Captura 2 o 3 Pokémon mientras estás en modo sin conexión.
   - Observa que aparece el aviso de capturas pendientes en el dispositivo y la app sigue funcionando sin bloquearse.
3. Desmarca la casilla **"Modo Sin Conexión"** para simular el regreso de conectividad y presiona **"Sincronizar Equipo Ahora"**.
4. **Verificación en Terminal:**
   - Observa en la terminal la ejecución del bloque `BEGIN TRANSACTION; ... COMMIT;` en el endpoint `POST /api/sync` y el tiempo en milisegundos que tomó insertar todo el lote.
   - Explica qué ocurriría gracias a la sentencia `ROLLBACK;` si la batería del teléfono se agotara o fallara el registro #2 a mitad de la sincronización (Propiedad de **Atomicidad** ACID).

---

### Actividad 5: Consultas de Agregación e Indexación con `EXPLAIN QUERY PLAN` en la Consola de VS Code (Módulo 2 y Módulo 4)

**Objetivo:** Evaluar el rendimiento de consultas mediante funciones agregadas e índices B-Tree directamente en la terminal del servidor.

1. Mientras los estudiantes interactúan con la aplicación (al capturar, filtrar o editar un Pokémon), observarán en la **Consola/Terminal de VS Code** la sección automática `[AGREGACIONES SQL DEL ENTRENADOR]`:
   - Revisa en la terminal el cálculo del peso promedio (`AVG(peso_kg)`), el HP máximo extraído del JSON (`MAX(CAST(json_extract(...) AS INTEGER))`) y el conteo agrupado por tipo (`GROUP BY tipo`).
2. Escribe el comando `plan` en la **Terminal de VS Code** y presiona `Enter`:
   - Compara los dos planes de ejecución devueltos por SQLite en la consola:
     - `SEARCH capturas USING INDEX idx_capturas_usuario_activo (usuario_id=? AND is_deleted=?)`
     - `SCAN capturas` (cuando se filtra por `notas`, que no tiene índice).
   - **Pregunta de cierre:** ¿Por qué no debemos crear índices sobre absolutamente todas las columnas de una tabla en una base de datos móvil? (Analiza el costo operativo en escrituras `INSERT/UPDATE/DELETE` y espacio en almacenamiento).

---
