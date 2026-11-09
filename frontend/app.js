// ============================================================================
// CONFIGURACIÓN Y ESTADO DE LA APLICACIÓN
// ============================================================================
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && window.location.port !== '3000'
    ? 'http://localhost:3000/api'
    : '/api';
const PAGE_LIMIT = 4;

let estadoApp = {
    modoAuth: 'login',
    token: sessionStorage.getItem('poke_token') || null,
    usuario: JSON.parse(sessionStorage.getItem('poke_user') || 'null'),
    pokemonActual: null,
    paginaActual: 0,
    totalCapturas: 0,
    simularOffline: false,
    capturandoEnCurso: false
};

// 1. Registro del Service Worker y limpieza automática de cachés antiguas
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                for (const key of keys) {
                    if (key !== 'v3-poketrainer-db-lab') {
                        await caches.delete(key);
                    }
                }
            }
            const reg = await navigator.serviceWorker.register('./sw.js');
            await reg.update();
        } catch (err) {
            console.warn('[SW] No se pudo registrar:', err.message);
        }
    });
}

// ============================================================================
// ELEMENTOS DEL DOM
// ============================================================================
const offlineBadge = document.getElementById('offline-badge');
const statusMsg = document.getElementById('status-msg');
const userBar = document.getElementById('user-bar');
const displayUsername = document.getElementById('display-username');
const displayRegion = document.getElementById('display-region');
const simulateOfflineChk = document.getElementById('simulate-offline-chk');
const logoutBtn = document.getElementById('logout-btn');

// Auth DOM
const authSection = document.getElementById('auth-section');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const authForm = document.getElementById('auth-form');
const authUsername = document.getElementById('auth-username');
const authPassword = document.getElementById('auth-password');
const authRegion = document.getElementById('auth-region');
const regionGroup = document.getElementById('region-group');
const authSubmitBtn = document.getElementById('auth-submit-btn');

// App Principal DOM
const appContent = document.getElementById('app-content');
const syncPanel = document.getElementById('sync-panel');
const queueCountEl = document.getElementById('queue-count');
const syncNowBtn = document.getElementById('sync-now-btn');

// Explorador PokeAPI DOM
const pokeSearchInput = document.getElementById('poke-search-input');
const searchPokeBtn = document.getElementById('search-poke-btn');
const fetchBtn = document.getElementById('fetch-btn');
const loadingDiv = document.getElementById('loading');
const pokeCard = document.getElementById('poke-card');
const pokeIdBadge = document.getElementById('poke-id-badge');
const pokeName = document.getElementById('poke-name');
const pokeType = document.getElementById('poke-type');
const pokeImg = document.getElementById('poke-img');
const pokeWeight = document.getElementById('poke-weight');
const pokeHp = document.getElementById('poke-hp');
const pokeAtk = document.getElementById('poke-atk');
const captureNickname = document.getElementById('capture-nickname');
const captureNotes = document.getElementById('capture-notes');
const captureBtn = document.getElementById('capture-btn');

// Equipo DOM
const totalCapturesCount = document.getElementById('total-captures-count');
const dbFilterInput = document.getElementById('db-filter-input');
const dbFavOnly = document.getElementById('db-fav-only');
const dbFilterBtn = document.getElementById('db-filter-btn');
const teamList = document.getElementById('team-list');
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');
const pageIndicator = document.getElementById('page-indicator');

// ============================================================================
// UTILIDADES DE INTERFAZ Y CONECTIVIDAD
// ============================================================================
function mostrarMensaje(texto, tipo = 'info') {
    statusMsg.textContent = texto;
    statusMsg.className = `status-msg ${tipo}`;
    statusMsg.classList.remove('hidden');
    setTimeout(() => statusMsg.classList.add('hidden'), 4000);
}

function estaEnModoOffline() {
    return !navigator.onLine || estadoApp.simularOffline;
}

function actualizarIndicadorRed() {
    if (estaEnModoOffline()) {
        offlineBadge.style.display = 'block';
    } else {
        offlineBadge.style.display = 'none';
    }
    actualizarContadorColaOffline();
}

window.addEventListener('online', () => {
    actualizarIndicadorRed();
    mostrarMensaje('Conexión restablecida.', 'info');
});

window.addEventListener('offline', () => {
    actualizarIndicadorRed();
    mostrarMensaje('Sin conexión a internet. Modo local activo.', 'info');
});

simulateOfflineChk.addEventListener('change', (e) => {
    estadoApp.simularOffline = e.target.checked;
    actualizarIndicadorRed();
    if (estadoApp.simularOffline) {
        mostrarMensaje('Modo sin conexión activado.', 'info');
    } else {
        mostrarMensaje('Conectado al servidor.', 'success');
        cargarEquipoDesdeBD();
    }
});

