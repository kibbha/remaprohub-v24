# ReMaPro POS

Version actuelle: **0.19.0**  
Android package: **com.remapro.pos**

## v0.19 — ventes, food cost et consommation stock
- coût unitaire figé sur chaque ligne vendue au moment de la commande ;
- food cost théorique et marge brute dans le rapport POS ;
- mapping multi-composants configuré depuis ReMaPro Hub ;
- chaque vente payée crée des mouvements matière idempotents ;
- les mouvements sont repris par le module Stock du Hub sans double décrémentation ;
- un remboursement commercial ne remet pas automatiquement les ingrédients en stock.

Les articles non mappés restent vendables et ont simplement une consommation matière nulle jusqu’à leur configuration dans Hub.

## Versions précédentes
Impression ESC/POS, SQLite offline, opérateurs/PIN, paiements fractionnés/progressifs, production Cuisine/Bar, terminaux préparés et rapports Z.

Aucun build Android automatique n’est lancé pendant cette phase.
