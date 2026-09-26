import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('../app/manifest.json',import.meta.url),'utf8');
const cap=JSON.parse(fs.readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

for(const token of ['platform_context','platform_inbox','platform_ticket','platform_reply','platform_review_approval','platform_job_action','AI Operations','Support clients','Équipe IA','Travaux développeur','Validations humaines']) {
  if(!app.includes(token)) throw new Error('Missing Ops token: '+token);
}
if(cap.appId!=='com.remaprohub.ops')throw new Error('Wrong Ops package id');
if(cap.appName!=='ReMaPro OPS')throw new Error('Wrong Ops app name');
if(pkg.name!=='remapro-ops'||pkg.version!=='0.3.1')throw new Error('Wrong Ops package metadata');
if(!index.includes('<title>ReMaPro Ops</title>'))throw new Error('Ops title missing');
if(!manifest.includes('"short_name":"ReMaPro OPS"'))throw new Error('Ops manifest branding missing');
if(app.includes('recordRestaurant(')||app.includes('renderPosLayoutEditor('))throw new Error('Ops must not expose restaurant-management UI');
console.log('ReMaPro Ops standalone application checks passed');


const trainingTokens=[
  'Entraînement','training_dashboard','run_training_case','embed_knowledge','run_agent',
  'Tester le suivant','Base de connaissances','Cas d’entraînement','timeoutMs:60000'
];
for(const token of trainingTokens)if(!app.includes(token))throw new Error('Missing Ops training UI token: '+token);
if(!app.includes("const VERSION='0.3.1'"))throw new Error('Ops version must be 0.3.1');

for(const token of ['trainingAction','Aucune vectorisation effectuée','limit:5'])if(!app.includes(token))throw new Error('Missing Ops indexing recovery token: '+token);

const simulationTokens=[
  'Simulation Lab','simulation_dashboard','simulation_create_campaign','simulation_generate_batch',
  'simulation_run_batch','simulation_promote_finding','Faiblesses détectées','Générer ','Tester 1',
  "const VERSION='0.3.1'"
];
for(const token of simulationTokens)if(!app.includes(token))throw new Error('Missing Ops Simulation Lab token: '+token);

for(const token of ['maxDailyCases','auto_on','auto_off','Auto serveur','tick toutes les 20 minutes'])if(!app.includes(token))throw new Error('Missing Simulation Lab server-auto token: '+token);
for(const forbidden of ['scheduleSimulationAuto','runSimulationAutoStep','simulationAutoBlocked'])if(app.includes(forbidden))throw new Error('Local Simulation Auto loop must be removed: '+forbidden);

const simStart=app.indexOf('function simulationView()');
const simEnd=app.indexOf('function jobsView()',simStart);
if(simStart<0||simEnd<0)throw new Error('Simulation Lab view block not found');
const simBlock=app.slice(simStart,simEnd);
for(const forbidden of ['open_ticket','platform_review_approval','platform_job_action'])if(simBlock.includes(forbidden))throw new Error('Simulation Lab UI must stay isolated from production action: '+forbidden);
