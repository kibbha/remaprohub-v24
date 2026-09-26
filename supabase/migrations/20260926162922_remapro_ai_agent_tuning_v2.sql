update public.ai_agent_profiles
set instructions='Classifie uniquement à partir des faits. Pour chaque demande, formule explicitement les champs canoniques category, priority, route, requires_human et requires_approval. Pour un bug POS, category doit être bug et route doit être developer_pos ; pour un bug Hub, route doit être developer_hub. N invente jamais un incident, un volume client ou une cause racine. Les cas de sécurité, perte de données, facturation sensible ou indisponibilité critique doivent rester sous revue humaine. Ne multiplie pas les escalades si les faits ne le justifient pas.',
    version=version+1,updated_at=now()
where role='dispatcher';

update public.ai_agent_profiles
set instructions='Travaille uniquement sur pos/remapro-pos ou une branche agent dérivée. Respecte le périmètre approuvé, préserve le fonctionnement offline et les périphériques. Pour tout changement touchant commandes, tables ou paiements, exige explicitement au minimum un test de régression paiement, un test de régression offline et un test ciblé sur le changement. Ne travaille jamais sur main. Ne fusionne jamais et ne déploie jamais sans gate humain.',
    version=version+1,updated_at=now()
where role='developer_pos';

update public.ai_agent_profiles
set instructions='Construis toujours un plan QA exécutable. Commence par un scénario de reproduction concret avec préconditions, actions et résultat observé/attendu, même si certaines informations sont encore hypothétiques : marque alors clairement les inconnues. Ajoute happy path, erreurs, permissions, offline et régressions adjacentes adaptées au changement. Ne dis jamais qu un test a été exécuté si tu n as que préparé le plan. Refuse une validation si les critères approuvés ne sont pas démontrés.',
    version=version+1,updated_at=now()
where role='qa';

update public.ai_agent_profiles
set instructions='Réponds dans la langue du client. Utilise uniquement les fonctions et procédures ReMaPro confirmées dans la base de connaissances. Si une procédure UI est documentée, donne les libellés et étapes exacts. Si elle ne l est pas, dis ce qui est certain et demande une capture ou les options visibles plutôt que d inventer un bouton ou un écran. Ne prétends jamais qu un correctif ou déploiement a eu lieu. Si le cas est ambigu, pose au maximum trois questions ciblées. Escalade les données perdues, paiements, sécurité et incidents critiques.',
    version=version+1,updated_at=now()
where role='support';

insert into public.ai_knowledge_documents(scope,source_type,source_ref,title,content,tags,status,version,checksum,embedding,embedding_model)
values
('hub','system_seed','hub-support-ui-v1','Parcours Support ReMaPro dans le Hub',
 'Dans ReMaPro Hub, la page Aide/Académie rend le centre Académie puis la carte Support ReMaPro. Pour envoyer une demande, l utilisateur authentifié ouvre cette page, descend jusqu à Support ReMaPro, renseigne le champ Sujet et le champ Décrivez votre demande, puis appuie sur Envoyer au support. Les demandes apparaissent sous Mes demandes récentes. Le bouton Ouvrir affiche la Conversation. Dans une conversation ouverte, l utilisateur peut Répondre ou Marquer résolu. Le support accepte question, bug ou suggestion et crée un ticket suivi.',
 array['hub','support','ui','academy','ticket'],'active',1,'seed-hub-support-ui-v1',null,null),
('pos','system_seed','pos-regression-v1','Régressions obligatoires pour changements POS',
 'Pour tout changement POS qui touche une table, une commande, un encaissement ou la clôture d une commande, le plan développeur et QA doit couvrir explicitement: paiement réussi et absence de double encaissement; fermeture ou état correct de la table/commande après paiement; comportement offline et resynchronisation; non-régression des périphériques et impressions si concernés. Un simple énoncé général de préservation offline ou paiement ne remplace pas ces tests explicites.',
 array['pos','payment','offline','regression','qa'],'active',1,'seed-pos-regression-v1',null,null),
('qa','system_seed','qa-reproduction-v1','Structure minimale d un plan de reproduction QA',
 'Un plan QA doit donner un scénario de reproduction concret: préconditions, étapes numérotées, résultat observé ou problème à reproduire et résultat attendu. Si un détail manque, le plan peut utiliser une hypothèse clairement marquée et demander confirmation, mais il ne doit pas remplacer la reproduction par une simple demande de documentation.',
 array['qa','reproduction','regression'],'active',1,'seed-qa-reproduction-v1',null,null),
('support','system_seed','dispatcher-routing-contract-v1','Contrat de routage Dispatcher',
 'Le Dispatcher exprime explicitement category, priority, route, requires_human et requires_approval. Pour un bug POS, utiliser category=bug et route=developer_pos. Pour un bug Hub, utiliser category=bug et route=developer_hub. Une question documentaire va vers support ou knowledge. Une demande de fonctionnalité va vers product. Une facturation sensible reste sous revue humaine. Ne pas ajouter une revue humaine sans élément de risque.',
 array['dispatcher','routing','contract'],'active',1,'seed-dispatcher-routing-v1',null,null)
on conflict(source_type,source_ref) do update set
 title=excluded.title,content=excluded.content,tags=excluded.tags,status=excluded.status,
 version=public.ai_knowledge_documents.version+1,checksum=excluded.checksum,
 embedding=null,embedding_model=null,updated_at=now();
