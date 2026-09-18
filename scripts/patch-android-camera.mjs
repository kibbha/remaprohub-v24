import {readFile,writeFile} from 'node:fs/promises';

const path='android/app/src/main/AndroidManifest.xml';
let xml=await readFile(path,'utf8');
const permission='<uses-permission android:name="android.permission.CAMERA" />';
if(!xml.includes('android.permission.CAMERA')){
  const match=xml.match(/<manifest\b[^>]*>/);
  if(!match)throw new Error('Android manifest root not found');
  xml=xml.replace(match[0],match[0]+'\n    '+permission);
  await writeFile(path,xml);
}
const verify=await readFile(path,'utf8');
if(!verify.includes('android.permission.CAMERA'))throw new Error('Camera permission was not applied');
console.log('Android camera permission ready');
