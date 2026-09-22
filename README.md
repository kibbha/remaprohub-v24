# ReMaPro POS

Application de caisse distincte de ReMaPro Hub, connectée à la même plateforme ReMaPro/Supabase.

Version initiale: **0.1.0**  
Android package: **com.remapro.pos**

## Objectif de cette branche
Cette branche contient uniquement la codebase POS. Elle ne contient pas ReMaPro Hub.

## État actuel
- authentification avec le compte ReMaPro existant ;
- sélection du restaurant autorisé ;
- appel de l'Edge Function `remapro-pos-sync` ;
- récupération et cache du catalogue POS ;
- enregistrement/heartbeat d'un terminal ;
- interface tablette avec catégories, produits et panier ;
- cache IndexedDB et file d'événements hors ligne ;
- paiement local de démonstration (espèces/carte/TWINT) mis en file de synchronisation ;
- aucune donnée bancaire sensible n'est collectée.

## Configuration
Les valeurs publiques Supabase sont injectées dans `runtime-config.js` pendant le build :

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Ne jamais ajouter de service role ou secret serveur dans cette application.

## Commandes
```bash
npm install
npm test
node scripts/inject-runtime-config.mjs
npx cap add android
npx cap sync android
```

## Prochaines étapes
1. écriture atomique des commandes/paiements dans le ledger POS ;
2. ouverture/clôture de caisse ;
3. plan de salle ;
4. routage cuisine/KDS ;
5. numérotation et impression des tickets ;
6. paiements terminaux Worldline/TWINT ;
7. rapprochement et clôtures.
