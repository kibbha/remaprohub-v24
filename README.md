# ReMaPro POS

Version actuelle: **0.25.1**  
Android package: **com.remapro.pos**

## v0.25.1 — configuration publique reproductible
- l’URL Supabase du projet et la **publishable key** sont intégrées comme configuration publique par défaut ;
- les variables d’environnement peuvent toujours les remplacer pour un autre environnement ;
- le build Android ne dépend plus de secrets GitHub inexistants ;
- aucune clé `service_role`, `sb_secret_` ou autre secret serveur n’est embarquée dans le POS.

La publishable key est destinée aux applications web/mobile publiques ; l’autorisation utilisateur continue d’être assurée par Supabase Auth, RLS et les Edge Functions.

## v0.25 — packaging Android propre
- runtime web préparé dans `app/` ;
- `webDir: "app"` ;
- projet Android généré pendant le build ;
- `app/` et `android/` ignorés par Git.

Aucun build Android automatique n’est lancé hors du workflow de validation dédié.
