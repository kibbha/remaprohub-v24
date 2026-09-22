# ReMaPro POS

Application de caisse distincte de ReMaPro Hub, connectée à la même plateforme ReMaPro/Supabase.

Version actuelle: **0.3.1**  
Android package: **com.remapro.pos**

## Disponible
- compte et restaurants partagés avec ReMaPro Hub ;
- terminal POS identifié par UUID ;
- catalogue POS publié depuis Hub via `sync_catalog` ;
- rafraîchissement manuel + cache catalogue ;
- article libre pour tests/ventes ponctuelles sans polluer le catalogue ;
- ouverture de caisse avec fond initial ;
- commandes avec type de service, table et couverts ;
- encaissement espèces/carte/TWINT ;
- transaction atomique: commande + lignes + TVA + paiement + ticket + audit ;
- numérotation des tickets par restaurant/jour ;
- clôture avec espèces attendues, comptées et écart ;
- file offline IndexedDB rejouée dans l'ordre ;
- historique des derniers tickets.

## Sécurité
Aucune clé service-role dans le client. Les RPC financiers sont réservés au backend. Le POS ne collecte pas PAN/CVV ni données de piste bancaire.

## Suite
Plan de salle, commandes ouvertes, partage de note, remboursements, KDS/imprimantes, intégrations Worldline/TWINT et stockage SQLite natif de production.

Aucun workflow Android automatique n'est attaché à cette branche pendant le développement.
