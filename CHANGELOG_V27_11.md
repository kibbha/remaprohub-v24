# ReMaPro Hub V27.11.0

## Objectif
ReMaPro Hub reste un assistant de gestion pour la restauration, pas un système de caisse. Cette version consolide les modules existants autour d'un cockpit manager simple et proactif.

## Nouveautés
- Cockpit « À surveiller aujourd'hui » sur le tableau de bord.
- ReMaPro AI enrichi avec le contexte opérationnel manager et des questions rapides.
- Suggestions de réapprovisionnement à partir des seuils de stock.
- Historique des prix fournisseurs alimenté par le scan IA des factures.
- Alertes sur les variations significatives de prix fournisseurs.
- Portefeuille recettes : food cost moyen, recettes hors objectif et prix cible conseillé.
- Planning : heures prévues, coût salarial estimé, taux horaires manquants et alertes de surcharge.
- HACCP : compteur de non-conformités ouvertes et export d'un dossier d'inspection PDF.
- Finance : visibilité food cost / coût de planning en complément des KPI existants.
- Intégrations : catalogue visible pour Lightspeed, Square, Bexio, Abacus et Zenchef sans fausse connexion ; les connexions live nécessitent les identifiants/API des fournisseurs.
- Synchronisation cloud étendue à l'historique des prix fournisseurs.
- Offline/PWA mis à jour pour le nouveau moteur d'intelligence.

## Backend
- remapro-sync étendu pour priceHistory.
- remapro-ai renforcé en « Manager Copilot » et connecté au secret OPENAI_API_KEY Supabase.

## Validation
- Suite complète `npm test` validée sur V27.11.0 après le dernier enrichissement planning/menu.
- Validation GitHub Actions finale : succès.

## Automatisation gestion – lot 2
- Plan d’achats automatique groupé par fournisseur à partir des seuils de stock.
- Budget de réassort estimé et détection des articles sans fournisseur attribué.
- Détection des recettes touchées par les variations de prix fournisseurs.
- Vue Finance enrichie avec engagements planifiés indicatifs (réassort + planning salarial).
- Nouveau raccourci IA dédié à la préparation des achats.

## Actions prêtes à exécuter – lot 3
- Création d’un bon de commande prérempli depuis chaque suggestion d’achat associée à un fournisseur, après confirmation du manager.
- Génération en un clic des tâches correctives HACCP pour les non-conformités ouvertes, sans doublons.
- Application confirmée du prix conseillé sur une recette pour revenir à l’objectif de food cost.
- Les actions automatiques restent proposées et nécessitent une validation humaine avant toute écriture métier.

## Simplicité et positionnement – lot 4
- Le cockpit manager regroupe maintenant les actions immédiatement exécutables et les prochaines étapes de configuration.
- Les actions prêtes renvoient directement vers HACCP, achats ou recettes selon le besoin.
- Les éléments manquants de mise en route sont accessibles depuis le tableau de bord.
- L’écran de ventes/commandes est explicitement présenté comme un suivi opérationnel : ReMaPro Hub ne devient pas un système de caisse et n’encaisse aucun paiement.

## Optimisation fournisseurs – lot 5
- Comparaison automatique des derniers prix connus par fournisseur pour un même article.
- Détection du fournisseur actuellement le moins cher à partir de l’historique des factures scannées.
- Estimation de l’économie potentielle sur le prochain réassort lorsque plusieurs fournisseurs sont connus.
- Affichage des opportunités directement dans Achats, sans changer automatiquement de fournisseur.

## Assistant proactif – lot 6
- ReMaPro AI exploite explicitement les actions prêtes et les opportunités d’économie fournisseurs avant les conseils génériques.
- L’assistant indique lorsqu’une action confirmable existe dans l’app sans prétendre l’avoir exécutée.
- Ajout d’une alerte Android optionnelle « Actions manager », désactivée par défaut pour éviter le bruit.
- L’écran IA affiche maintenant le nombre total d’actions prêtes.

## Réassort précis – lot 7
- Chaque article peut maintenant définir un stock cible distinct du stock minimum.
- Les suggestions de commande utilisent ce stock cible lorsqu’il est renseigné, sinon conservent le calcul automatique.
- La comparaison des fournisseurs refuse désormais les comparaisons de prix entre unités différentes afin d’éviter de faux gains (par exemple carton vs kg).

## Navigation simplifiée – lot 8
- L’écran « Plus » met désormais en avant six fonctions essentielles avant les outils avancés.
- Tous les autres modules restent accessibles dans des groupes repliés pour éviter l’effet « usine à gaz ».
- Ajout d’une recherche instantanée des fonctions, respectant les droits d’accès de l’utilisateur.
- Aucun module n’est supprimé : la simplification concerne uniquement la navigation.

