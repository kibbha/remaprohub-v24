# ReMaPro POS

Version actuelle: **0.25.2**  
Android package: **com.remapro.pos**

## v0.25.2 — bridge natif sans bundler
- SQLite utilise directement le plugin natif `CapacitorSQLite` enregistré par Capacitor ;
- l’impression ESC/POS utilise directement `EscPosPrinter` ;
- aucun `import('@package/npm')` n’est exécuté dans le WebView ;
- les dépendances npm restent épinglées pour que `cap sync` installe les plugins Android ;
- le runtime statique `app/` reste utilisable sans bundler JavaScript.

Cette correction évite le cas où l’APK compile correctement mais où SQLite ou l’impression échouent au runtime faute de résolution des modules npm.

## v0.25.1
Configuration Supabase publique reproductible, sans secret serveur.

Aucun build Android automatique n’est lancé hors du workflow de validation dédié.
