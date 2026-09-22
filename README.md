# ReMaPro POS

Version actuelle: **0.15.1**  
Android package: **com.remapro.pos**

## v0.15 — impression ESC/POS native
- profils synchronisés Ticket client / Cuisine / Bar ;
- découverte des imprimantes Bluetooth et USB sur Android ;
- impression ESC/POS native avec coupe papier ;
- test d’impression par profil ;
- impression ticket et bon production via le profil correspondant ;
- fallback automatique vers le dialogue d’impression système ;
- profils réseau/TCP déjà prévus dans le modèle, mais non déclarés opérationnels sur le pilote Capacitor 7 actuel.

Le pilote natif est fixé à **@fedejm/capacitor-esc-pos-printer 0.2.3**, compatible Capacitor 7. Le projet reste en Capacitor 7.4.3 pour éviter une migration Android prématurée.

## Sécurité
Aucune donnée secrète n’est nécessaire pour une imprimante. Les profils ne contiennent que rôle, transport, adresse/ID matériel et préférences d’impression.

## Suite
Routage automatique exact des nouveaux tickets cuisine/bar, SQLite natif offline, utilisateurs/PIN et administration Hub.

Aucun build Android automatique n’est lancé pendant cette phase.

## v0.15.1 — routage automatique exact
Le backend renvoie les IDs des lignes nouvellement envoyées en production. Les profils Cuisine/Bar avec **Impression automatique** n’impriment donc que ces nouvelles lignes, jamais les plats déjà envoyés. Le ticket client peut également s’imprimer automatiquement après récupération du ticket complet.
