import {readFile,writeFile,mkdir} from 'node:fs/promises';

const variables='android/variables.gradle';
const manifest='android/app/src/main/AndroidManifest.xml';

let gradle=await readFile(variables,'utf8');
gradle=gradle
  .replace(/compileSdkVersion\s*=\s*\d+/,'compileSdkVersion = 36')
  .replace(/targetSdkVersion\s*=\s*\d+/,'targetSdkVersion = 36');
if(!/compileSdkVersion\s*=\s*36/.test(gradle)||!/targetSdkVersion\s*=\s*36/.test(gradle)){
  throw new Error('Unable to enforce Android API 36');
}
await writeFile(variables,gradle);

let xml=await readFile(manifest,'utf8');
xml=xml.replace(/<application\b([^>]*)>/,(_m,attrs)=>{
  const clean=attrs
    .replace(/\sandroid:allowBackup="[^"]*"/g,'')
    .replace(/\sandroid:usesCleartextTraffic="[^"]*"/g,'')
    .replace(/\sandroid:networkSecurityConfig="[^"]*"/g,'');
  return '<application'+clean+' android:allowBackup="false" android:usesCleartextTraffic="false" android:networkSecurityConfig="@xml/network_security_config">';
});
xml=xml.replace(/<activity\b([^>]*android:name="\.MainActivity"[^>]*)>/,(_m,attrs)=>{
  const clean=attrs.replace(/\sandroid:launchMode="[^"]*"/g,'');
  return '<activity'+clean+' android:launchMode="singleTop">';
});
for(const required of ['android:allowBackup="false"','android:usesCleartextTraffic="false"','android:launchMode="singleTop"']){
  if(!xml.includes(required))throw new Error('Android hardening attribute missing: '+required);
}
await writeFile(manifest,xml);

await mkdir('android/app/src/main/res/xml',{recursive:true});
await writeFile('android/app/src/main/res/xml/network_security_config.xml',
  '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="false"/></network-security-config>\n'
);
console.log('Android API 36 and security hardening ready');
