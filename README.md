# ReMaPro POS

Version actuelle: **0.5.0**  
Android package: **com.remapro.pos**

## Fonctions disponibles
- compte et restaurants partagés avec ReMaPro Hub ;
- catalogue Hub → POS et article libre ;
- ouverture/clôture de caisse ;
- plan de salle, tables et notes ouvertes ;
- transfert de table et annulation tracée ;
- paiement simple espèces/carte/TWINT ;
- partage d’addition / plusieurs paiements ;
- pourboires par paiement ;
- tickets numérotés et historique ;
- remboursement espèces immédiat ;
- remboursement carte/TWINT enregistré en attente du prestataire puis confirmable par manager ;
- CA brut, remboursements et CA net dans le backend Hub ;
- file offline IndexedDB pour commandes et paiements ;
- clôture impossible tant qu’une note reste ouverte.

## Limites actuelles
La carte/TWINT n’est pas encore reliée à un terminal réel : ReMaPro POS ne prétend donc jamais confirmer lui-même un remboursement bancaire. KDS, imprimantes, partage par article et SQLite natif restent à venir.

Aucun build Android automatique n’est lancé pendant cette phase.
