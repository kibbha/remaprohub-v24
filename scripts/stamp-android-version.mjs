import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const {version}=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const parts=String(version).split('.').map(Number);
if(parts.length!==3||parts.some(x=>!Number.isInteger(x)||x<0))throw Error('Invalid semantic version');
const [major,minor,patch]=parts,run=Number(process.env.GITHUB_RUN_NUMBER||1);
if(!Number.isInteger(run)||run<1||run>=10000||minor>=100||patch>=100)throw Error('Invalid Android version inputs');
const versionCode=major*100000000+minor*1000000+patch*10000+run;
if(versionCode<1||versionCode>2100000000)throw Error('Android versionCode out of range');
const file=resolve(process.argv[2]||resolve(root,'android/app/build.gradle'));
let gradle=await readFile(file,'utf8');
if(!/^\s*versionCode\s+\d+\s*$/m.test(gradle)||!/^\s*versionName\s+"[^"]+"\s*$/m.test(gradle))throw Error('Capacitor version declarations not found');
gradle=gradle
  .replace(/^(\s*versionCode\s+)\d+\s*$/m,(_m,prefix)=>`${prefix}${versionCode}`)
  .replace(/^(\s*versionName\s+)"[^"]+"\s*$/m,(_m,prefix)=>`${prefix}"${version}"`);
await writeFile(file,gradle);
console.log(`Android version ${version} (${versionCode})`);
