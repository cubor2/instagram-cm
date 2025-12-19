# Guide de Déploiement sur Intel NUC (Linux Mint)

Voici les étapes pour installer votre serveur d'automatisation sur votre NUC.

## 1. Préparation des Fichiers
Copiez tout le dossier du projet (`SK CM`) sur votre NUC (par clé USB ou réseau).
Disons que vous le mettez dans `~/Documents/instagram-cm`.

## 2. Installation de Node.js (Si pas déjà fait)
Ouvrez le terminal sur le NUC et lancez :
```bash
sudo apt update
sudo apt install -y nodejs npm
```
Vérifiez l'installation :
```bash
node -v
npm -v
```

## 3. Installation des dépendances
Dans le terminal, allez dans le dossier du projet :
```bash
cd ~/Documents/instagram-cm
npm install
```

## 4. Démarrage du Serveur
Pour tester que tout fonctionne :
```bash
npm start
```
Vous devriez voir :
> Server running at http://localhost:3000
> Automation active...

Ouvrez Firefox/Chrome sur le NUC et allez sur `http://localhost:3000`. Vous devriez voir votre application !

## 5. Automatisation (Lancement au démarrage)
Pour que l'application tourne 24/7 même après un redémarrage, nous allons utiliser **PM2**.

1. Installer PM2 :
```bash
sudo npm install -g pm2
```

2. Lancer l'application avec PM2 :
```bash
pm2 start server.js --name "instagram-server"
```

3. Geler la liste des processus pour le redémarrage :
```bash
pm2 save
```

4. **IMPORTANT** : Générer et activer le script de démarrage au boot.
   Tapez cette commande :
```bash
pm2 startup
```
   **Attention :** Cette commande ne fait "rien" directement. Elle va afficher une phrase dans le terminal qui ressemble à :
   `sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u votre_nom ...`
   
   **Vous devez COPIER cette ligne complète et l'exécuter** (coller puis Entrée).
   C'est cette ligne magique qui dit à Linux de lancer PM2 au démarrage.

5. Une fois la ligne "sudo env..." exécutée, verrouillez la configuration actuelle :
```bash
pm2 save
```
(Cela crée/met à jour le fichier `dump.pm2` qui sert de mémoire à PM2. Vous n'avez pas besoin de toucher à ce fichier).

## 6. Accès depuis les autres ordi
Trouvez l'adresse IP de votre NUC (commande `ip a` ou via les paramètres réseau). C'est souvent `192.168.1.XX`.

Depuis votre PC Windows ou votre téléphone connecté au Wifi, tapez :
`http://192.168.1.XX:3000`

---

## 7. Foire Aux Questions (Maintenance)

### Si je redémarre le NUC ?
Rien à faire ! Grâce à la commande `pm2 startup` réalisée à l'étape 5, l'application se relancera toute seule comme une grande dès que le NUC s'allumera.

### Comment mettre à jour l'application ?
Si vous modifiez le code sur votre PC principal et que vous voulez le mettre sur le NUC :
1.  Copiez les nouveaux fichiers (`app.js`, `index.html`, etc.) sur le NUC en écrasant les anciens. **Attention à ne pas écraser `db.json` si vous voulez garder vos posts !**
2.  Sur le NUC, dites à PM2 de recharger le code :
    ```bash
    pm2 restart instagram-server
    ```
