# ReMaPro POS

Version actuelle: **0.24.0**  
Android package: **com.remapro.pos**

## v0.24 — sessions sécurisées Android
- session Supabase ReMaPro stockée dans Secure Storage sur Android ;
- session opérateur PIN stockée dans Secure Storage sur Android ;
- migration automatique des anciennes sessions depuis localStorage au premier lancement ;
- suppression de la copie localStorage après migration native ;
- fallback localStorage conservé uniquement pour l’exécution web ;
- la déconnexion efface session ReMaPro et session opérateur du stockage sécurisé.

Le POS utilise la même dépendance que ReMaPro Hub : **capacitor-secure-storage-plugin 0.12.0** sur Capacitor 7.4.3.

## v0.23
Redémarrage hors ligne depuis le cache SQLite après une première connexion réussie.

Aucun build Android automatique n’est lancé pendant cette phase.
