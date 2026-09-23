import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(root,'docs/ip-compliance/third-party-components.json'),'utf8'));
const blockers=[];

const lockfiles=['package-lock.json','npm-shrinkwrap.json','pnpm-lock.yaml','yarn.lock'];
if(!lockfiles.some(name=>fs.existsSync(path.join(root,name))))blockers.push('No dependency lockfile is committed.');

for(const [name,version] of Object.entries(pkg.dependencies||{})){
  if(!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)){
    blockers.push(`Dependency is not pinned to an exact version: ${name} = ${version}`);
  }
}
for(const component of registry.components||[]){
  if(component.status!=='approved')blockers.push(`Third-party component not approved for release: ${component.name} [${component.status}]`);
}

const required=[
  'LICENSE','CONTRIBUTING.md','SECURITY.md','.github/CODEOWNERS',
  'docs/ip-compliance/ASSET_REGISTER.csv','docs/ip-compliance/RELEASE_CHECKLIST.md',
  'docs/ip-compliance/REPOSITORY_SPLIT_PLAN.md','docs/ip-compliance/sbom.cdx.json',
  'docs/legal-readiness/README.md'
];
for(const rel of required)if(!fs.existsSync(path.join(root,rel)))blockers.push('Missing release evidence/policy file: '+rel);

if(blockers.length){
  console.error('ReMaPro IP/security release gate: BLOCKED');
  for(const blocker of blockers)console.error(' - '+blocker);
  process.exit(1);
}
console.log('ReMaPro IP/security release gate: PASS');
