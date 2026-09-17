from pathlib import Path

p=Path('app/index.html')
s=p.read_text(encoding='utf-8')

# Supplemental release catalogue: deterministic translations for visible UI that was
# previously left in French because it was absent from the generic dictionaries.
release={
'en':{'Chiffre d’affaires':'Revenue','Couverts':'Covers','Panier moyen':'Average spend','Food cost':'Food cost','Aucune vente enregistrée':'No sales recorded','total du jour':'today total','CA ÷ couverts':'Revenue ÷ covers','calculé depuis vos recettes':'calculated from your recipes','Évolution du chiffre d’affaires':'Revenue trend','Activité du jour':'Today’s activity','Activité récente':'Recent activity','Dernières actions enregistrées':'Latest recorded actions','Voir tout':'View all','Aucune activité récente.':'No recent activity.','À faire aujourd’hui':'To do today','Les points qui méritent votre attention':'Items requiring your attention','Hygiène & HACCP':'Hygiene & HACCP','Suivi du jour':'Today’s monitoring','Stock valorisé':'Stock value','Valeur indicative':'Indicative value','Contrôle températures':'Temperature checks','À faire':'To do','Contrôles réalisés':'Checks completed','Ouvrir HACCP':'Open HACCP','Aucun article':'No items','Gérer le stock':'Manage stock','Matin':'Morning','Midi':'Noon','Après-midi':'Afternoon','Soir':'Evening'},
'es':{'Chiffre d’affaires':'Facturación','Couverts':'Comensales','Panier moyen':'Ticket medio','Food cost':'Coste de alimentos','Aucune vente enregistrée':'Ninguna venta registrada','total du jour':'total del día','CA ÷ couverts':'Facturación ÷ comensales','calculé depuis vos recettes':'calculado a partir de sus recetas','Évolution du chiffre d’affaires':'Evolución de la facturación','Activité du jour':'Actividad del día','Activité récente':'Actividad reciente','Dernières actions enregistrées':'Últimas acciones registradas','Voir tout':'Ver todo','Aucune activité récente.':'Sin actividad reciente.','À faire aujourd’hui':'Tareas de hoy','Les points qui méritent votre attention':'Puntos que requieren su atención','Hygiène & HACCP':'Higiene y HACCP','Suivi du jour':'Seguimiento del día','Stock valorisé':'Valor del stock','Valeur indicative':'Valor indicativo','Contrôle températures':'Control de temperaturas','À faire':'Pendiente','Contrôles réalisés':'Controles realizados','Ouvrir HACCP':'Abrir HACCP','Aucun article':'Ningún artículo','Gérer le stock':'Gestionar stock','Matin':'Mañana','Midi':'Mediodía','Après-midi':'Tarde','Soir':'Noche'},
'de':{'Chiffre d’affaires':'Umsatz','Couverts':'Gäste','Panier moyen':'Durchschnittsbon','Food cost':'Wareneinsatz','Aucune vente enregistrée':'Keine Verkäufe erfasst','total du jour':'Tagessumme','CA ÷ couverts':'Umsatz ÷ Gäste','calculé depuis vos recettes':'aus Ihren Rezepten berechnet','Évolution du chiffre d’affaires':'Umsatzentwicklung','Activité du jour':'Heutige Aktivität','Activité récente':'Letzte Aktivitäten','Dernières actions enregistrées':'Zuletzt erfasste Aktionen','Voir tout':'Alle anzeigen','Aucune activité récente.':'Keine aktuellen Aktivitäten.','À faire aujourd’hui':'Heute zu erledigen','Les points qui méritent votre attention':'Punkte, die Ihre Aufmerksamkeit erfordern','Hygiène & HACCP':'Hygiene & HACCP','Suivi du jour':'Tageskontrolle','Stock valorisé':'Lagerwert','Valeur indicative':'Richtwert','Contrôle températures':'Temperaturkontrolle','À faire':'Zu erledigen','Contrôles réalisés':'Kontrollen durchgeführt','Ouvrir HACCP':'HACCP öffnen','Aucun article':'Keine Artikel','Gérer le stock':'Lager verwalten','Matin':'Morgen','Midi':'Mittag','Après-midi':'Nachmittag','Soir':'Abend'},
'it':{'Chiffre d’affaires':'Fatturato','Couverts':'Coperti','Panier moyen':'Scontrino medio','Food cost':'Costo materie prime','Aucune vente enregistrée':'Nessuna vendita registrata','total du jour':'totale del giorno','CA ÷ couverts':'Fatturato ÷ coperti','calculé depuis vos recettes':'calcolato dalle ricette','Évolution du chiffre d’affaires':'Andamento del fatturato','Activité du jour':'Attività del giorno','Activité récente':'Attività recente','Dernières actions enregistrées':'Ultime azioni registrate','Voir tout':'Vedi tutto','Aucune activité récente.':'Nessuna attività recente.','À faire aujourd’hui':'Da fare oggi','Les points qui méritent votre attention':'Punti che richiedono attenzione','Hygiène & HACCP':'Igiene & HACCP','Suivi du jour':'Monitoraggio giornaliero','Stock valorisé':'Valore magazzino','Valeur indicative':'Valore indicativo','Contrôle températures':'Controllo temperature','À faire':'Da fare','Contrôles réalisés':'Controlli effettuati','Ouvrir HACCP':'Apri HACCP','Aucun article':'Nessun articolo','Gérer le stock':'Gestisci magazzino','Matin':'Mattina','Midi':'Mezzogiorno','Après-midi':'Pomeriggio','Soir':'Sera'},
'pt':{'Chiffre d’affaires':'Faturação','Couverts':'Clientes','Panier moyen':'Ticket médio','Food cost':'Custo de alimentos','Aucune vente enregistrée':'Nenhuma venda registada','total du jour':'total do dia','CA ÷ couverts':'Faturação ÷ clientes','calculé depuis vos recettes':'calculado a partir das suas receitas','Évolution du chiffre d’affaires':'Evolução da faturação','Activité du jour':'Atividade do dia','Activité récente':'Atividade recente','Dernières actions enregistrées':'Últimas ações registadas','Voir tout':'Ver tudo','Aucune activité récente.':'Sem atividade recente.','À faire aujourd’hui':'A fazer hoje','Les points qui méritent votre attention':'Pontos que requerem a sua atenção','Hygiène & HACCP':'Higiene & HACCP','Suivi du jour':'Acompanhamento do dia','Stock valorisé':'Valor do stock','Valeur indicative':'Valor indicativo','Contrôle températures':'Controlo de temperaturas','À faire':'A fazer','Contrôles réalisés':'Controlos realizados','Ouvrir HACCP':'Abrir HACCP','Aucun article':'Nenhum artigo','Gérer le stock':'Gerir stock','Matin':'Manhã','Midi':'Meio-dia','Après-midi':'Tarde','Soir':'Noite'}
}
js='const RMP_RELEASE_UI='+repr(release).replace("'",'"').replace('True','true').replace('False','false').replace('None','null')+';\n'
needle='function translateString(raw,lang){'
if needle not in s: raise SystemExit('translateString not found')
s=s.replace(needle,js+"function translateString(raw,lang){if(lang!=='fr'&&RMP_RELEASE_UI[lang]&&Object.prototype.hasOwnProperty.call(RMP_RELEASE_UI[lang],raw))return RMP_RELEASE_UI[lang][raw];",1)