// ============================================================================
// GESTIÓN DE COLA OFFLINE Y CACHÉ LOCAL
// ============================================================================
function obtenerColaOffline() {
    try {
        return JSON.parse(localStorage.getItem('poke_offline_queue') || '[]');
    } catch {
        return [];
    }
}

function guardarEnColaOffline(operacion) {
    const cola = obtenerColaOffline();
    cola.push({
        ...operacion,
        timestamp_offline: new Date().toISOString()
    });
    localStorage.setItem('poke_offline_queue', JSON.stringify(cola));
    actualizarContadorColaOffline();
}

function limpiarColaOffline() {
    localStorage.removeItem('poke_offline_queue');
    actualizarContadorColaOffline();
}

function actualizarContadorColaOffline() {
    const cola = obtenerColaOffline();
    queueCountEl.textContent = cola.length;
    if (cola.length > 0) {
        syncPanel.classList.remove('hidden');
    } else {
        syncPanel.classList.add('hidden');
    }
}

// ============================================================================
// AUTENTICACIÓN (LOGIN Y REGISTRO)
// ============================================================================
tabLogin.addEventListener('click', () => {
    estadoApp.modoAuth = 'login';
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    regionGroup.classList.add('hidden');
    authSubmitBtn.textContent = 'Entrar a la Pokédex';
});

tabRegister.addEventListener('click', () => {
    estadoApp.modoAuth = 'register';
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    regionGroup.classList.remove('hidden');
    authSubmitBtn.textContent = 'Crear Cuenta de Entrenador';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = authUsername.value.trim();
    const password = authPassword.value.trim();
    const region = authRegion.value;

    const endpoint = estadoApp.modoAuth === 'register' ? '/auth/register' : '/auth/login';
    authSubmitBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, region })
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Error de autenticación');
        }

        estadoApp.token = data.token;
        estadoApp.usuario = data.usuario;
        sessionStorage.setItem('poke_token', data.token);
        sessionStorage.setItem('poke_user', JSON.stringify(data.usuario));

        mostrarMensaje(data.mensaje, 'success');
        actualizarVistaSesion();
    } catch (error) {
        mostrarMensaje(error.message, 'error');
    } finally {
        authSubmitBtn.disabled = false;
    }
});

logoutBtn.addEventListener('click', () => {
    estadoApp.token = null;
    estadoApp.usuario = null;
    sessionStorage.removeItem('poke_token');
    sessionStorage.removeItem('poke_user');
    actualizarVistaSesion();
    mostrarMensaje('Sesión cerrada correctamente.', 'info');
});

function actualizarVistaSesion() {
    if (estadoApp.token && estadoApp.usuario) {
        authSection.classList.add('hidden');
        userBar.classList.remove('hidden');
        appContent.classList.remove('hidden');
        displayUsername.textContent = estadoApp.usuario.username;
        displayRegion.textContent = estadoApp.usuario.region || 'Kanto';
        actualizarContadorColaOffline();
        cargarEquipoDesdeBD();
        if (!estadoApp.pokemonActual) {
            consultarPokeAPI(Math.floor(Math.random() * 151) + 1);
        }
    } else {
        authSection.classList.remove('hidden');
        userBar.classList.add('hidden');
        appContent.classList.add('hidden');
    }
}

// ============================================================================
// EXPLORADOR POKEAPI EXTERNA
// ============================================================================
async function consultarPokeAPI(identificador) {
    loadingDiv.style.display = 'block';
    pokeCard.style.display = 'none';

    try {
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${String(identificador).toLowerCase()}`);
        if (!res.ok) {
            throw new Error('Pokémon no encontrado.');
        }

        const data = await res.json();
        if (data.error === 'offline') {
            throw new Error('Estás sin conexión a internet para buscar nuevos Pokémon.');
        }

        const hpStat = data.stats.find(s => s.stat.name === 'hp')?.base_stat || 50;
        const atkStat = data.stats.find(s => s.stat.name === 'attack')?.base_stat || 50;
        const defStat = data.stats.find(s => s.stat.name === 'defense')?.base_stat || 50;
        const tipoPrincipal = data.types[0]?.type?.name || 'normal';

        estadoApp.pokemonActual = {
            poke_id: data.id,
            nombre: data.name,
            peso_kg: data.weight / 10,
            sprite_url: data.sprites.front_default,
            stats_json: {
                tipo_principal: tipoPrincipal,
                hp: hpStat,
                ataque: atkStat,
                defensa: defStat
            }
        };

        pokeIdBadge.textContent = `#${data.id}`;
        pokeName.textContent = data.name.toUpperCase();
        pokeType.textContent = tipoPrincipal;
        pokeImg.src = data.sprites.front_default;
        pokeWeight.textContent = `${data.weight / 10} kg`;
        pokeHp.textContent = hpStat;
        pokeAtk.textContent = atkStat;

        captureNickname.value = '';
        captureNotes.value = '';
        captureBtn.disabled = false;
        captureBtn.textContent = 'Capturar Pokémon';
        pokeCard.style.display = 'block';
    } catch (error) {
        mostrarMensaje(error.message, 'error');
    } finally {
        loadingDiv.style.display = 'none';
    }
}

