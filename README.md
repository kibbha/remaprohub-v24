# ReMaPro POS

Version actuelle: **0.12.2**  
Android package: **com.remapro.pos**

## Nouveauté v0.12 — paiement progressif
Une table peut maintenant être encaissée personne par personne :
- sélection des articles/quantités encore impayés ;
- moyen de paiement et pourboire propres à chaque personne ;
- reçu individuel numéroté `P01`, `P02`, etc., rattaché au même ticket maître ;
- la note reste en `payment_pending` tant qu’il reste une part ;
- les quantités déjà payées ne peuvent pas être repayées ;
- les boutons de paiement global et d’annulation sont neutralisés dès qu’un paiement partiel existe ;
- la clôture de caisse reste impossible tant qu’une note partielle n’est pas entièrement soldée ;
- les reçus déjà émis sont réimprimables depuis l’écran de paiement et depuis Tickets une fois la note soldée.

Après le début d’un paiement progressif, aucun nouvel article ne peut être ajouté à la note.

## Socle
Caisse, salle, Cuisine/Bar, impressions 80 mm, rapports Z, paiements multiples, partage par articles, sous-tickets, pourboires, remboursements et synchronisation Hub ↔ POS.

## Suite
Pilotes ESC/POS Android, intégrations Worldline/TWINT, gestion des terminaux et SQLite natif.

Aucun build Android automatique n’est lancé pendant cette phase.
