// Même backend que erp-app — cette app est un client dédié en plus, pas un service séparé.
// Dérivé de l'hôte courant (pas "localhost" en dur) : depuis un iPad/téléphone sur le même
// réseau, la page est chargée via l'IP LAN du Mac (ex. http://192.168.1.42:19003) — un
// "localhost" figé pointerait vers l'appareil qui affiche la page, pas vers le Mac qui fait
// tourner l'API, et tous les appels échoueraient silencieusement.
export const API_URL = `http://${window.location.hostname}:19001/api`;
