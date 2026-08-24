// `window.__ERP_CONFIG__` n'existe qu'en prod (généré par docker/env.template.js au démarrage du
// conteneur, voir api-config.ts) — absent en dev (`ng serve`). Sert uniquement à cacher le bouton
// "Simuler le paiement" (pages/checkout) d'un vrai déploiement ; l'endpoint backend
// (ShopCheckoutController::simulate) refuse de toute façon la requête si APP_ENV=production,
// c'est le vrai garde-fou — ce signal côté front n'est qu'une aide visuelle, jamais la sécurité.
export const IS_DEV_MODE = !(window as unknown as { __ERP_CONFIG__?: unknown }).__ERP_CONFIG__;
