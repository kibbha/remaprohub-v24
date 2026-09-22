# ReMaPro POS

Version actuelle: **0.25.0**  
Android package: **com.remapro.pos**

## v0.25 — packaging Android propre
- le runtime web est préparé dans `app/` avant synchronisation Capacitor ;
- `capacitor.config.json` utilise désormais `webDir: "app"` ;
- le projet Android est généré à la volée pendant les builds, sans être commité ;
- `app/` et `android/` sont ignorés par Git ;
- le build n’embarque plus par erreur tout le dépôt ou ses futurs fichiers Android.

Commande locale :
`npm run prepare:web && npx cap add android && npm run android`

## v0.24
Sessions Supabase et opérateur stockées dans Secure Storage sur Android.

Aucun build Android automatique n’est lancé hors du workflow de validation dédié.
