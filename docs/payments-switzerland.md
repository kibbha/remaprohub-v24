# Paiements suisses — stratégie ReMaPro POS

## Choix de référence

ReMaPro conserve un modèle d'intents de paiement indépendant du prestataire. Le connecteur de référence pour le marché suisse est **Worldline TIM** : un même terminal intégré peut accepter cartes et TWINT, et TIM est prévu pour des caisses sur tablette/mobile.

Le POS garde les moyens `card` et `twint`. La caisse crée un `pos_payment_intent`, l'adaptateur prestataire exécute la transaction, puis un callback serveur confirme ou refuse l'intent. Un paiement n'est jamais considéré comme encaissé uniquement parce que l'utilisateur a appuyé sur le bouton.

## États avant activation live

- `waiting_contract` : contrat/acquiring à finaliser.
- `credentials_pending` : identifiants ou terminal de test manquants.
- `ready_for_adapter` : configuration ReMaPro prête, mais ce statut ne prouve pas qu'un connecteur de capture est installé.
- La capability `paymentProviders` reste à `false` tant qu'un adaptateur certifié/testé n'est pas déployé.

## Worldline TIM — recommandation principale

Chemin cible : POS → intent ReMaPro → adaptateur TIM → terminal ep2 Worldline → résultat → confirmation serveur ReMaPro.

La configuration publique (terminal ID, mode, environnement) reste dans Supabase. Les secrets/accréditations ne sont jamais stockés dans l'app.

## TWINT direct

TWINT propose une démarche de direct intégrateur pour les éditeurs de solutions POS à plusieurs commerçants. Cette voie doit être traitée comme un onboarding partenaire séparé. ReMaPro garde donc aussi un profil `twint/direct`, mais n'active aucune fausse capture avant fourniture de l'accès d'intégrateur et validation du flux.

## Alternatives évaluées

- **SumUp** : SDK Android mature pour carte et lecteurs SumUp ; pertinent comme adaptateur carte secondaire.
- **Yavin** : API Cloud, API locale et Android Intent adaptées à l'intégration POS ; pertinent comme adaptateur terminal supplémentaire. La documentation publique consultée ne suffit pas à retenir Yavin comme voie TWINT principale.
- **Worldline TIM** reste prioritaire pour une offre suisse carte + TWINT sur terminal intégré.

## Sécurité et résilience

- idempotence via `client_event_id`;
- paiement terminal séparé de la création de commande;
- statut `pending/authorized/captured/failed`;
- confirmation externe obligatoire;
- secrets uniquement serveur;
- reprise après panne par interrogation de l'intent;
- aucun basculement automatique vers “payé” en cas de timeout.
