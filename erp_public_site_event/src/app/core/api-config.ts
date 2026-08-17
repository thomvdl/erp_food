// Voir erp_self_order/core/api-config.ts — même principe (dérivé du host courant, pas
// "localhost" en dur, `window.__ERP_CONFIG__` prend le dessus en prod).
const config = (window as unknown as { __ERP_CONFIG__?: { apiUrl?: string } }).__ERP_CONFIG__;
export const API_URL = config?.apiUrl || `http://${window.location.hostname}:19001/api`;
