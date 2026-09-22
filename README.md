# ReMaPro POS

Version actuelle: **0.21.0**  
Android package: **com.remapro.pos**

## v0.21 — service offline renforcé
- envoi Cuisine/Bar disponible hors ligne ;
- les nouveaux articles sont ajoutés à la file dans l’ordre avant l’envoi production ;
- statuts production (envoyé, préparation, prêt, servi) modifiables hors ligne ;
- impression ESC/POS Cuisine/Bar continue localement pendant la coupure ;
- reprise serveur ordonnée au retour du réseau ;
- chaque action offline conserve l’ID de l’opérateur d’origine sans stocker son PIN ni son token ;
- si un autre opérateur est connecté au moment de la reprise, la synchronisation attend la reconnexion de l’opérateur d’origine au lieu de réattribuer l’action.

Les ventes, paiements cash/carte manuels, ouvertures/clôtures de caisse et commandes étaient déjà journalisés offline. Cette version étend le même mécanisme à la production.

## v0.20
Registre de préparation Worldline/TWINT sans secrets côté client.

Aucun build Android automatique n’est lancé pendant cette phase.
