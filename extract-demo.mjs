#!/usr/bin/env node
// MIT. Synthetic field-selection demonstration, not the private source extractor.
// Usage: node extract-demo.mjs [extraction-demo.json] | node extract-demo.mjs --test
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const object=(v,label)=>assert(v && typeof v==='object' && !Array.isArray(v),label);
const keys=(v,allowed,label)=>{
 object(v,label);
 assert.deepEqual(Object.keys(v).sort(),[...allowed].sort(),label+' fields');
};
// Same deliberately limited normalization as the frozen measurement: not an HTML
// sanitizer or a general Markdown parser. This tool never renders input HTML.
export function normalize(s){
 assert.equal(typeof s,'string');
 return s.replace(/!\[([^\]]*)\]\([^)]+\)/g,'$1')
 .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
 .replace(/https?:\/\/[^\s<>]+/g,'').replace(/<[^>]+>/g,' ')
 .replace(/\s+/gu,' ').trim();
}
export function extractDemo(input){
 keys(input,['schema','notice','records'],'demo');
 assert.equal(input.schema,'constitution-extraction-demo-v1');
 assert.equal(input.notice,'Synthetic, non-legal examples authored for this demonstration. Not Constitution.my content.');
 assert(Array.isArray(input.records) && input.records.length>0 && input.records.length<=1000,'records range');
 const seen=new Set(),records=[],ui=new Map();
 for(const item of input.records){
  keys(item,['type','id','language','fields','expected_text','expected_words'],'record');
  assert(['card','term','interface'].includes(item.type),'record type');
  assert(typeof item.id==='string' && /^demo-[a-z0-9-]{1,80}$/.test(item.id),'synthetic id');
  assert(['ru','kk','en'].includes(item.language),'record language');
  const identity=JSON.stringify([item.type,item.id,item.language]);
  assert(!seen.has(identity),'duplicate record');seen.add(identity);
  let text;
  if(item.type==='card'){
   keys(item.fields,['title','summary','content_text','canonical_url'],'card');
   // content_text already contains title and summary; do not add them twice.
   text=item.fields.content_text;
  }else if(item.type==='term'){
   keys(item.fields,['term','short','definition','example','canonical_url'],'term');
   text=['term','short','definition','example'].map(k=>item.fields[k]).join(' ');
  }else{
   keys(item.fields,['value'],'interface');text=item.fields.value;
  }
  for(const value of Object.values(item.fields))assert(typeof value==='string' && value.length<=100000,'field must be bounded text');
  if(item.type!=='interface')assert(/^https:\/\/example\.invalid\/[a-z0-9/-]+$/.test(item.fields.canonical_url),'synthetic URL only');
  text=normalize(text);
  const words=(text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length;
  assert.equal(text,item.expected_text,'unexpected normalized text');
  assert(Number.isSafeInteger(item.expected_words) && item.expected_words>=0,'expected words type');
  assert.equal(words,item.expected_words,'unexpected word count');
  const record={type:item.type,id:item.id,language:item.language,text,words,characters:[...text].length,text_sha256:hash(text)};
  records.push(record);
  if(item.type==='interface'){
   if(!ui.has(item.id))ui.set(item.id,new Map());
   ui.get(item.id).set(item.language,record.text_sha256);
  }
 }
 const groups=new Map();
 for(const [id,languages] of [...ui].sort(([a],[b])=>a.localeCompare(b))){
  assert.deepEqual([...languages.keys()].sort(),['en','kk','ru'],'interface language coverage');
  const signature=JSON.stringify(['ru','kk','en'].map(l=>languages.get(l)));
  if(!groups.has(signature))groups.set(signature,[]);
  groups.get(signature).push(id);
 }
 return {schema:'constitution-extraction-demo-result-v1',scope:'Synthetic selected fields and exact multilingual UI grouping only; not full Constitution.my extraction, legal review, or human productivity evidence',records,ui_formulation_groups:[...groups.values()],record_count:records.length,excluded_fields:'Card title and summary are already in content_text; canonical URLs are identifiers, not additional authored words. All UI positions remain, even when formulation triples match.'};
}

export function selfTest(input){
 const result=extractDemo(input);
 assert.equal(result.record_count,12);
 assert.deepEqual(result.ui_formulation_groups,[['demo-open','demo-open-again']]);
 assert.equal(normalize("[Read](https://example.invalid/x) <b>now</b> https://example.invalid/y"),'Read now');
 assert.equal((normalize("Қазақша 2026 mother-in-law don’t").match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length,4);
 assert.equal([...normalize('A 😀 B')].length,5);
 const cases=[
  ['schema',d=>{d.schema='unknown';}],
  ['duplicate-record',d=>{d.records.push(structuredClone(d.records[0]));}],
  ['unknown-field',d=>{d.records[0].private_source='/private/path';}],
  ['unknown-selected-field',d=>{d.records[0].fields.extra='unscoped text';}],
  ['non-text',d=>{d.records[0].fields.content_text=7;}],
  ['unsafe-id',d=>{d.records[0].id='../../private';}],
  ['non-synthetic-url',d=>{d.records[0].fields.canonical_url='https://constitution.my/';}],
  ['language',d=>{d.records[0].language='unknown';}],
  ['wrong-expected-text',d=>{d.records[0].expected_text+='x';}],
  ['wrong-word-count',d=>{d.records[0].expected_words++;}],
  ['missing-ui-language',d=>{d.records.splice(d.records.findIndex(r=>r.type==='interface' && r.language==='kk'),1);}],
  ['empty-input',d=>{d.records=[];}],
 ];
 for(const [name,mutate] of cases){const changed=structuredClone(input);mutate(changed);assert.throws(()=>extractDemo(changed),undefined,name);}
 return {result:'PASS',records:result.record_count,positive_checks:5,negative_cases:cases.map(([name])=>name),scope:result.scope};
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  assert(process.argv.length<=3,'Pass one fixture path or --test');
  const test=process.argv[2]==='--test';
  const filename=test||!process.argv[2]?path.join(here,'extraction-demo.json'):process.argv[2];
  assert(!fs.lstatSync(filename).isSymbolicLink(),'Input symlink rejected');
  assert(fs.statSync(filename).isFile() && fs.statSync(filename).size<=1000000,'Input must be a file up to 1 MB');
  // A single explicit input file is read; record IDs and URLs never become paths
  // or network requests. JSON is data, never evaluated as code.
  const data=JSON.parse(fs.readFileSync(filename,'utf8'));
  console.log(JSON.stringify(test?selfTest(data):extractDemo(data),null,2));
 }catch(error){console.error('FAIL: '+error.message);process.exitCode=1;}
}
