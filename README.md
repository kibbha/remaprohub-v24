# ReMaPro POS

Version actuelle: **0.26.0**  
Android package: **com.remapro.pos**

## v0.26.0 — implantation caisse & modificateurs (issue #6)
- implantation publiée depuis ReMaPro Hub > POS avec pages, catégories, sous-catégories et favoris ;
- ordre libre des touches par glisser-déposer, position, taille et couleur ;
- articles masqués ou temporairement indisponibles ;
- modificateurs structurés : cuisson, accompagnements, suppléments, sans ingrédient et notes ;
- menus/compositions avec choix obligatoires ou optionnels ;
- routage Cuisine/Bar au niveau article, modificateur et composant de menu ;
- publication versionnée et immuable avec checksum ;
- cache offline du layout publié et fallback automatique vers l’ancien catalogue si aucun layout n’existe ;
- modificateurs conservés dans les lignes de commande, tickets, production et impression ESC/POS ;
- modification réservée aux managers depuis le Hub.

Les données de commande conservent prix, TVA, recette, station de production et modificateurs au passage offline/serveur.

## v0.25.2
Bridge natif Capacitor sans bundler pour SQLite et impression ESC/POS.

Le build Android de validation reste déclenché uniquement de façon contrôlée afin de préserver le quota GitHub Actions.