old="""function setAppLanguage(lang){
  lang=I18N[lang]?lang:'fr';
  state.preferences=state.preferences||{};
  state.preferences.language=lang;
  try{localStorage.setItem('remaprohub-data',JSON.stringify(state));}catch(e){console.error('language persistence',e)}
  document.documentElement.lang=lang;"""
new="""function setAppLanguage(lang){
  const supported=['fr','en','es','de','it','pt'];
  lang=supported.includes(lang)&&I18N[lang]?lang:'fr';
  state.preferences=state.preferences||{};
  state.preferences.language=lang;
  try{localStorage.setItem('remaprohub-language',lang);localStorage.setItem('remaprohub-data',JSON.stringify(state));}catch(e){console.error('language persistence',e)}
  document.documentElement.lang=lang;"""
if old not in s: raise SystemExit('setAppLanguage signature block not found')
s=s.replace(old,new,1)
s=s.replace("state.preferences.language=document.getElementById('profileLanguage').value;saveState();toast('Profil personnel enregistré')","setAppLanguage(document.getElementById('profileLanguage').value);saveState();toast('Profil personnel enregistré')",1)
s=s.replace("state.preferences.language=document.getElementById('appLanguage').value;state.preferences.numberFormat=","setAppLanguage(document.getElementById('appLanguage').value);state.preferences.numberFormat=",1)
s=s.replace("const supported=['fr','en','de','it','es','pt','nl','zh'];","const supported=['fr','en','es','de','it','pt'];",1)
old_boot="""  function bootstrapLanguage(){
    const lang=state?.preferences?.language;
    document.documentElement.lang=validLang(lang)?lang:'fr';
  }"""
new_boot="""  function bootstrapLanguage(){let lang=null;try{lang=localStorage.getItem('remaprohub-language')}catch(e){}if(!validLang(lang))lang=state?.preferences?.language;lang=validLang(lang)?lang:'fr';state.preferences=state.preferences||{};state.preferences.language=lang;document.documentElement.lang=lang;try{__translationCache.clear();__translationReverse=null;}catch(e){}try{renderAll()}catch(e){console.error('language bootstrap renderAll',e)}}"""
if old_boot not in s: raise SystemExit('bootstrapLanguage block not found')
s=s.replace(old_boot,new_boot,1)
for value in ('nl','zh'): s=s.replace(f'<option value="{value}">',f'<option value="{value}" disabled hidden>')
p.write_text(s,encoding='utf-8')
print('Language runtime and six-language dashboard catalogue patched successfully')
