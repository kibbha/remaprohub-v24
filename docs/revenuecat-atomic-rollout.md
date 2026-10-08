# RevenueCat — déploiement transactionnel sécurisé (8 octobre 2026)

Statut : **à valider avant production** ; PR #69 en brouillon.

## Problème corrigé

L'ancien webhook faisait une écriture dans `subscriptions` puis une autre dans `subscription_events`. Une erreur partielle pouvait modifier le forfait sans en conserver l'événement, ou une notification arrivée hors ordre écraser un forfait plus récent.

Un index unique partiel sur `subscription_events.revenuecat_event_id` est **déjà présent dans la base actuelle**. Il limite les doublons du journal, mais **ne rend pas atomiques deux requêtes HTTP indépendantes**. L'index unique `subscriptions_organization_unique` existe aussi.

La migration `20261008093000_revenuecat_atomic_application.sql` ajoute un RPC PostgreSQL en `SECURITY INVOKER`. L'Edge Function y envoie la notification validée en une seule requête.

## Garanties du RPC

- `pg_advisory_xact_lock` sérialise tous les événements d'une organisation pendant la transaction.
- L'identifiant d'événement RevenueCat est transformé côté Edge en UUID stable : un retry garde la même clé primaire.
- Vérification en transaction de l'adhésion active de l'utilisateur.
- Refus des produits non ReMaPro, des événements plus anciens, des notifications pour l'ancien produit et des égalités d'horodatage ambiguës.
- Une seule transaction insère `subscription_events` et modifie `subscriptions` : si l'une des opérations échoue, l'autre est annulée.
- Contrôles d'expiration obligatoires avant de créer une période d'accès actif.
- `REVOKE` sur le RPC pour `PUBLIC`, `anon`, `authenticated` ; `GRANT EXECUTE` limité à `service_role`. Aucun secret service_role dans les APK.

## Ordre de déploiement obligatoire

1. Vérifier une sauvegarde exploitable des abonnements et du journal. Relever les index et déclencheurs existants.
2. Examiner et appliquer **la migration PostgreSQL en premier** dans l'environnement de staging, puis dans la production après validation.
3. Vérifier la visibilité et les droits du RPC avec les contrôles ci-dessous.
4. Publier **ensuite seulement** le webhook Edge `remapro-revenuecat-webhook`, avec `policy.mjs`.
5. Tester RevenueCat / Google Play sandbox : `INITIAL_PURCHASE`, `RENEWAL`, changement immédiat et différé, `CANCELLATION`, `EXPIRATION`, doublon, désordre, même milliseconde, et transition 1 → 3 → 1 établissements.
6. Réconcilier les transferts `TRANSFER` par l'API RevenueCat officielle avant d'autoriser cette fonctionnalité : leur webhook est ignoré de manière conservatrice ici.
7. Mettre des alertes sur les erreurs RPC, les périodes expirées, les notifications ignorées et les divergences entre l'état RevenueCat et Supabase.

Ne pas activer la vente commerciale ni fusionner la PR tant que les tests Google Play sandbox et l'authenticité des notifications ne sont pas contrôlés.

## Contrôles PostgreSQL en lecture seule

```sql
select
  has_function_privilege('anon','public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb)','EXECUTE') as anon_execute,
  has_function_privilege('authenticated','public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb)','EXECUTE') as authenticated_execute,
  has_function_privilege('service_role','public.remapro_apply_revenuecat_event(uuid,uuid,uuid,jsonb)','EXECUTE') as server_execute;
-- attendu : false, false, true

select indexname,indexdef from pg_indexes
where schemaname='public' and tablename in ('subscriptions','subscription_events');
```

## Test isolé sans toucher à la production

GitHub Actions `RevenueCat atomic PostgreSQL CI` installe la migration sur une base PostgreSQL 16 **jetable**, puis teste :
- retry avec le même ID, changement de produit, rejet des expirations anciennes ;
- contrôle des permissions ; annulation transactionnelle lorsqu'une écriture échoue ;
- deux livraisons concurrentes dans deux connexions indépendantes.

Les tests Node Hub sont complémentaires et ne remplacent pas le test SQL.

## Retour arrière

En cas d'incident, **désactiver temporairement les envois du webhook dans RevenueCat** et conserver les notifications pour réconciliation avant tout changement. Ne pas revenir silencieusement à l'ancienne version de l'Edge Function : elle réintroduirait le défaut de double écriture. La fonction SQL nouvelle peut rester installée tant que l'Edge Function ne l'appelle pas.

## Limites restantes

Les événements `TRANSFER` ne sont volontairement pas auto-appliqués. Les modifications de forfait différées ne prennent effet qu'à réception d'un vrai renouvellement / nouvel achat. Le rejet des notifications à horodatage égal est conservateur ; il doit déclencher une réconciliation si RevenueCat émet réellement deux événements distincts au même milliseconde. Il reste à vérifier sur l'environnement réel que la clé de signature HMAC / le secret du webhook sont correctement configurés, à surveiller les retards de livraison et à confirmer les droits de service_role.
