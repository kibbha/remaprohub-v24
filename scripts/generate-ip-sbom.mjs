import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const packagePath=path.join(root,'package.json');
const registryPath=path.join(root,'docs/ip-compliance/third-party-components.json');
const sbomPath=path.join(root,'docs/ip-compliance/sbom.cdx.json');
const required=[
  'LICENSE',
  'docs/ip-compliance/README.md',
  'docs/ip-compliance/third-party-components.json',
  'docs/ip-compliance/sbom.cdx.json'
];

for(const rel of required){
  if(!fs.existsSync(path.join(root,rel))){
    console.error('IP compliance: missing required file:',rel);
    process.exit(1);
  }
}

const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
const deps=pkg.dependencies||{};
const components=registry.components||[];
const byName=new Map(components.map(c=>[c.name,c]));

for(const [name,declaredVersion] of Object.entries(deps)){
  const item=byName.get(name);
  if(!item){
    console.error('IP compliance: dependency missing from registry:',name);
    process.exit(1);
  }
  if(item.declaredVersion!==declaredVersion){
    console.error('IP compliance: version mismatch for',name,'package=',declaredVersion,'registry=',item.declaredVersion);
    process.exit(1);
  }
}
for(const item of components){
  if(!(item.name in deps)){
    console.error('IP compliance: stale registry component not present in package.json:',item.name);
    process.exit(1);
  }
  if(!item.source || (!item.licenseId && !item.licenseName) || !item.status){
    console.error('IP compliance: incomplete component record:',item.name);
    process.exit(1);
  }
}

function toBom(item){
  const exact=/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(item.declaredVersion);
  const safeName=item.name.startsWith('@') ? '%40'+item.name.slice(1) : item.name;
  const component={
    type:'library',
    name:item.name,
    scope:'required',
    properties:[
      {name:'remapro:declared-version',value:item.declaredVersion},
      {name:'remapro:review-status',value:item.status},
      {name:'remapro:source',value:item.source}
    ]
  };
  if(exact){
    component.version=item.declaredVersion;
    component.purl='pkg:npm/'+safeName+'@'+item.declaredVersion;
  }else{
    component.purl='pkg:npm/'+safeName;
  }
  component.licenses=[item.licenseId?{license:{id:item.licenseId}}:{license:{name:item.licenseName}}];
  return component;
}

const sbom={
  bomFormat:'CycloneDX',
  specVersion:'1.5',
  version:1,
  metadata:{
    component:{type:'application',name:pkg.name,version:pkg.version},
    properties:[
      {name:'remapro:sbom-scope',value:'manifest-direct-dependencies'},
      {name:'remapro:branch',value:registry.branch}
    ]
  },
  components:components.map(toBom)
};
const expected=JSON.stringify(sbom,null,2)+'\n';

if(process.argv.includes('--check')){
  const current=fs.readFileSync(sbomPath,'utf8');
  if(current!==expected){
    console.error('IP compliance: committed SBOM is stale. Run node scripts/generate-ip-sbom.mjs');
    process.exit(1);
  }
  const license=fs.readFileSync(path.join(root,'LICENSE'),'utf8');
  if(!license.includes('ReMaPro Proprietary Software Notice and License')){
    console.error('IP compliance: proprietary LICENSE marker missing');
    process.exit(1);
  }
  console.log('IP compliance check OK:',components.length,'direct dependencies registered.');
}else{
  fs.writeFileSync(sbomPath,expected);
  console.log('Wrote',path.relative(root,sbomPath));
}
