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

## Fermeture assistée – lot 17
- Ajout d’un contrôle de fermeture dans Opérations.
- ReMaPro croise les tâches de fermeture restantes et les non-conformités HACCP ouvertes avant d’afficher « Fermeture prête ».
- Les commandes opérationnelles encore ouvertes restent visibles comme avertissement sans bloquer automatiquement la fermeture.
- Le contrôle propose un accès direct à la transmission de service.
- Le rapport manager quotidien reprend désormais l’état de fermeture et le nombre de points bloquants.
- ReMaPro AI inspecte aussi cet état avant de formuler ses recommandations de fin de service.

## Analyse automatique des pertes – lot 18
- Chaque nouvelle perte est désormais datée automatiquement et mémorise le coût unitaire du produit au moment de la saisie, sans ajouter de champ à remplir.
- L’écran Pertes affiche le coût estimé sur 7 jours, le nombre de saisies et les produits qui représentent le plus de pertes.
- Lorsque la période précédente contient des données, ReMaPro affiche l’évolution du coût des pertes.
- Le rapport manager quotidien intègre le coût des pertes sur 7 jours.
- Le Manager Copilot reçoit cette analyse et peut signaler les principaux produits concernés sans inventer de chiffres.

## Échéances fournisseurs – lot 19
- Les factures fournisseurs distinguent désormais la date de facture et la date d’échéance.
- ReMaPro propose automatiquement une échéance à 30 jours lors de la saisie, tout en la laissant modifiable.
- L’écran Factures affiche le montant total restant, le montant à payer sous 7 jours et le montant réellement en retard.
- Le cockpit et les alertes de factures en retard utilisent maintenant l’échéance plutôt que la date d’émission.
- Le rapport manager quotidien intègre les montants à payer prochainement et en retard.

## Conditions de paiement fournisseurs – lot 20
- Chaque fournisseur peut maintenant définir son délai de paiement en jours, avec 30 jours par défaut.
- Lors de la création d’une facture, ReMaPro propose automatiquement l’échéance à partir du délai du fournisseur sélectionné.
- Le changement de fournisseur recalcule la proposition tant que l’utilisateur n’a pas saisi manuellement une autre échéance.
- Les factures issues d’un scan ou d’un import sans échéance explicite utilisent également le délai fournisseur connu.
- Les délais incohérents ou hors plage 0–180 jours sont refusés.

## Paiements fournisseurs proactifs – lot 21
- Les factures en retard et celles arrivant à échéance sous 7 jours deviennent une action prête dans le cockpit manager.
- Le cockpit affiche directement le montant fournisseur à traiter et signale l’action comme urgente lorsqu’une échéance est dépassée.
- Les alertes manager optionnelles comptabilisent aussi ces paiements fournisseurs.
- ReMaPro AI connaît désormais l’action « vérifier les paiements fournisseurs » et peut la proposer sans prétendre l’avoir exécutée.

## Besoins fournisseurs à 7 jours – lot 22
- Finance affiche maintenant les besoins fournisseurs estimés sur 7 jours.
- Le calcul additionne les factures en retard, les factures arrivant à échéance sous 7 jours et le budget de réassort suggéré.
- Les factures dues restent séparées du coût du personnel afin de ne pas mélanger trésorerie fournisseur et coût salarial planifié.
- L’indicateur reste présenté comme une estimation opérationnelle et ne remplace pas un plan de trésorerie comptable.

## Préparation des services – lot 23
- Planning affiche désormais les prochains jours comportant des réservations ou des services planifiés.
- ReMaPro croise les réservations avec le planning et signale les journées avec des couverts prévus mais aucun collaborateur planifié.
- Ces journées remontent dans le cockpit manager comme point à traiter et renvoient directement vers Planning.
- L’indicateur reste volontairement simple : il détecte l’absence totale d’équipe et n’invente pas un besoin d’effectif à partir d’un ratio arbitraire.

## Revue manager hebdomadaire – lot 24
- Finance affiche désormais une revue manager synthétique de la semaine : CA, résultat, couverts et points à surveiller.
- La revue consolide également food cost, coût de planning, pertes, échéances fournisseurs, HACCP, maintenance et préparation des prochains services.
- Les signaux ne créent pas de score opaque : ReMaPro conserve les indicateurs factuels et les alertes déjà calculées.
- Le Manager Copilot reçoit cette revue ainsi que la préparation des services afin de prioriser ses réponses à partir des données réelles du restaurant.

