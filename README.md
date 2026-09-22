# ReMaPro POS

Version actuelle: **0.4.0**  
Android package: **com.remapro.pos**

ReMaPro POS est l'application de caisse séparée de ReMaPro Hub, sur le même backend ReMaPro.

## Fonctionnalités présentes
- compte/restaurant partagés avec Hub ;
- catalogue Hub → POS + article libre ;
- ouverture/clôture de caisse ;
- transactions atomiques avec TVA, paiement, audit et ticket numéroté ;
- file offline IndexedDB ;
- plan de salle ;
- tables libres/occupées ;
- commandes/notes ouvertes ;
- sauvegarde et réouverture d'une note ;
- encaissement ultérieur d'une table ;
- blocage de clôture tant qu'une note reste ouverte ;
- cache local des tables, notes et tickets.

## Sécurité
Les RPC financiers ne sont exécutables que par le service role côté Edge Function. Aucun secret serveur ni donnée carte PAN/CVV n'est stocké dans le client.

## Suite
Partage de note, transferts de table, annulations/remboursements, KDS/imprimantes, terminaux Worldline/TWINT et SQLite natif.
