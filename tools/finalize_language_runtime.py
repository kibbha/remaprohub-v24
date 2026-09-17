from pathlib import Path

p = Path('app/index.html')
s = p.read_text(encoding='utf-8')

s = s.replace("if(legacyLang)localStorage.removeItem('remaprohub-language');delete d.user.language;", "delete d.user.language;", 1)
s = s.replace('</section>\\n<section', '</section>\n<section')

# Screenshot-confirmed French strings written by late renderers.
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
    'Gestion opérationnelle et administrative','Votre restaurant. Vos chiffres. En un coup d’œil.',
    'Un tableau de bord clair pour décider vite et piloter mieux.','Voici l’essentiel de votre activité aujourd’hui.',
    '+ Nouvelle vente','Vente','Réservation','Commande','Recettes','Voir tout','Journée analysée',
    '+ CA du jour','+ Dépense','0 couvert(s)','0 dépense(s)','CA – dépenses','Détail des paiements utilisés pour le CA du jour.',
    'Les seuils sont configurables. Pour une utilisation réglementaire, vérifie les exigences applicables à ton établissement et ta juridiction.',
    '+ Relevé température','Équipement','Statut','Action','Actions','Bon de commande','Préparation contrôle / inspection',
    'Inventaire / stocktake','Contrat CDI / CDD','Contrat extra / horaire'
]
lang_expr = "state?.preferences?.language||'fr'"
for lit in late_literals:
    q1 = ".textContent='" + lit.replace("'", "\\'") + "'"
    q2 = '.textContent="' + lit.replace('"', '\\"') + '"'
    repl = ".textContent=translateString(" + repr(lit) + "," + lang_expr + ")"
    s = s.replace(q1, repl)
    s = s.replace(q2, repl)

# Structural fix: translate complete renderer-generated HTML BEFORE it reaches
# the DOM. This covers template literals/innerHTML that defeated textContent-only
# patches and MutationObserver timing on Android WebView.
# translateRenderedHTML preserves markup and translates only text/attribute values
# through the existing canonical translation catalogue.
helper = r'''
function translateRenderedHTML(html){
  const lang=(state&&state.preferences&&state.preferences.language)||'fr';
  if(lang==='fr'||typeof html!=='string'||!html)return html;
  const box=document.createElement('template');
  box.innerHTML=html;
  const root=box.content;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  const nodes=[];let n;
  while((n=walker.nextNode()))nodes.push(n);
  nodes.forEach(node=>{const raw=node.nodeValue;if(raw&&raw.trim()){const lead=(raw.match(/^\s*/)||[''])[0],trail=(raw.match(/\s*$/)||[''])[0],core=raw.trim();node.nodeValue=lead+translateString(core,lang)+trail;}});
  root.querySelectorAll('*').forEach(el=>['title','placeholder','aria-label'].forEach(a=>{const v=el.getAttribute&&el.getAttribute(a);if(v)el.setAttribute(a,translateString(v,lang));}));
  return box.innerHTML;
}
'''
anchor = 'function applyFullLanguage()'
if 'function translateRenderedHTML(' not in s and anchor in s:
    s = s.replace(anchor, helper+'\n'+anchor, 1)

# Wrap renderer HTML assignments globally. The helper is idempotent for French
# and for strings with no catalogue match, so this is safe across all modules.
# Avoid re-wrapping assignments if the finalizer is run more than once.
import re
pat = re.compile(r'(?P<lhs>[A-Za-z0-9_$\.\[\]\(\)]+\.innerHTML)\s*=\s*(?P<rhs>`(?:\\.|[^`])*`|\"(?:\\.|[^\"])*\"|\'(?:\\.|[^\'])*\')', re.S)
def wrap(m):
    rhs=m.group('rhs')
    if rhs.startswith('translateRenderedHTML('): return m.group(0)
    return f"{m.group('lhs')}=translateRenderedHTML({rhs})"
s = pat.sub(wrap, s)

# Header chrome is updated outside several module renderers.
needle = "function updateHeader(){"
if needle in s:
    start = s.index(needle)
    end = s.find("function ", start + len(needle))
    if end < 0: end = len(s)
    block = s[start:end]
    for lit in ('Compte','Retour','Gestion opérationnelle et administrative','Mode test local'):
        block = block.replace(".textContent='"+lit+"'", ".textContent=translateString("+repr(lit)+","+lang_expr+")")
        block = block.replace('.textContent="'+lit+'"', ".textContent=translateString("+repr(lit)+","+lang_expr+")")
    s = s[:start] + block + s[end:]

# Keep the post-render pass as fallback for legacy DOM writes, but correctness
# now primarily happens at renderer assignment time above.
render_tail = "try{applyFullLanguage()}catch(e){console.error('applyFullLanguage',e)}"
if render_tail in s and 'queueMicrotask(()=>applyFullLanguage())' not in s:
    s = s.replace(render_tail, render_tail+";try{queueMicrotask(()=>applyFullLanguage());requestAnimationFrame(()=>applyFullLanguage())}catch(e){}", 1)

p.write_text(s, encoding='utf-8')
print('Structural renderer language runtime cleanup applied')
