import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const javaDir=resolve(root,'android/app/src/main/java/com/remapro/pos');
await mkdir(javaDir,{recursive:true});
await copyFile(resolve(root,'android-native/NetworkPrinterPlugin.java'),resolve(javaDir,'NetworkPrinterPlugin.java'));

const activityPath=resolve(javaDir,'MainActivity.java');
let activity=await readFile(activityPath,'utf8');
if(!activity.includes('registerPlugin(NetworkPrinterPlugin.class);')){
  activity=activity.replace(
    /protected void onCreate\(Bundle savedInstanceState\) \{\s*/,
    match=>match+'        registerPlugin(NetworkPrinterPlugin.class);\n'
  );
}
if(!activity.includes('registerPlugin(NetworkPrinterPlugin.class);'))throw new Error('Unable to register NetworkPrinterPlugin');
await writeFile(activityPath,activity);
console.log('ReMaPro network ESC/POS plugin registered');
