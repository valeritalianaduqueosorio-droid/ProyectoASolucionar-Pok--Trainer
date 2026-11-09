const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const readline = require('readline');
const { runSQL, getSQL, allSQL, DB_PATH } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir el frontend estático en http://localhost:3000
app.use(express.static(path.join(__dirname, '../frontend')));

// Almacén de sesiones en memoria (Token -> { id, username, region })
const sesionesActivas = new Map();

// Mapa para evitar inserciones duplicadas por doble clic accidental (< 3 segundos)
const ultimasCapturas = new Map();

// Limpiar cualquier registro antiguo con is_deleted = 1 para que pokedex.db no tenga filas fantasma
runSQL('DELETE FROM capturas WHERE is_deleted = 1').catch(() => { });

// ============================================================================
// MONITOR DE BASE DE DATOS Y RESPUESTAS EN LA CONSOLA DE VS CODE
// ============================================================================
const COLOR = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m'
};

async function mostrarEstadoBaseDeDatosEnTerminal(tituloEvento, sqlEjecutado, parametros, respuestaApp, usuarioId = null) {
    console.log('\n' + '='.repeat(88));
    console.log(`${COLOR.bright}${COLOR.cyan}[EVENTO DE LA APP]: ${tituloEvento}${COLOR.reset}`);
    console.log('-'.repeat(88));

    if (sqlEjecutado) {
        console.log(`${COLOR.yellow}[SQL EJECUTADO]:${COLOR.reset} ${sqlEjecutado.replace(/\s+/g, ' ').trim()}`);
        console.log(`${COLOR.yellow}[PARAMETROS (?)]:${COLOR.reset} ${JSON.stringify(parametros)}`);
    }

    console.log(`${COLOR.green}[RESPUESTA DE LA API (JSON)]:${COLOR.reset}`);
    console.log(JSON.stringify(respuestaApp, null, 2));
    console.log('-'.repeat(88));

    try {
        const usuarios = await allSQL(
            `SELECT id, username, region, preferencias_json, fecha_registro FROM usuarios`
        );
        const capturas = await allSQL(`
            SELECT 
                c.id,
                u.username AS entrenador,
                c.poke_id,
                c.nombre,
                c.apodo,
                c.peso_kg,
                json_extract(c.datos_json, '$.tipo_principal') AS tipo_json,
                json_extract(c.datos_json, '$.hp') AS hp_json,
                c.favorito,
                c.notas,
                c.fecha_captura
            FROM capturas c
            INNER JOIN usuarios u ON c.usuario_id = u.id
            ORDER BY c.id DESC
            LIMIT 15
        `);

        console.log(`${COLOR.magenta}[TABLA SQLite: usuarios] (${usuarios.length} registros):${COLOR.reset}`);
        if (usuarios.length > 0) {
            console.table(usuarios);
        } else {
            console.log('   (Sin usuarios registrados)');
        }

        console.log(`${COLOR.blue}[TABLA SQLite: capturas (JOIN + json_extract)] (${capturas.length} registros):${COLOR.reset}`);
        if (capturas.length > 0) {
            console.table(capturas);
        } else {
            console.log('   (Sin Pokémon capturados)');
        }

        // Mostrar agregaciones SQL (COUNT, AVG, MAX, GROUP BY) en la consola de VS Code
        if (usuarioId) {
            const metricas = await getSQL(`
                SELECT 
                    COUNT(*) AS total_equipo,
                    ROUND(AVG(peso_kg), 2) AS peso_promedio_kg,
                    MAX(CAST(json_extract(datos_json, '$.hp') AS INTEGER)) AS max_hp,
                    SUM(CASE WHEN favorito = 1 THEN 1 ELSE 0 END) AS total_favoritos
                FROM capturas
                WHERE usuario_id = ?
            `, [usuarioId]);

            const porTipo = await allSQL(`
                SELECT 
                    json_extract(datos_json, '$.tipo_principal') AS tipo,
                    COUNT(*) AS cantidad,
                    ROUND(AVG(CAST(json_extract(datos_json, '$.ataque') AS REAL)), 1) AS ataque_promedio
                FROM capturas
                WHERE usuario_id = ?
                GROUP BY tipo
                ORDER BY cantidad DESC
            `, [usuarioId]);

            if (metricas && metricas.total_equipo > 0) {
                console.log(`${COLOR.cyan}[AGREGACIONES SQL DEL ENTRENADOR (COUNT, AVG, MAX, GROUP BY)]:${COLOR.reset}`);
                console.table([metricas]);
                if (porTipo.length > 0) {
                    console.table(porTipo);
                }
            }
        }
    } catch (err) {
        console.error('[ERROR] Error al mostrar tablas en terminal:', err.message);
    }
    console.log('='.repeat(88) + '\n');
}

