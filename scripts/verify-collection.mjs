import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,relative,sep,isAbsolute} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const argument=process.argv[2];
if(!argument)throw Error('Usage: node scripts/verify-collection.mjs collections/ryoko-island.json');
const file=resolve(root,argument),inside=relative(root,file);
if(inside.startsWith('..'+sep)||inside==='..'||isAbsolute(inside))throw Error('Collection must belong to this repository');
const collection=JSON.parse(await readFile(file,'utf8'));
const base=new URL(collection.baseUrl);
if(collection.version!==1||base.protocol!=='https:'||base.username||base.password||!Array.isArray(collection.objects)||!collection.objects.length||collection.objects.length>64)throw Error('Invalid image collection');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const rows=[];
for(const item of collection.objects){
 const match=/^objects\/([a-f0-9]{64})\.(png|jpg|jpeg|webp|gif|avif)$/.exec(item.object);
 if(!match||match[1]!==item.sha256||!Number.isSafeInteger(item.bytes)||item.bytes<1||!/^image\/[a-z]+$/.test(item.mime))throw Error('Invalid immutable image entry');
 const local=await readFile(resolve(root,item.object));
 if(local.length!==item.bytes||digest(local)!==item.sha256)throw Error('Local source differs: '+item.object);
 const url=new URL(item.object,base).href;
 try{
  const response=await fetch(url,{headers:{Origin:'https://naishou.ygora.net','Cache-Control':'no-cache'},signal:AbortSignal.timeout(15000)});
  const bytes=Buffer.from(await response.arrayBuffer()),sha256=digest(bytes),mime=(response.headers.get('content-type')||'').split(';')[0].trim(),cors=response.headers.get('access-control-allow-origin');
  const verified=response.status===200&&bytes.length===item.bytes&&sha256===item.sha256&&mime===item.mime&&cors==='*';
  rows.push({asset:item.asset,url,status:response.status,bytes:bytes.length,sha256,mime,cors,verified});
 }catch(error){rows.push({asset:item.asset,url,verified:false,error:error.message});}
}
const verified=rows.every(row=>row.verified);
console.log(JSON.stringify({collection:collection.id,checkedAt:new Date().toISOString(),verified,files:rows},null,2));
if(!verified)process.exitCode=1;
