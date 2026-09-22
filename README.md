# ReMaPro POS

Application de caisse distincte de ReMaPro Hub, connectée à la même plateforme ReMaPro/Supabase.

Version actuelle: **0.2.0**  
Android package: **com.remapro.pos**

## Fonctionnel dans ce socle
- compte ReMaPro partagé avec Hub ;
- sélection du restaurant autorisé ;
- terminal POS identifié par UUID ;
- catalogue POS synchronisé et mis en cache ;
- ouverture de caisse avec fond initial ;
- commande avec type de service, table et couverts ;
- paiement espèces, carte ou TWINT comme moyen de paiement ;
- écriture serveur atomique commande + lignes + TVA + paiement + ticket + audit ;
- ticket numéroté par restaurant et date ;
- clôture de caisse et calcul espèces attendues / comptées / écart ;
- file offline ordonnée via IndexedDB ;
- resynchronisation automatique après retour du réseau ;
- historique local des derniers tickets.

## Sécurité
Le client n'embarque jamais de clé service-role. Les RPC financiers sont réservés au service role et ne sont appelés que par l'Edge Function authentifiée `remapro-pos-sync`. Aucune donnée PAN/CVV n'est collectée.

## Encore à construire
- publication/édition du catalogue depuis Hub ;
- plan de salle et commandes ouvertes ;
- partage de note et paiements multiples ;
- annulation/remboursement ;
- KDS/imprimantes cuisine ;
- impression ticket ;
- intégration réelle Worldline/TWINT ;
- stockage natif SQLite pour une résilience offline de production.

Aucun build Android automatique n'est attaché à cette branche pendant la phase de développement.
