const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Ruta del archivo físico de la base de datos SQLite
const DB_PATH = path.join(__dirname, 'pokedex.db');

// Conexión al motor SQLite
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[ERROR] Error al abrir la base de datos SQLite:', err.message);
    } else {
        console.log(`\n[SQLite] Base de datos conectada en: ${DB_PATH}`);
        inicializarEsquema();
    }
});

// Helper para ejecutar sentencias SQL con Promesas (INSERT, UPDATE, DELETE, PRAGMA)
function runSQL(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// Helper para obtener una sola fila (SELECT ... LIMIT 1)
function getSQL(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

// Helper para obtener múltiples filas (SELECT)
function allSQL(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

// ============================================================================
// ACTIVIDAD DEL ESTUDIANTE (MÓDULO 2): DISEÑO LÓGICO, PRAGMAS, TABLAS E ÍNDICES
// ============================================================================
async function inicializarEsquema() {
    try {
        // 1. Configurar las directivas PRAGMA requeridas
        db.exec(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                token TEXT,
                region TEXT NOT NULL DEFAULT 'Kanto',
                preferencias_json TEXT,
                fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // 3. Crear la tabla híbrida de capturas (Relacional + JSON1)
        db.exec(`
            CREATE TABLE IF NOT EXISTS capturas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                usuario_id INTEGER NOT NULL,
                poke_id INTEGER NOT NULL,
                nombre TEXT NOT NULL,
                apodo TEXT,
                peso_kg REAL,
                sprite_url TEXT NOT NULL,
                favorito INTEGER DEFAULT 0,
                notas TEXT,
                datos_json TEXT NOT NULL,
                is_deleted INTEGER DEFAULT 0,
                fecha_captura TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- ¡Integramos la columna de auditoría!
                FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
            );
        `);

        // 4. Crear el índice B-Tree solicitado en la guía
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_capturas_usuario_activo 
            ON capturas (usuario_id, is_deleted);
        `);

        console.log("¡Esquema de Base de Datos e Índices inicializados con éxito!");

    } catch (error) {
        console.error("Error crítico al inicializar el esquema de la base de datos:", error);
    }
}


module.exports = {
    db,
    DB_PATH,
    runSQL,
    getSQL,
    allSQL
};
