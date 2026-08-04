// Dérivé de l'hôte courant (pas "localhost" en dur) — nécessaire pour accéder à l'app depuis
// un autre appareil sur le même réseau via l'IP LAN du Mac (ex. depuis un iPad), sinon les
// appels API partiraient vers "localhost" de l'appareil qui affiche la page, pas du Mac.
// En prod, `window.__ERP_CONFIG__` (voir docker/env.template.js) prend le dessus avec la vraie
// URL du domaine.
const config = (window as unknown as { __ERP_CONFIG__?: { apiUrl?: string } }).__ERP_CONFIG__;
export const API_URL = config?.apiUrl || `http://${window.location.hostname}:19001/api`;
