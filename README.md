# ReMaPro POS

Version actuelle: **0.14.0**  
Android package: **com.remapro.pos**

## Nouveauté v0.14 — flux terminal prêt
L’interface sait maintenant gérer le cycle terminal complet dès qu’un connecteur prestataire sera activé :
- création d’un intent pour la totalité restant due ;
- écran **En attente du terminal** ;
- actualisation automatique du statut toutes les 2 secondes ;
- affichage de la référence prestataire ;
- annulation d’un intent encore en cours ;
- passage automatique au ticket uniquement après statut `captured` ;
- échec/expiration visibles sans comptabiliser la vente ;
- réconciliation des derniers intents dans l’onglet Terminaux.

Le backend garde `paymentProviders:false` tant qu’aucun adaptateur Worldline/TWINT réel n’est configuré. Le flux automatique est donc dormant par sécurité ; Carte/TWINT reste en confirmation manuelle d’un paiement déjà accepté sur un terminal externe.

## Sécurité
Aucun bouton client ne peut forcer un intent à `captured`. Cette transition reste exclusivement côté backend/prestataire.

Aucun build Android automatique n’est lancé pendant cette phase.
