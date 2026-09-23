import {copyFile,mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const javaDir=resolve(root,'android/app/src/main/java/com/remaprohub/pos');
await mkdir(javaDir,{recursive:true});
await copyFile(resolve(root,'android-native/NetworkPrinterPlugin.java'),resolve(javaDir,'NetworkPrinterPlugin.java'));
await copyFile(resolve(root,'android-native/MainActivity.java'),resolve(javaDir,'MainActivity.java'));

const activity=await readFile(resolve(javaDir,'MainActivity.java'),'utf8');
if(!activity.includes('registerPlugin(NetworkPrinterPlugin.class);'))throw new Error('Unable to register NetworkPrinterPlugin');
if(!activity.includes('WindowInsetsCompat.Type.systemBars()'))throw new Error('Immersive POS activity missing');
if(!activity.includes('BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE'))throw new Error('Transient system-bars behavior missing');
console.log('ReMaPro network ESC/POS plugin and immersive activity installed');
