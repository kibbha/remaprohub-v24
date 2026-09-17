from pathlib import Path

p = Path('app/index.html')
s = p.read_text(encoding='utf-8')

s = s.replace("if(legacyLang)localStorage.removeItem('remaprohub-language');delete d.user.language;", "delete d.user.language;", 1)
s = s.replace('</section>\\n<section', '</section>\n<section')

# Screenshot-confirmed French strings that are written by late renderers.
# Translate literal DOM writes at source so they cannot overwrite the selected language.
late_literals = [
    'Compte','Retour','Mode test local','Opérations','Ouverture, service, fermeture et tâches opérationnelles.',
    'Ouverture cuisine','Contrôle températures','Mise en place salle','Contrôle caisse / fond de caisse',
    'Fermeture et nettoyage','Fait','À faire','HACCP & sécurité alimentaire',
    'Relevés de température et actions correctives.','Aucun relevé de température.',
    'Finance & chiffre d’affaires','CA du jour','Dépenses du jour','Résultat du jour','Moyens de paiement',
    'Indicateurs du jour','Aucun paiement pour cette journée.','CA enregistré','Nombre total de couverts',
    'Panier moyen / couvert','Dépense moyenne','Documents',
    'Bibliothèque complète des documents professionnels et RH inclus dans ReMaPro Hub.',
    'Chiffre d’affaires','Couverts','Panier moyen','Aucune vente enregistrée','total du jour',
    'calculé depuis vos recettes','Évolution du chiffre d’affaires','Activité du jour','Activité récente',
    'Dernières actions enregistrées','Aucune activité récente.','À faire aujourd’hui',
    'Les points qui méritent votre attention','Hygiène & HACCP','Suivi du jour','Contrôles réalisés',
    'Ouvrir HACCP','Stock valorisé','Valeur indicative','Aucun article','Gérer le stock',
    'Gestion opérationnelle et administrative'
]
lang_expr = "state?.preferences?.language||'fr'"
for lit in late_literals:
    q1 = ".textContent='" + lit.replace("'", "\\'") + "'"
    q2 = '.textContent="' + lit.replace('"', '\\"') + '"'
    repl = ".textContent=translateString(" + repr(lit) + "," + lang_expr + ")"
    s = s.replace(q1, repl)
    s = s.replace(q2, repl)

# Header chrome is updated outside several module renderers.
needle = "function updateHeader(){"
if needle in s:
    start = s.index(needle)
    end = s.find("function ", start + len(needle))
    if end < 0: end = len(s)
    block = s[start:end]
    for lit in ('Compte','Retour','Gestion opérationnelle et administrative'):
        block = block.replace(".textContent='"+lit+"'", ".textContent=translateString("+repr(lit)+","+lang_expr+")")
        block = block.replace('.textContent="'+lit+'"', ".textContent=translateString("+repr(lit)+","+lang_expr+")")
    s = s[:start] + block + s[end:]

# Run a translation pass after the synchronous renderer and again on the next
# animation frame. The second pass catches renderer writes queued after renderAll.
render_tail = "try{applyFullLanguage()}catch(e){console.error('applyFullLanguage',e)}"
if render_tail in s:
    s = s.replace(render_tail, render_tail+";try{queueMicrotask(()=>applyFullLanguage());requestAnimationFrame(()=>applyFullLanguage())}catch(e){}", 1)

p.write_text(s, encoding='utf-8')
print('Final language runtime cleanup applied')
