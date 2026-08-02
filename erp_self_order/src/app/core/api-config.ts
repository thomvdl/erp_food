// Dérivé du host courant (pas "localhost" en dur) — nécessaire pour accéder à l'app depuis un
// autre appareil du même réseau (tablette kiosque, téléphone client) via l'IP LAN du Mac, sinon
// les appels API partiraient vers le "localhost" de l'appareil affichant la page.
export const API_URL = `http://${window.location.hostname}:19001/api`;
