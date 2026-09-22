# ReMaPro POS

Version actuelle: **0.11.0**  
Android package: **com.remapro.pos**

## Nouveauté v0.11 — rapport de service / Z
L’onglet Rapport affiche pour une date :
- CA brut, remboursements effectués pendant ce service et CA net ;
- TVA brute ;
- pourboires nets ;
- nombre de tickets, couverts et ticket moyen ;
- ventilation par espèces, carte, TWINT, etc. ;
- remboursements par moyen ;
- sessions de caisse, fonds initiaux, espèces attendues/comptées et écart ;
- impression 80 mm du rapport Z.

Les remboursements sont rattachés au **jour où ils sont réellement effectués** dans le rapport de caisse, même si le ticket original est plus ancien.

## Socle
Caisse, salle, Cuisine/Bar, impression, partage par articles/personnes, sous-tickets individuels, pourboires, transferts, annulations et remboursements.

## Suite
Partage progressif, pilotes ESC/POS Android, Worldline/TWINT, gestion terminal et SQLite natif.

Aucun build Android automatique n’est lancé pendant cette phase.