## Paiement facture en un clic – lot 25
- Une facture fournisseur en attente peut maintenant être marquée comme payée directement depuis sa ligne.
- L’action demande une confirmation et enregistre la date/heure de paiement.
- Une facture déjà payée ne peut pas être payée une seconde fois par cette action.
- Le paiement retire immédiatement la facture des échéances et alertes fournisseurs sans créer artificiellement une nouvelle dépense comptable.

## Export revue hebdomadaire – lot 26
- La revue manager hebdomadaire peut maintenant être exportée en PDF directement depuis Finance.
- Le document reprend CA, dépenses, résultat, couverts, ticket moyen, food cost, planning, pertes, échéances fournisseurs, préparation des services, HACCP et maintenance.
- La comparaison avec la semaine précédente est ajoutée lorsqu’elle est disponible.
- Aucun score opaque ni recommandation automatique n’est ajouté au document : il reste fondé sur les données enregistrées dans ReMaPro.

## Conflits planning / congés – lot 27
- ReMaPro détecte maintenant les services planifiés pendant un congé déjà approuvé.
- Les conflits des 14 prochains jours remontent dans Planning et dans le cockpit manager.
- Un congé simplement demandé ne déclenche pas de conflit tant qu’il n’est pas approuvé.
- Le système signale le problème sans supprimer ni déplacer automatiquement un service existant.
- Le Manager Copilot reçoit également ces conflits afin de les intégrer à ses priorités.

## Remplacement planning assisté – lot 28
- Lorsqu’un service entre en conflit avec un congé approuvé, ReMaPro propose jusqu’à trois collaborateurs disponibles pour le remplacer.
- Les suggestions excluent automatiquement la personne absente, les collaborateurs également en congé approuvé et ceux déjà occupés sur un horaire qui chevauche le service.
- Les collaborateurs ayant le même rôle sont proposés en priorité, puis ceux ayant le moins d’heures planifiées sur les sept jours suivants.
- Le manager peut remplacer le collaborateur directement depuis Planning, après confirmation ; aucun service n’est modifié automatiquement.

## Renouvellement des formations – lot 29
- Une formation peut maintenant comporter une date de validité/renouvellement facultative.
- ReMaPro signale les formations expirées et celles arrivant à échéance dans les 30 jours, sans inventer de durée réglementaire.
- Les alertes remontent dans le cockpit manager et dans l’écran Formation.
- Un bouton permet de créer les tâches de renouvellement correspondantes sans doublons, après confirmation.
- La date de renouvellement ne peut pas être antérieure à la date de formation.

## Contrôle allergènes recettes – lot 30
- ReMaPro compare désormais les recettes avec la matrice allergènes par nom de plat/recette.
- Il signale les recettes absentes de la matrice ainsi que les différences entre les allergènes enregistrés dans la recette et ceux de la matrice.
- Aucun allergène n’est déduit automatiquement à partir d’un ingrédient : le système contrôle uniquement la cohérence des données réellement saisies.
- Une recette absente peut préremplir la fiche allergènes ; une incohérence peut être synchronisée depuis la recette uniquement après confirmation.
- Les incohérences remontent dans le cockpit manager et sont transmises au Manager Copilot.

## Confirmation des réservations – lot 31
- Les réservations possèdent désormais un statut simple : à confirmer, confirmée, annulée ou no-show.
- Les réservations « à confirmer » prévues dans les prochaines 24 heures remontent dans le cockpit manager.
- Une réservation peut être confirmée en un clic depuis sa ligne, après confirmation de l’action.
- Les réservations annulées et no-show sont exclues des couverts utilisés pour préparer les prochains services et les briefings.
- Les anciennes réservations sans statut restent compatibles et sont considérées comme « à confirmer ».

## Suivi des livraisons refusées – lot 32
- Les livraisons refusées remontent désormais dans le cockpit manager et dans Contrôle des livraisons.
- ReMaPro peut créer en un clic les tâches de suivi correspondantes, après confirmation.
- Les tâches reprennent le fournisseur, le produit, la date, le lot et la température lorsqu’ils sont disponibles.
- Une même livraison refusée ne génère pas plusieurs tâches de suivi.
- Le Manager Copilot reçoit ce signal afin de l’intégrer aux priorités opérationnelles.
