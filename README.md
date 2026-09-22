# ReMaPro POS

Version actuelle: **0.9.0**  
Android package: **com.remapro.pos**

## Nouveauté v0.9 — partage par articles/personnes
- répartition d'une addition entre **2 à 8 personnes/groupes** ;
- attribution de quantités d’articles à chaque personne ;
- contrôle automatique : aucune quantité oubliée ou attribuée deux fois ;
- moyen de paiement et pourboire propres à chaque personne ;
- montant de chaque groupe recalculé côté serveur depuis les lignes de commande ;
- encaissement final atomique : soit toute la répartition passe, soit aucune écriture financière n’est créée ;
- libellé de la personne conservé dans les métadonnées de paiement et affiché sur le ticket.

Le partage simple par montants reste disponible pour les cas rapides.

## Socle
Caisse, salle, notes ouvertes, Cuisine/Bar, ajouts après envoi, impressions 80 mm, paiements multiples, pourboires, transferts, annulations, remboursements et synchronisation Hub ↔ POS.

## Suite
Tickets séparés par personne, partage progressif (une personne paie avant les autres), pilotes ESC/POS Android, Worldline/TWINT et stockage SQLite natif.

Aucun build Android automatique n’est lancé pendant cette phase.
