# ReMaPro POS

Version actuelle: **0.16.0**  
Android package: **com.remapro.pos**

## v0.16 — offline natif SQLite
- stockage natif SQLite sur Android pour le cache local et la file de synchronisation ;
- fallback IndexedDB sur le web ;
- migration automatique des anciennes données IndexedDB vers SQLite au premier démarrage natif ;
- persistance des commandes en attente, session de caisse, catalogue, tables, tickets, terminaux et imprimantes via la même API locale ;
- reprise de la file de synchronisation après redémarrage de l’app.

Le plugin **@capacitor-community/sqlite 7.0.3** est fixé explicitement pour rester compatible avec Capacitor 7.

## v0.15
Impression ESC/POS Bluetooth/USB, profils Ticket/Cuisine/Bar et routage automatique exact des nouveaux articles.

## Suite
Utilisateurs/PIN et changement rapide de serveur, paramétrage Hub, puis liaison ventes → stocks/food cost.

Aucun build Android automatique n’est lancé pendant cette phase.