fetchBtn.addEventListener('click', () => {
    const randomId = Math.floor(Math.random() * 151) + 1;
    consultarPokeAPI(randomId);
});

searchPokeBtn.addEventListener('click', () => {
    const query = pokeSearchInput.value.trim();
    if (!query) return mostrarMensaje('Escribe el nombre o número de un Pokémon.', 'info');
    consultarPokeAPI(query);
});

// ============================================================================
// OPERACIONES DEL EQUIPO POKÉMON (CAPTURAR, LISTAR, EDITAR, LIBERAR)
// ============================================================================

// 1. CAPTURAR POKÉMON (con bloqueo anti-duplicados)
captureBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!estadoApp.pokemonActual || estadoApp.capturandoEnCurso) return;

    estadoApp.capturandoEnCurso = true;
    captureBtn.disabled = true;
    captureBtn.textContent = 'Capturando...';

    const payloadCaptura = {
        ...estadoApp.pokemonActual,
        apodo: captureNickname.value.trim(),
        notas: captureNotes.value.trim()
    };

    try {
        if (estaEnModoOffline()) {
            guardarEnColaOffline(payloadCaptura);
            mostrarMensaje(`¡${payloadCaptura.nombre.toUpperCase()} guardado en el dispositivo! Sincronízalo cuando tengas red.`, 'info');
            captureNickname.value = '';
            captureNotes.value = '';
            return;
        }

        const res = await fetch(`${API_BASE_URL}/capturas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.token}`
            },
            body: JSON.stringify(payloadCaptura)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        mostrarMensaje(data.mensaje, 'success');
        captureNickname.value = '';
        captureNotes.value = '';
        estadoApp.paginaActual = 0;
        await cargarEquipoDesdeBD();
    } catch (error) {
        mostrarMensaje(error.message, 'error');
    } finally {
        setTimeout(() => {
            estadoApp.capturandoEnCurso = false;
            captureBtn.disabled = false;
            captureBtn.textContent = 'Capturar Pokémon';
        }, 600);
    }
});

