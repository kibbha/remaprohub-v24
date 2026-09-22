# ReMaPro POS

Version actuelle: **0.13.0**  
Android package: **com.remapro.pos**

## Nouveauté v0.13 — architecture terminaux
- profils de terminaux Worldline, TWINT ou génériques ;
- rattachement possible à un appareil POS ;
- capacités Carte, TWINT, pourboire et remboursement ;
- états de connexion séparés : non configuré, configuré, en ligne, hors ligne, erreur ;
- intents de paiement/refund avec cycle `created → pending → authorized → captured/failed` ;
- aucune vente n’est comptabilisée avant `captured` ;
- les remboursements restent `pending_external` jusqu’à confirmation réelle ;
- historique des intents visible dans l’onglet **Terminaux** ;
- aucun secret/API key stocké dans les tables, le client ou GitHub.

Tant qu’aucun connecteur prestataire réel n’est actif, Carte/TWINT est enregistré uniquement après confirmation explicite que le paiement a déjà été accepté sur un terminal externe indépendant.

## Sécurité
Les transitions `captured` ne sont pas exposées au client POS. Elles sont réservées au backend/prestataire futur. Les profils ne contiennent que des informations non secrètes.

## Suite
Adaptateur prestataire réel (Worldline ou TWINT selon le contrat choisi), webhooks signés, vérification de connexion et intégration directe des paiements/refunds au terminal.

Aucun build Android automatique n’est lancé pendant cette phase.
