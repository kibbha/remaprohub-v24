# ReMaPro Hub V25.2.0 — Test report

## Vérifications effectuées
- Version applicative : 25.2.0
- Navigation et vues : audit statique
- JavaScript : `node --check` PASS
- Bash : `bash -n native/scripts/prepare-android.sh` PASS
- YAML : workflows V25.2 PASS
- Essai gratuit : 7 jours, accès complet
- Standard : 9.99 CHF/mois ou 99 CHF/an
- Multi : 14.99 CHF/mois ou 150 CHF/an
- Gestion locale des plans, restaurants, managers et accès personnel
- Aide & formation conservée
- Stock par photo / IA conservé
- Paiement réel non simulé dans cette version de test

## Android
Le workflow Android repart d’un projet Capacitor Android neuf et **n’utilise pas `@capacitor/assets generate`**, afin d’éviter le problème de `AndroidManifest.xml` invalide observé précédemment. Le manifeste est validé en XML avant compilation.

Une compilation Android complète n’a pas pu être exécutée dans cet environnement : l’installation des dépendances npm a dépassé le délai disponible. Le workflow GitHub Actions est conçu pour effectuer la compilation complète sur runner Ubuntu.
