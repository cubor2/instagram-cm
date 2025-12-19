# Guide de Déploiement & Mises à Jour (Via GitHub)

## 1. État actuel
✅ Votre projet est connecté à : `https://github.com/cubor2/instagram-cm`

## 2. Déploiement initial sur le NUC
1.  **Clonez le projet** :
    ```bash
    git clone https://github.com/cubor2/instagram-cm.git ~/Documents/instagram-cm
    ```
2.  **SÉCURITÉ (.env)** :
    Créez le fichier `.env` sur le NUC (ne se fait qu'une fois) :
    ```bash
    cd ~/Documents/instagram-cm
    cp .env.example .env
    nano .env
    ```
    *Remplissez les clés secrets.*

3.  **Lancement** :
    ```bash
    npm install
    pm2 start server.js --name "instagram-server"
    pm2 save
    pm2 startup
    ```

---

## 3. Workflow Quotidien (Mise à jour)

### IMPORTANT : Sur votre PC (Local)
Pour travailler sur votre PC :
1.  Ouvrez un terminal (VS Code).
2.  Tapez : `npm start`
3.  Ouvrez `http://localhost:3000` dans votre navigateur.
4.  Faites vos réglages ou modifs.
5.  Dites à l'Agent : **"Sauvegarde le travail"** (Git Push).

### Sur le NUC (Production)
**Rien à faire !**
Le serveur vérifie désormais tout seul les mises à jour sur GitHub toutes les 5 minutes.
S'il détecte un changement, il redémarre automatiquement.

*Si jamais vous voulez forcer la mise à jour tout de suite :*
```bash
cd ~/Documents/instagram-cm
git pull
pm2 restart instagram-server
```