## Cockpit selon les droits – lot 9
- Le cockpit « À surveiller aujourd’hui » respecte désormais strictement les droits d’accès de chaque compte.
- Les tendances financières ne sont affichées qu’aux utilisateurs autorisés à consulter Finance.
- Les priorités, actions prêtes et raccourcis de configuration sont filtrés par module autorisé.
- Le bouton ReMaPro AI disparaît pour les profils sans droit IA.

## Démarrage express – lot 10
- Le cockpit propose maintenant au maximum trois prochaines étapes de configuration, dans l’ordre le plus rapide pour rendre ReMaPro utile.
- Pour initialiser le stock, ReMaPro privilégie le scan d’une facture fournisseur : une seule action peut créer fournisseur, stock, prix, livraison, achat et historique de prix.
- Le premier fournisseur détecté par facture devient automatiquement le fournisseur préféré d’un nouvel article, sans écraser un choix déjà défini par le manager.
- À la réception d’une livraison, le fournisseur est prérempli automatiquement depuis le fournisseur préféré ou l’historique connu du produit.
- La configuration Finance n’est considérée terminée qu’après une vraie saisie de CA/couverts, et non après une simple dépense fournisseur.

## Planning accéléré – lot 11
- Ajout d’un bouton « Reprendre la semaine précédente » dans Planning.
- Les services de la semaine précédente sont copiés sur les mêmes jours et horaires, sans créer de doublons.
- Les collaborateurs supprimés ou invalides ne sont pas recréés automatiquement.
- L’action reste confirmée par le manager avant modification du planning.

## HACCP express – lot 12
- ReMaPro repère automatiquement les postes de contrôle HACCP récurrents à partir des relevés précédents.
- Un bouton par poste permet de reprendre instantanément zone, équipement, seuils et responsable.
- La température actuelle reste volontairement vide afin qu’elle soit réellement mesurée à chaque contrôle.
- Aucun ancien relevé n’est dupliqué : le raccourci sert uniquement à préremplir le nouveau contrôle.

## Briefing automatique – lot 13
- ReMaPro prépare maintenant un briefing opérationnel du service à partir du planning du jour, des réservations, des anomalies HACCP, du stock bas et des tâches encore ouvertes.
- Le briefing reste un brouillon prérempli : le responsable peut le relire et le modifier avant enregistrement.
- Le même moteur peut préremplir une transmission de service afin d’éviter la ressaisie des points importants.
- Aucun chiffre financier n’est injecté dans ces écrans opérationnels afin de respecter les droits d’accès du personnel.
- Le cockpit manager signale lorsqu’un briefing du jour utile reste à préparer.

## Rapport manager du jour – lot 14
- Ajout d’un rapport PDF quotidien accessible directement depuis Finance.
- Le rapport synthétise CA, dépenses, résultat, couverts, ticket moyen, HACCP, stock bas, tâches urgentes, factures, opportunités fournisseurs, food cost, planning et réservations du jour.
- Lorsque l’historique le permet, le rapport ajoute l’évolution par rapport à la semaine précédente.
- Après 17 h, le cockpit peut proposer la génération du rapport si des données utiles existent et si le rapport n’a pas encore été exporté sur l’appareil.
- ReMaPro AI connaît cette action et peut la suggérer au manager sans prétendre l’avoir exécutée.

## Maintenance proactive – lot 15
- ReMaPro détecte les équipements hors service, les entretiens marqués « à prévoir », les échéances dépassées et les entretiens à venir sous 30 jours.
- Ces points remontent automatiquement dans le cockpit manager selon leur niveau d’urgence.
- L’écran Équipements affiche désormais une synthèse des éléments à surveiller.
- Un bouton permet de générer les tâches manager correspondantes sans doublons, après confirmation.
- Le rapport manager quotidien inclut maintenant le nombre d’équipements nécessitant une attention et les équipements hors service.
- ReMaPro AI connaît cette nouvelle action de maintenance.

## Routines quotidiennes automatiques – lot 16
- Les checklists personnalisées alimentent automatiquement les tâches du jour avec leur catégorie ouverture, fermeture ou nettoyage.
- Le plan de nettoyage quotidien alimente également les tâches du jour ; les tâches hebdomadaires et mensuelles reviennent uniquement lorsqu’elles sont à nouveau dues.
- La validation d’une routine mémorise sa dernière exécution afin d’éviter de la reproposer trop tôt.
- L’écran Opérations affiche maintenant l’avancement global, les points d’ouverture restants et les points de fermeture restants.
- Lorsque toutes les tâches de fermeture sont validées, ReMaPro affiche clairement « Fermeture prête ».
- Le rapport manager quotidien inclut le taux de réalisation des routines et les tâches de fermeture encore ouvertes.
