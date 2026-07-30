// Même logique que API_URL (api-config.ts) : dérivé de l'hôte courant plutôt que "localhost" en
// dur, pour rester accessible depuis un autre appareil du même réseau. Le port 19004 (host) est
// mappé sur le port interne 8080 du conteneur reverb (voir docker-compose.yml / .env).
export const REVERB_HOST = window.location.hostname;
export const REVERB_PORT = 19004;
// Doit correspondre à REVERB_APP_KEY côté erp-api/.env (racine du projet).
export const REVERB_APP_KEY = 'bbb65ac2992ff677';
