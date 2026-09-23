import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const javaDir=resolve(root,'android/app/src/main/java/com/remaprohub/pos');
await mkdir(javaDir,{recursive:true});
await copyFile(resolve(root,'android-native/NetworkPrinterPlugin.java'),resolve(javaDir,'NetworkPrinterPlugin.java'));

const activityPath=resolve(javaDir,'MainActivity.java');
let activity=await readFile(activityPath,'utf8');

if(!activity.includes('registerPlugin(NetworkPrinterPlugin.class);')){
  if(!activity.includes('import android.os.Bundle;')){
    activity=activity.replace(/(package\s+[^;]+;\s*)/, '$1\nimport android.os.Bundle;\n');
  }

  if(/protected\s+void\s+onCreate\s*\(Bundle\s+savedInstanceState\)\s*\{/.test(activity)){
    activity=activity.replace(
      /protected\s+void\s+onCreate\s*\(Bundle\s+savedInstanceState\)\s*\{\s*/,
      match=>match+'        registerPlugin(NetworkPrinterPlugin.class);\n'
    );
  }else{
    const method=`
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NetworkPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
`;
    activity=activity.replace(/}\s*$/,method+'\n}\n');
  }
}

if(!activity.includes('registerPlugin(NetworkPrinterPlugin.class);'))throw new Error('Unable to register NetworkPrinterPlugin');
if(!activity.includes('import android.os.Bundle;'))throw new Error('Unable to import android.os.Bundle');
await writeFile(activityPath,activity);
console.log('ReMaPro network ESC/POS plugin registered');
