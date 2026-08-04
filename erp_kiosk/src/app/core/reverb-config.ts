// Même logique que API_URL (api-config.ts) : dérivé de l'hôte courant plutôt que "localhost" en
// dur, pour rester accessible depuis un écran/tablette sur le même réseau. Le port 19004 (host)
// est mappé sur le port interne 8080 du conteneur reverb (voir docker-compose.yml / .env). En
// prod, `window.__ERP_CONFIG__` (voir docker/env.template.js) prend le dessus.
const config = (window as unknown as { __ERP_CONFIG__?: { reverbHost?: string; reverbPort?: number; reverbAppKey?: string } })
  .__ERP_CONFIG__;

export const REVERB_HOST = config?.reverbHost || window.location.hostname;
export const REVERB_PORT = config?.reverbPort || 19004;
// Doit correspondre à REVERB_APP_KEY côté erp-api/.env (racine du projet).
export const REVERB_APP_KEY = config?.reverbAppKey || 'bbb65ac2992ff677';
