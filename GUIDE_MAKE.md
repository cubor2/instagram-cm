# Guide Configuration Make.com (Instagram Auto-Post)

Ce guide vous aide à configurer le scénario Make.com qui reçoit les données de votre NUC et publie sur Instagram.

## 1. Créer le Scénario
Créez un nouveau scénario nommé "Auto-Post NUC".

## 2. Module 1 : Webhook (Réception)
1.  Ajoutez un module **"Custom Webhook"**.
2.  Cliquez sur "Add", nommez-le "Webhook NUC".
3.  **Copiez l'URL** qui commence par `https://hook.make.com/...`
4.  Allez coller cette URL dans le fichier `.env` de votre NUC (`WEBHOOK_URL=...`).
5.  **Important :** Cliquez sur "Re-determine data structure" (ou lancez le scénario une fois) et faites "Publier Maintenant" sur votre application locale pour que Make comprenne le format des données.

## 3. Module 2 : Outils (Conversion Image)
Votre serveur envoie l'image en "Base64" (du texte). Instagram veut un fichier.
1.  Ajoutez le module **"Tools"** -> **"Set Variable"** (Ou mieux, utilisez une petite fonction de *Buffer* si disponible, mais la méthode simple marche souvent).
2.  *Alternative recommandée pour l'image :*
    Utilisez la fonction `base64` de Make.
    Dans le module suivant (Instagram), pour le champ Image, utilisez la formule :
    `toBinary(image_data)`
    *(Assurez-vous que `image_data` est bien la variable reçue du Webhook).*

## 4. Module 3 : Instagram for Business (Publication)
1.  Ajoutez le module **"Instagram for Business"** -> **"Create a Photo Post"**.
2.  Connectez votre compte Instagram Pro/Business.
3.  **Photo URL / File** :
    *   Si Make vous demande un fichier, choisissez "Map" et utilisez la variable du Webhook (ou le résultat de la conversion binaire).
    *   *Note : Souvent, Make préfère une URL publique. Si c'est le cas, il faudra passer par une étape intermédiaire (Google Drive) ou utiliser le module "Upload a Photo" pour obtenir un ID.*
    
    **Approche Robuste (Google Drive) :**
    *   Module 2 : **Google Drive** -> **Upload a File**.
        *   Data : `toBinary(image_data; "base64")` (Formule Make - Important : ajoutez le ; "base64").
        *   Name : `image_name`.
    *   Module 3 : **Instagram for Business** -> **Create a Photo Post**.
        *   Photo : Sélectionnez le fichier venant de Google Drive.
        *   Caption : Sélectionnez `text` (venant du Webhook).

## 5. Tests
1.  Activez le scénario ("ON").
2.  Sur votre App, programmez un post pour "dans 1 minute".
3.  Attendez. Le NUC va l'envoyer, Make va le recevoir et le publier !
