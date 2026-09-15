# ReMaPro Hub V25.1.1

Correctif de déploiement de la base fonctionnelle V25.1.0.

## Correction principale

Le workflow d'installation échouait pendant son propre audit sur le tableau de bord : le dashboard est la vue active et porte donc `class="view active"`, alors que le contrôle cherchait uniquement `class="view"`.

Le contrôle V25.1.1 accepte maintenant explicitement les deux formes et vérifie les 29 vues contre les 29 entrées de navigation.

## Objectif

Conserver la base visuelle Signature et poursuivre les tests fonctionnels module par module sans modifier l'interface.
