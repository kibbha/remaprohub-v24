# ReMaPro Hub V25.9.3

## Correctifs
- Correction du workflow d'installation GitHub : le workflow recherche désormais le package V25.9.3 exact et ne référence plus un ancien ZIP V25.9.1.
- Correction du workflow de build : restauration automatique uniquement depuis le package V25.9.3 si le dépôt n'est pas déjà à jour.
- Changement de langue renforcé : application immédiate, rerendu sécurisé module par module, puis seconde passe de traduction.
- Persistance de la langue dans `remaprohub-language` et `remaprohub-data`.
- Cache Service Worker versionné en V25.9.3.
- Version native Node package alignée sur 25.9.3.
