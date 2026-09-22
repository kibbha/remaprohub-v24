# ReMaPro POS

Version actuelle: **0.17.0**  
Android package: **com.remapro.pos**

## v0.17 — opérateurs POS et PIN
- profils Manager, Caissier, Serveur, Bar et Cuisine ;
- PIN 4 à 8 chiffres hashé côté PostgreSQL avec pgcrypto/bcrypt ;
- sessions opérateur temporaires de 12 h, révocables ;
- changement rapide d’opérateur depuis la barre supérieure ;
- permissions serveur : vente, caisse, remboursement, annulation, transfert, production et paramètres ;
- journal d’actions opérateur consultable par les managers ;
- si aucun profil actif n’existe, l’application conserve le comportement historique sans PIN ;
- une session déjà ouverte reste exploitable hors ligne jusqu’à son expiration.

## v0.16
SQLite natif Android avec migration automatique depuis IndexedDB.

## Suite
Paramétrage centralisé depuis ReMaPro Hub, puis liaison automatique ventes → stock/food cost.

Aucun build Android automatique n’est lancé pendant cette phase.
