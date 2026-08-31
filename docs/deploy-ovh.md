# Déploiement en production sur un VPS OVH

Ce document couvre la partie **avant** ce qui est déjà documenté dans le [`Readme.md`](../Readme.md)
(section "Déploiement en production") : préparer le VPS OVH lui-même (accès, sécurité de base,
DNS, Docker) avant de lancer `docker-compose.prod.yml`. Une fois le VPS prêt, reprendre le process
du Readme tel quel — il est générique à n'importe quel VPS.

## 1. Commander et récupérer l'accès au VPS

- Manager OVHcloud → commander un VPS (Ubuntu 22.04/24.04 LTS — une gamme "Value"/"Essential"
  suffit largement pour ce projet).
- Une fois provisionné, récupérer l'IP + un mot de passe root (email + Manager OVHcloud).
- Premier login :
  ```bash
  ssh root@<IP>
  ```

## 2. Sécuriser le serveur avant tout le reste

Un VPS fraîchement créé est exposé publiquement dès le premier boot — à faire avant d'installer
quoi que ce soit d'autre.

- Créer un utilisateur non-root avec `sudo`, copier sa clé SSH publique dessus.
- Désactiver l'authentification par mot de passe en SSH (`PasswordAuthentication no` dans
  `/etc/ssh/sshd_config`, puis `systemctl restart sshd`) — ne se connecter que par clé.
- Firewall système :
  ```bash
  ufw allow 22,80,443/tcp
  ufw enable
  ```
  (80/443 sont nécessaires à Caddy pour la validation Let's Encrypt.)
- `apt update && apt upgrade -y`.
- Vérifier le **Network Firewall OVH** (Manager → section réseau du VPS, séparé du firewall
  système) : souvent désactivé par défaut, mais si activé il faut aussi y ouvrir 22/80/443.

## 3. DNS

Cible : un domaine dont les sous-domaines pointent vers l'IP du VPS (enregistrements **A**) :
`api.`, `app.`, `kiosk.`, `self-order.`, `kitchen.`, `validate-event.`, `shop.`, `ws.` (Reverb) —
plus l'apex du domaine lui-même (`mondomaine.tld`, sans sous-domaine), qui sert le site public
événementiel (`erp_public_site_event`, voir Caddyfile).

- Domaine chez OVH : Manager → Domaines → Zone DNS → ajouter un enregistrement A par sous-domaine.
- Domaine ailleurs : même principe dans le panel du registrar concerné.
- Laisser le temps à la propagation DNS avant de tester (quelques minutes en général, parfois
  plus selon le TTL).

## 4. Installer Docker sur le VPS

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER   # évite de préfixer sudo devant chaque commande docker
```
(Se déconnecter/reconnecter en SSH pour que l'appartenance au groupe `docker` prenne effet.)

## 5. Déployer le projet

Reprend exactement le process déjà documenté dans le `Readme.md` (section "Déploiement en
production" → "Process") :

```bash
git clone <repo> && cd erp_v2
cp .env.production.example .env   # remplir DOMAIN, ACME_EMAIL, secrets — checklist dans le Readme
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs caddy   # vérifier l'émission des certs Let's Encrypt (30s-1min)
```

Puis tester chaque sous-domaine dans un navigateur.

## 6. Après coup

- **Sauvegardes** : rien d'automatisé fourni par le projet — un `mysqldump` en cron suffit
  largement à cette échelle (commande exacte dans le Readme, section "Sauvegardes").
- **Mise à jour** : `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
- **Piège à connaître** (déjà noté dans le Readme) : éditer `.env` puis `restart` ne suffit
  pas — `restart` relance le conteneur avec l'environnement figé au démarrage précédent. Toute
  modification de `.env` exige `up -d` (recrée les conteneurs concernés).