// ============================================================================
// MIDDLEWARE DE AUTENTICACIÓN POR TOKEN (UNIDAD 3)
// ============================================================================
async function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            error: 'No autorizado. Debes iniciar sesión.'
        });
    }

    if (sesionesActivas.has(token)) {
        req.usuario = sesionesActivas.get(token);
        return next();
    }

    // Si el servidor se reinició con npm run dev, recuperamos el último usuario activo para no cortar la sesión
    try {
        const ultimoUsuario = await getSQL(`SELECT id, username, region FROM usuarios ORDER BY id DESC LIMIT 1`);
        if (ultimoUsuario) {
            sesionesActivas.set(token, ultimoUsuario);
            req.usuario = ultimoUsuario;
            return next();
        }
    } catch { }

    return res.status(401).json({
        error: 'Sesión expirada. Vuelve a iniciar sesión.'
    });
}

// ============================================================================
// 1. AUTENTICACIÓN: REGISTRO Y LOGIN (UNIDAD 3)
// ============================================================================

app.post('/api/auth/register', async (req, res) => {
    const { username, password, region } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos.' });
    }

    const userClean = username.trim().toLowerCase();
    const regionClean = (region || 'Kanto').trim();
    const prefsJSON = JSON.stringify({ tema: 'oscuro', notificaciones: true, dispositivo: 'PWA-Movil' });

    const sql = `INSERT INTO usuarios (username, password, region, preferencias_json) VALUES (?, ?, ?, ?)`;
    const params = [userClean, password, regionClean, prefsJSON];

    try {
        const result = await runSQL(sql, params);
        const token = crypto.randomBytes(16).toString('hex');
        const userPayload = { id: result.lastID, username: userClean, region: regionClean };
        sesionesActivas.set(token, userPayload);

        const respuesta = {
            mensaje: 'Entrenador registrado con éxito',
            token,
            usuario: userPayload
        };

        await mostrarEstadoBaseDeDatosEnTerminal(
            'POST /api/auth/register (Registro de Entrenador)',
            sql,
            [userClean, '***', regionClean, prefsJSON],
            respuesta,
            userPayload.id
        );
        res.status(201).json(respuesta);
    } catch (error) {
        if (error.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Ese nombre de entrenador ya está registrado.' });
        }
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Ingresa tu usuario y contraseña.' });
    }

    const userClean = username.trim().toLowerCase();
    const sql = `SELECT id, username, password, region FROM usuarios WHERE username = ?`; // Consulta por nombre de usuario *completar*
    const params = [userClean];

    try {
        const user = await getSQL(sql, params);
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const token = crypto.randomBytes(16).toString('hex');
        const userPayload = { id: user.id, username: user.username, region: user.region };
        sesionesActivas.set(token, userPayload);

        const respuesta = {
            mensaje: `Bienvenido de nuevo, entrenador ${user.username}`,
            token,
            usuario: userPayload
        };

        await mostrarEstadoBaseDeDatosEnTerminal(
            'POST /api/auth/login (Inicio de Sesión)',
            sql,
            params,
            respuesta,
            user.id
        );
        res.json(respuesta);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// 2. OPERACIONES CRUD SOBRE CAPTURAS POKÉMON (MÓDULO 2 Y MÓDULO 4)
// ============================================================================

// GET /api/capturas -> Consultar equipo con json_extract y paginación LIMIT/OFFSET
app.get('/api/capturas', autenticarToken, async (req, res) => {
    const usuarioId = req.usuario.id;
    const limit = parseInt(req.query.limit) || 4;
    const offset = parseInt(req.query.offset) || 0;
    const buscar = (req.query.buscar || '').trim();
    const soloFavoritos = req.query.favoritos === '1';

    let sql = `
        SELECT 
            c.id,
            c.poke_id,
            c.nombre,
            c.apodo,
            c.peso_kg,
            c.sprite_url,
            c.favorito,
            c.notas,
            c.fecha_captura,
            json_extract(c.datos_json, '$.tipo_principal') AS tipo_principal,
            json_extract(c.datos_json, '$.hp') AS hp,
            json_extract(c.datos_json, '$.ataque') AS ataque
        FROM capturas c
        WHERE c.usuario_id = ? AND c.is_deleted = 0
    `;
    const params = [usuarioId];

    if (buscar) {
        sql += ` AND (c.nombre LIKE ? OR c.apodo LIKE ?)`;
        params.push(`%${buscar}%`, `%${buscar}%`);
    }

    if (soloFavoritos) {
        sql += ` AND c.favorito = 1`;
    }

    sql += ` ORDER BY c.favorito DESC, c.id DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    try {
        const filas = await allSQL(sql, params);
        const totalRow = await getSQL(
            `SELECT COUNT(*) AS total FROM capturas WHERE usuario_id = ? AND is_deleted = 0`,
            [usuarioId]
        );

        const respuesta = {
            total: totalRow ? totalRow.total : 0,
            limit,
            offset,
            capturas: filas
        };

        await mostrarEstadoBaseDeDatosEnTerminal(
            'GET /api/capturas (Consulta de Equipo + json_extract + LIMIT/OFFSET)',
            sql,
            params,
            respuesta,
            usuarioId
        );

        res.json(respuesta);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/capturas -> Capturar un Pokémon (INSERT con prevención de duplicados)
app.post('/api/capturas', autenticarToken, async (req, res) => {
    const usuarioId = req.usuario.id;
    const { poke_id, nombre, apodo, peso_kg, sprite_url, stats_json, notas } = req.body;

    if (!poke_id || !nombre || !sprite_url) {
        return res.status(400).json({ error: 'Faltan datos obligatorios del Pokémon.' });
    }

    const apodoClean = (apodo || '').trim();
    const notasClean = (notas || '').trim();

    // Protección contra peticiones duplicadas en menos de 3 segundos
    const claveDedup = `${usuarioId}:${poke_id}:${apodoClean}`;
    const ahora = Date.now();
    if (ultimasCapturas.has(claveDedup) && (ahora - ultimasCapturas.get(claveDedup)) < 3000) {
        return res.status(200).json({
            mensaje: `¡${nombre.toUpperCase()} ya fue registrado en tu equipo!`,
            duplicado_ignorado: true
        });
    }
    ultimasCapturas.set(claveDedup, ahora);

    const datosJsonTexto = JSON.stringify(stats_json || {
        tipo_principal: 'normal',
        hp: 50,
        ataque: 50
    });

    const sql = `
        INSERT INTO capturas (usuario_id, poke_id, nombre, apodo, peso_kg, sprite_url, datos_json, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
        usuarioId,
        poke_id,
        nombre.toLowerCase(),
        apodoClean,
        Number(peso_kg) || 0,
        sprite_url,
        datosJsonTexto,
        notasClean
    ];

    try {
        const result = await runSQL(sql, params);
        const respuesta = {
            mensaje: `¡${nombre.toUpperCase()} fue capturado y añadido a tu equipo!`,
            captura_id: result.lastID
        };

        await mostrarEstadoBaseDeDatosEnTerminal(
            'POST /api/capturas (INSERT de Pokémon en SQLite)',
            sql,
            params,
            respuesta,
            usuarioId
        );
        res.status(201).json(respuesta);
    } catch (error) {
        ultimasCapturas.delete(claveDedup);
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/capturas/:id -> Actualizar Apodo, Notas o Favorito (UPDATE por PK)
app.put('/api/capturas/:id', autenticarToken, async (req, res) => {
    const capturaId = Number(req.params.id);
    const usuarioId = req.usuario.id;
    const { apodo, notas, favorito } = req.body;

    const sql = `
        UPDATE capturas
        SET apodo = COALESCE(?, apodo),
            notas = COALESCE(?, notas),
            favorito = COALESCE(?, favorito)
        WHERE id = ? AND usuario_id = ?
    `;
    const params = [
        apodo !== undefined ? apodo.trim() : null,
        notas !== undefined ? notas.trim() : null,
        favorito !== undefined ? (favorito ? 1 : 0) : null,
        capturaId,
        usuarioId
    ];

    try {
        const result = await runSQL(sql, params);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Pokémon no encontrado en tu equipo.' });
        }

        const respuesta = {
            mensaje: `Datos del Pokémon #${capturaId} actualizados`,
            cambios: result.changes
        };

        await mostrarEstadoBaseDeDatosEnTerminal(
            `PUT /api/capturas/${capturaId} (UPDATE por Clave Primaria)`,
            sql,
            params,
            respuesta,
            usuarioId
        );
        res.json(respuesta);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/capturas/:id -> Eliminar Pokémon de la base de datos (DELETE)
app.delete('/api/capturas/:id', autenticarToken, async (req, res) => {
    const capturaId = Number(req.params.id);
    const usuarioId = req.usuario.id;

    const sql = `DELETE FROM capturas WHERE id = ? AND usuario_id = ?`; // borrar por Clave Primaria (PK) *Completar*
    const params = [capturaId, usuarioId];

    try {
        const result = await runSQL(sql, params);
        const respuesta = {
            mensaje: `Pokémon #${capturaId} eliminado de la base de datos`,
            eliminados: result.changes
        };

        await mostrarEstadoBaseDeDatosEnTerminal(
            `DELETE /api/capturas/${capturaId} (Eliminación en SQLite)`,
            sql,
            params,
            respuesta,
            usuarioId
        );
        res.json(respuesta);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// 3. SINCRONIZACIÓN OFFLINE CON TRANSACCIÓN ACID (UNIDAD 3 Y MÓDULO 4)
// ============================================================================
app.post('/api/sync', autenticarToken, async (req, res) => {
    const usuarioId = req.usuario.id;
    const { colaOffline } = req.body;

    if (!Array.isArray(colaOffline) || colaOffline.length === 0) {
        return res.status(400).json({ error: 'No hay capturas pendientes por sincronizar.' });
    }

    const inicioMs = Date.now();
    const sqlInsert = `
        INSERT INTO capturas (usuario_id, poke_id, nombre, apodo, peso_kg, sprite_url, datos_json, notas)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    try {
        await runSQL('BEGIN TRANSACTION;');

        let insertados = 0;
        for (const item of colaOffline) {
            const datosJsonTexto = JSON.stringify({
                ...(item.stats_json || {}),
                origen: 'sincronizado_offline'
            });

            await runSQL(sqlInsert, [
                usuarioId,
                item.poke_id,
                (item.nombre || 'pokemon').toLowerCase(),
                item.apodo || '',
                Number(item.peso_kg) || 0,
                item.sprite_url || '',
                datosJsonTexto,
                item.notas || 'Capturado en modo sin conexión'
            ]);
            insertados++;
        }

        await runSQL('COMMIT;');
        const duracionMs = Date.now() - inicioMs;

        const respuesta = {
            mensaje: `¡${insertados} Pokémon sincronizados con tu cuenta en ${duracionMs} ms!`,
            insertados,
            duracion_ms: duracionMs
        };

        await mostrarEstadoBaseDeDatosEnTerminal(
            'POST /api/sync (Transacción ACID de Capturas Offline)',
            `BEGIN TRANSACTION; [x${insertados} INSERT INTO capturas ...]; COMMIT;`,
            [`Usuario #${usuarioId}, ${insertados} registros`],
            respuesta,
            usuarioId
        );

        res.json(respuesta);
    } catch (error) {
        await runSQL('ROLLBACK;');
        res.status(500).json({ error: 'Fallo en la sincronización. Se aplicó ROLLBACK.', detalle: error.message });
    }
});

// ============================================================================
// COMANDOS EN LA CONSOLA DE VS CODE PARA EL DOCENTE Y ESTUDIANTES
// ============================================================================
function iniciarConsolaInteractiva() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(`${COLOR.bright}${COLOR.green}Comandos de diagnóstico disponibles en esta consola de VS Code:${COLOR.reset}`);
    console.log(`   - Escribe ${COLOR.yellow}tablas${COLOR.reset} para ver las tablas SQLite y estadísticas.`);
    console.log(`   - Escribe ${COLOR.yellow}plan${COLOR.reset}   para ejecutar EXPLAIN QUERY PLAN (SEARCH vs SCAN).`);
    console.log(`   - Escribe ${COLOR.yellow}pragma${COLOR.reset} para verificar el modo WAL y claves foráneas.`);
    console.log('-'.repeat(88));

    rl.on('line', async (input) => {
        const cmd = input.trim().toLowerCase();
        if (cmd === 'tablas' || cmd === 'ver') {
            await mostrarEstadoBaseDeDatosEnTerminal('INSPECCION DESDE LA CONSOLA DE VS CODE', 'SELECT * FROM usuarios; SELECT * FROM capturas;', [], { estado: 'OK' }, 1);
        } else if (cmd === 'plan') {
            const p1 = await allSQL(`EXPLAIN QUERY PLAN SELECT id, nombre FROM capturas WHERE usuario_id = 1 AND is_deleted = 0`);
            const p2 = await allSQL(`EXPLAIN QUERY PLAN SELECT id, nombre FROM capturas WHERE notas = 'test'`);
            console.log(`\n[EXPLAIN QUERY PLAN CON INDICE B-TREE]:`);
            console.table(p1);
            console.log(`[EXPLAIN QUERY PLAN SIN INDICE (SCAN TABLE)]:`);
            console.table(p2);
        } else if (cmd === 'pragma') {
            const jm = await getSQL('PRAGMA journal_mode;');
            const fk = await getSQL('PRAGMA foreign_keys;');
            const sync = await getSQL('PRAGMA synchronous;');
            console.table([{
                journal_mode: jm?.journal_mode,
                foreign_keys: fk?.foreign_keys,
                synchronous: sync?.synchronous
            }]);
        }
    });
}

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(88));
    console.log(`${COLOR.bright}${COLOR.cyan}[SERVIDOR] POKÉ-TRAINER ACTIVO EN: http://localhost:${PORT}${COLOR.reset}`);
    console.log(`[SQLite] Base de Datos: ${DB_PATH}`);
    console.log('='.repeat(88));
    iniciarConsolaInteractiva();
});