// 2. LISTAR EQUIPO POKÉMON
async function cargarEquipoDesdeBD() {
    const offset = estadoApp.paginaActual * PAGE_LIMIT;
    const buscar = encodeURIComponent(dbFilterInput.value.trim());
    const favoritos = dbFavOnly.checked ? '1' : '0';

    if (estaEnModoOffline()) {
        const cache = JSON.parse(localStorage.getItem('poke_team_cache') || '[]');
        renderizarListaEquipo(cache);
        return;
    }

    try {
        const url = `${API_BASE_URL}/capturas?limit=${PAGE_LIMIT}&offset=${offset}&buscar=${buscar}&favoritos=${favoritos}`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${estadoApp.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        estadoApp.totalCapturas = data.total;
        totalCapturesCount.textContent = data.total;

        localStorage.setItem('poke_team_cache', JSON.stringify(data.capturas));

        renderizarListaEquipo(data.capturas);
        actualizarControlesPaginacion(data.capturas.length);
    } catch (error) {
        mostrarMensaje('No se pudo cargar tu equipo: ' + error.message, 'error');
    }
}

function renderizarListaEquipo(lista) {
    teamList.innerHTML = '';

    if (!lista || lista.length === 0) {
        teamList.innerHTML = `<p class="empty-text">No tienes Pokémon en esta vista. ¡Explora y captura uno!</p>`;
        return;
    }

    lista.forEach(item => {
        const card = document.createElement('div');
        card.className = 'team-item';

        const nombreMostrar = item.apodo
            ? `${item.apodo} (${item.nombre.toUpperCase()})`
            : item.nombre.toUpperCase();

        card.innerHTML = `
            <div class="team-item-left">
                <img src="${item.sprite_url}" alt="${item.nombre}">
                <div class="team-meta">
                    <h4>${item.favorito ? '[FAV] ' : ''}${nombreMostrar} <small>#${item.poke_id}</small></h4>
                    <p>Tipo: <strong>${(item.tipo_principal || 'normal').toUpperCase()}</strong> | HP: <strong>${item.hp || 50}</strong> | Peso: ${item.peso_kg} kg</p>
                    <p>Nota: <em>${item.notas || 'Sin notas de entrenamiento'}</em></p>
                </div>
            </div>
            <div class="team-actions">
                <button class="btn-secondary btn-sm btn-fav" title="Marcar como Favorito">
                    ${item.favorito ? 'Quitar Fav' : 'Favorito'}
                </button>
                <button class="btn-secondary btn-sm btn-edit" title="Cambiar apodo o nota">
                    Entrenar
                </button>
                <button class="btn-danger btn-sm btn-delete" title="Liberar Pokémon">
                    Liberar
                </button>
            </div>
        `;

        card.querySelector('.btn-fav').addEventListener('click', () => {
            actualizarCaptura(item.id, { favorito: item.favorito ? 0 : 1 });
        });

        card.querySelector('.btn-edit').addEventListener('click', () => {
            const nuevoApodo = prompt('Nuevo apodo para ' + item.nombre.toUpperCase() + ':', item.apodo || '');
            if (nuevoApodo === null) return;
            const nuevaNota = prompt('Nota de entrenamiento:', item.notas || '');
            if (nuevaNota === null) return;
            actualizarCaptura(item.id, { apodo: nuevoApodo, notas: nuevaNota });
        });

        card.querySelector('.btn-delete').addEventListener('click', () => {
            liberarCaptura(item.id, item.nombre);
        });

        teamList.appendChild(card);
    });
}

function actualizarControlesPaginacion(cantidadEnPagina) {
    pageIndicator.textContent = `Página ${estadoApp.paginaActual + 1}`;
    prevPageBtn.disabled = estadoApp.paginaActual === 0;
    nextPageBtn.disabled = cantidadEnPagina < PAGE_LIMIT || ((estadoApp.paginaActual + 1) * PAGE_LIMIT >= estadoApp.totalCapturas);
}

prevPageBtn.addEventListener('click', () => {
    if (estadoApp.paginaActual > 0) {
        estadoApp.paginaActual--;
        cargarEquipoDesdeBD();
    }
});

nextPageBtn.addEventListener('click', () => {
    estadoApp.paginaActual++;
    cargarEquipoDesdeBD();
});

dbFilterBtn.addEventListener('click', () => {
    estadoApp.paginaActual = 0;
    cargarEquipoDesdeBD();
});

// 3. ACTUALIZAR POKÉMON (Apodo, Nota, Favorito)
async function actualizarCaptura(id, cambios) {
    if (estaEnModoOffline()) {
        return mostrarMensaje('Conéctate a internet para entrenar o editar tu Pokémon.', 'info');
    }

    try {
        const res = await fetch(`${API_BASE_URL}/capturas/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.token}`
            },
            body: JSON.stringify(cambios)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        mostrarMensaje(data.mensaje, 'success');
        cargarEquipoDesdeBD();
    } catch (error) {
        mostrarMensaje(error.message, 'error');
    }
}

// 4. LIBERAR POKÉMON
async function liberarCaptura(id, nombre) {
    if (estaEnModoOffline()) {
        return mostrarMensaje('Conéctate a internet para liberar Pokémon.', 'info');
    }

    try {
        const res = await fetch(`${API_BASE_URL}/capturas/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${estadoApp.token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        mostrarMensaje(`¡${nombre.toUpperCase()} fue liberado de tu equipo!`, 'info');
        cargarEquipoDesdeBD();
    } catch (error) {
        mostrarMensaje(error.message, 'error');
    }
}

// ============================================================================
// SINCRONIZACIÓN DE CAPTURAS GUARDADAS EN MODO OFFLINE
// ============================================================================
syncNowBtn.addEventListener('click', async () => {
    if (estaEnModoOffline()) {
        return mostrarMensaje('Desactiva el "Modo Sin Conexión" para sincronizar tu equipo.', 'error');
    }

    const colaOffline = obtenerColaOffline();
    if (colaOffline.length === 0) {
        return mostrarMensaje('No hay capturas pendientes por sincronizar.', 'info');
    }

    syncNowBtn.disabled = true;
    try {
        const res = await fetch(`${API_BASE_URL}/sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${estadoApp.token}`
            },
            body: JSON.stringify({ colaOffline })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        limpiarColaOffline();
        mostrarMensaje(data.mensaje, 'success');
        estadoApp.paginaActual = 0;
        cargarEquipoDesdeBD();
    } catch (error) {
        mostrarMensaje(error.message, 'error');
    } finally {
        syncNowBtn.disabled = false;
    }
});

// Inicializar vista al cargar
actualizarIndicadorRed();
actualizarVistaSesion();
