const CACHE_NAME = 'v3-poketrainer-db-lab';
const ASSETS = [
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json'
];

// 1. Instalar Service Worker y activar inmediatamente sin esperar a cerrar pestañas
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// 2. Activar y ELIMINAR TODAS LAS CACHÉS ANTIGUAS (ej. 'v1-pruebapwa-cache')
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[SW] Borrando caché de aplicación antigua:', name);
                        return caches.delete(name);
                    }
                })
            );
        })
        .then(() => self.clients.claim())
        .then(() => self.clients.matchAll({ type: 'window' }))
        .then((windowClients) => {
            // Recarga automáticamente las pestañas abiertas para reemplazar la app vieja
            windowClients.forEach((client) => {
                if ('navigate' in client) {
                    client.navigate(client.url);
                }
            });
        })
    );
});

// 3. Estrategia Network-First (Red primero, Caché solo si no hay conexión)
// Así en Live Server siempre verás tus cambios al instante y no se quedará pegada una versión vieja.
self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Actualizamos la caché con la versión más reciente si es GET
                if (event.request.method === 'GET' && networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                // Solo si falla la red usamos la caché local
                return caches.match(event.request).then((cachedResponse) => {
                    return cachedResponse || new Response(JSON.stringify({ error: "offline" }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                });
            })
    );
});
