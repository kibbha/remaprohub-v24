# ReMaPro POS

Version actuelle: **0.22.0**  
Android package: **com.remapro.pos**

## v0.22 — centre de synchronisation
- la pastille de file devient un accès direct au centre de synchronisation ;
- liste des actions en attente pour le restaurant courant ;
- type d’action, heure, opérateur d’origine, nombre de tentatives et dernière erreur ;
- relance manuelle disponible dès que le réseau revient ;
- toute erreur conserve l’action dans SQLite et incrémente son compteur de tentatives ;
- aucune suppression manuelle n’est proposée : une action de caisse n’est jamais effacée silencieusement.

## v0.21
Production Cuisine/Bar et statuts de production utilisables hors ligne avec réattribution correcte à l’opérateur d’origine.

## v0.20
Registre Worldline/TWINT prêt, transactions automatiques volontairement désactivées tant que les adaptateurs officiels ne sont pas configurés.

Aucun build Android automatique n’est lancé pendant cette phase.
