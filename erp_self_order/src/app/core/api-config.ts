// Dérivé du host courant (pas "localhost" en dur) — nécessaire pour accéder à l'app depuis un
// autre appareil du même réseau (tablette kiosque, téléphone client) via l'IP LAN du Mac, sinon
// les appels API partiraient vers le "localhost" de l'appareil affichant la page.
// En prod, `window.__ERP_CONFIG__` (voir docker/env.template.js) prend le dessus avec la vraie
// URL du domaine.
const config = (window as unknown as { __ERP_CONFIG__?: { apiUrl?: string } }).__ERP_CONFIG__;
export const API_URL = config?.apiUrl || `http://${window.location.hostname}:19001/api`;
