from pathlib import Path

p = Path('app/index.html')
s = p.read_text(encoding='utf-8')

# The release runtime deliberately mirrors the selected language in this key.
# Legacy loadState() used to delete it immediately at startup, which made the
# bootstrap path contradictory and could reintroduce stale language state.
s = s.replace("if(legacyLang)localStorage.removeItem('remaprohub-language');delete d.user.language;", "delete d.user.language;", 1)

# A few section joins were accidentally committed as visible backslash+n text.
# Convert only the safe HTML section-boundary form, never JS string escapes.
s = s.replace('</section>\\n<section', '</section>\n<section')

# Header chrome is updated outside several module renderers. Translate it at the
# final write point so late renders cannot restore French Account/Back/subtitle.
needle = "function updateHeader(){"
if needle in s:
    start = s.index(needle)
    end = s.find("function ", start + len(needle))
    if end < 0: end = len(s)
    block = s[start:end]
    block = block.replace(".textContent='Compte'", ".textContent=translateString('Compte',state?.preferences?.language||'fr')")
    block = block.replace('.textContent="Compte"', ".textContent=translateString('Compte',state?.preferences?.language||'fr')")
    block = block.replace(".textContent='Retour'", ".textContent=translateString('Retour',state?.preferences?.language||'fr')")
    block = block.replace('.textContent="Retour"', ".textContent=translateString('Retour',state?.preferences?.language||'fr')")
    block = block.replace(".textContent='Gestion opérationnelle et administrative'", ".textContent=translateString('Gestion opérationnelle et administrative',state?.preferences?.language||'fr')")
    block = block.replace('.textContent="Gestion opérationnelle et administrative"', ".textContent=translateString('Gestion opérationnelle et administrative',state?.preferences?.language||'fr')")
    s = s[:start] + block + s[end:]

# Always run the full language pass once after renderAll completes. This covers
# static header nodes as well as dynamic nodes added by individual renderers.
render_tail = "try{applyFullLanguage()}catch(e){console.error('applyFullLanguage',e)}"
if render_tail in s:
    s = s.replace(render_tail, render_tail+";try{queueMicrotask(()=>applyFullLanguage())}catch(e){}", 1)

p.write_text(s, encoding='utf-8')
print('Final language runtime cleanup applied')
