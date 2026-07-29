// Dérivé de l'hôte courant (pas "localhost" en dur) — nécessaire pour accéder à l'app depuis
// un autre appareil sur le même réseau via l'IP LAN du Mac (ex. depuis un iPad), sinon les
// appels API partiraient vers "localhost" de l'appareil qui affiche la page, pas du Mac.
export const API_URL = `http://${window.location.hostname}:19001/api`;
