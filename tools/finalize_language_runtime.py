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

p.write_text(s, encoding='utf-8')
print('Final language runtime cleanup applied')
