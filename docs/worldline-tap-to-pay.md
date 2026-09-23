# Worldline Tap to Pay / Tap on Mobile — ReMaPro POS

## État
ReMaPro POS contient la couche applicative et le pont Android nécessaires pour accueillir Worldline Tap on Mobile. La capture réelle reste volontairement désactivée tant que le partenariat Worldline, le SDK officiel et les identifiants de test/production ne sont pas disponibles.

## Parcours cible
1. Le serveur sélectionne **Carte** dans ReMaPro POS.
2. ReMaPro crée un intent de paiement serveur lié à la commande, la caisse, l'appareil et l'opérateur.
3. Sur un profil `tap_to_pay`, le POS appelle le pont Android `TapToPay`.
4. Le SDK Worldline prend en charge l'interface NFC/carte/PIN certifiée.
5. La vente n'est clôturée qu'après confirmation autoritative du statut `captured` côté serveur.
6. ReMaPro actualise ticket, chiffre d'affaires, finance, stock et Hub.

## Invariants de sécurité
- Aucun numéro de carte, cryptogramme ou PIN n'entre dans le JavaScript ReMaPro.
- Aucun secret Worldline n'est stocké dans Hub/POS.
- Une erreur NFC/SDK annule l'intent ReMaPro en cours au lieu de valider la vente.
- L'absence de SDK Worldline échoue explicitement avec `WORLDLINE_SDK_NOT_LINKED`.
- Le mode manuel/externe reste séparé du paiement intégré.

## Activation Worldline restante
- Finaliser le statut de partenaire / contrat Tap on Mobile.
- Obtenir le SDK Android Worldline officiel et ses conditions de distribution.
- Obtenir l'environnement marchand de test puis de production.
- Implémenter l'échange de jeton/session court côté backend.
- Implémenter la vérification serveur des callbacks/statuts Worldline.
- Relier le résultat du fournisseur à `pos_transition_payment_intent`.
- Tester NFC, refus, annulation, timeout, pourboire, remboursement et reprise après interruption.
- Activer `paymentProviders` uniquement après validation de bout en bout.
