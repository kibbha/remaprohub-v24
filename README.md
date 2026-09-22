# ReMaPro POS

Version actuelle: **0.23.0**  
Android package: **com.remapro.pos**

## v0.23 — redémarrage hors ligne
- après la première connexion réussie, l’identité ReMaPro et les restaurants autorisés sont mis en cache local ;
- un redémarrage du téléphone sans réseau recharge le dernier restaurant depuis SQLite ;
- catalogue, tables, commandes ouvertes, caisse, opérateur encore valide, imprimantes et file de synchronisation restent disponibles ;
- si le serveur est momentanément indisponible alors que le réseau existe, le POS retombe sur le cache local au lieu de devenir inutilisable ;
- la déconnexion explicite efface le cache d’identité ;
- si une session PIN a expiré, le PIN n’est jamais vérifié localement : Internet est requis pour l’authentifier à nouveau.

## v0.22
Centre de synchronisation avec erreurs, tentatives et relance manuelle.

Aucun build Android automatique n’est lancé pendant cette phase.
