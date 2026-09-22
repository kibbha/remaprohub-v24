# ReMaPro POS

Version actuelle: **0.20.0**  
Android package: **com.remapro.pos**

## v0.20 — architecture prestataires prête
- lecture du registre Worldline/TWINT configuré depuis ReMaPro Hub ;
- affichage dans le POS du chemin d’intégration, environnement et état du dossier ;
- Worldline : Terminal API Cloud ou TIM ;
- TWINT : Direct ou Terminal/PSP ;
- cache offline de l’état prestataire ;
- aucune clé API ni secret marchand dans l’application ;
- aucune transaction automatique n’est activée tant que l’adaptateur officiel serveur et les identifiants réels ne sont pas installés.

Les paiements carte/TWINT restent donc enregistrables uniquement après confirmation manuelle sur un terminal externe indépendant. La bascule vers le paiement intégré se fera sans modifier les commandes, tickets, remboursements ni paiements fractionnés déjà construits.

## v0.19
Food cost théorique, consommation stock idempotente et synchronisation Hub.

Aucun build Android automatique n’est lancé pendant cette phase.
