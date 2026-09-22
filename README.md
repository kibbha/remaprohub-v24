# ReMaPro POS

Version actuelle: **0.7.0**  
Android package: **com.remapro.pos**

## Nouveauté v0.7
Une table déjà envoyée en Cuisine/Bar peut recevoir de nouveaux articles sans renvoyer les anciens :
- les lignes déjà envoyées sont verrouillées et marquées **Envoyé** ;
- les nouveaux articles portent le badge **Ajout** ;
- **Envoyer les ajouts** n’envoie que ces nouvelles lignes ;
- les anciens plats conservent leur état de production ;
- l’encaissement est bloqué tant qu’un ajout n’a pas été envoyé.

## Socle déjà présent
Caisse, plan de salle, tickets, paiements multiples, pourboires, annulations, remboursements, Cuisine/Bar, suivi Préparer → Prêt → Servi, catalogue Hub → POS et synchronisation offline.

## Suite
Impression thermique, tickets cuisine/bar imprimables, partage d’addition par article, intégrations Worldline/TWINT et SQLite natif de production.

Aucun build Android automatique n’est lancé pendant cette phase.
