# Synchronisation stock ReMaPro Hub ↔ POS

## Principe

Le POS ne remplace jamais directement la quantité de base `stock.qty`. Une vente payée génère un mouvement immuable dans `pos_inventory_movements`. Le serveur l'applique immédiatement au workspace Hub comme un événement `stockMoves` avec le même `posMovementId`.

Le stock disponible reste calculé comme une somme d'événements :

`stock.qty + livraisons acceptées - pertes + stockMoves`.

## Déduplication

`posMovementId` est la clé d'idempotence. Si un événement POS est rejoué après une coupure réseau ou une reprise d'application, il n'est appliqué qu'une seule fois au Hub.

## Hors ligne et conflits

- Une caisse hors ligne conserve ses opérations dans sa file locale puis les rejoue à la reconnexion.
- Une vente POS appliquée côté serveur incrémente `restaurant_workspaces.revision` et `key_revisions.stockMoves`.
- Si Hub modifie hors ligne un autre domaine (par exemple planning), la synchronisation granulaire peut fusionner les clés non conflictuelles.
- Si Hub modifie `stockMoves` à partir d'une ancienne révision pendant qu'un POS a ajouté des ventes, le serveur renvoie `SYNC_CONFLICT` sur `stockMoves` au lieu d'écraser les événements de vente.
- Après conflit, Hub doit récupérer l'état serveur puis réappliquer une correction sous forme de mouvement de stock.
- Les corrections de quantité doivent être enregistrées comme mouvements (entrée, sortie, ajustement), pas comme écrasement silencieux de la quantité de base.

## Garantie transactionnelle

L'application serveur verrouille la ligne `restaurant_workspaces`, ajoute le mouvement, incrémente la révision de workspace et marque le mouvement POS comme accusé dans la même transaction Postgres. En cas d'échec, toute la transaction de vente/consommation est annulée.
