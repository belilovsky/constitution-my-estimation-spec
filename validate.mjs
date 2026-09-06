#!/usr/bin/env node
// Read-only offline specification checks. Node.js 20+; no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {selfTest as extractionTest} from './extract-demo.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const json=n=>JSON.parse(read(n));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
export const countWords=s=>(s.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length;
const object=x=>assert(x&&typeof x==='object'&&!Array.isArray(x),'object required');
const array=x=>assert(Array.isArray(x),'array required');
const strings=(x,keys)=>{object(x);for(const k of keys)assert.equal(typeof x[k],'string','string '+k);};
const preview=x=>{strings(x,['slug','question','short_answer']);assert(x.slug&&x.question);strings(x.section,['code','title']);};
export function checkResponses(r){
 array(r.featured);assert(r.featured.length<=12);r.featured.forEach(preview);
 for(const key of ['all','search','empty_search']){object(r[key]);array(r[key].items);r[key].items.forEach(preview);}
 assert.equal(r.empty_search.items.length,0);
 preview(r.detail);strings(r.detail.blocks,['answer_html','facts_html','what_not_change_html','where_detailed_html','misconceptions_html']);
 array(r.detail.article_refs);for(const a of r.detail.article_refs)assert(Number.isInteger(a.article_number));
 array(r.detail.source_records);for(const a of r.detail.source_records){strings(a,['title','url']);assert(a.url.startsWith('https://'));}
 array(r.glossary.items);r.glossary.items.forEach(x=>{strings(x,['term','short','definition']);assert(Number.isInteger(x.id));});
 strings(r.random_term,['term','short','all_href']);
 array(r.suggest);assert.equal(r.suggest.length,4);assert.equal(typeof r.suggest[0],'string');
 r.suggest.slice(1).forEach(a=>{array(a);a.forEach(x=>assert.equal(typeof x,'string'));assert.equal(a.length,r.suggest[1].length);});
 strings(r.basics,['title','intro']);array(r.basics.sections);r.basics.sections.forEach(x=>strings(x,['title','content']));
 array(r.comparison.sections);r.comparison.sections.forEach(s=>{strings(s,['id','title']);array(s.items);s.items.forEach(x=>{strings(x,['id','title','before','after','editorial_note']);for(const year of ['1995','2026']){array(x.references[year]);x.references[year].forEach(n=>{object(n);assert(Number.isInteger(n.article_number));});}});});
 array(r.segments);r.segments.forEach(x=>{strings(x,['id','type','text','canonical_url']);array(x.paragraphs);x.paragraphs.forEach(p=>assert.equal(typeof p,'string'));if(x.type==='article')for(const k of ['article','section'])assert(Number.isInteger(x[k]));});
}
function csv(text){
 return text.trimEnd().split('\n').map(line=>{
  const cells=[];let pos=0;
  while(pos<line.length){assert.equal(line[pos++],'"');let cell='';let closed=false;
   while(pos<line.length){const c=line[pos++];if(c!=='"'){cell+=c;continue;}if(line[pos]==='"'){cell+='"';pos++;}else{closed=true;break;}}
   assert(closed);cells.push(cell);if(pos<line.length)assert.equal(line[pos++],',');
  }return cells;
 });
}
const manifest=json('manifest.json');
assert.equal(manifest.version,'1.3');
assert.deepEqual(fs.readdirSync(root).filter(n=>n!=='.git').sort(),[...Object.keys(manifest.files),'manifest.json'].sort(),'Exact release allowlist');
for(const [name,hash] of Object.entries(manifest.files)){
 assert(!path.isAbsolute(name)&&!name.split('/').includes('..'));
 assert.equal(sha(fs.readFileSync(path.join(root,name))),hash,'file digest '+name);
}
const fixtures=json('fixtures.json');checkResponses(fixtures.responses);
function checkFixtureLocators(text){
 const locators=[...text.matchAll(/поле `([a-zA-Z0-9_.]+)`/g)].map(m=>m[1]);
 assert(locators.length>0,'No documented fixture locator');
 for(const locator of locators){let value=fixtures;for(const key of locator.split('.')){
  assert(value&&Object.hasOwn(value,key),'Unknown fixture locator '+locator);value=value[key];
 }}
}
const contracts=read('contracts.md');checkFixtureLocators(contracts);
const badLocator=contracts.replace('поле `responses.detail`','поле `api_examples.detail`');
assert.notEqual(badLocator,contracts);assert.throws(()=>checkFixtureLocators(badLocator),/Unknown fixture locator/);
fixtures.word_cases.forEach(c=>assert.equal(countWords(c.text),c.words,'word fixture '+c.language));
const badCases=[
 r=>{r.search={results:[]};},r=>{r.featured={items:[]};},
 r=>{r.comparison.sections[0].results=r.comparison.sections[0].items;delete r.comparison.sections[0].items;},
 r=>{r.detail.sources=r.detail.source_records;delete r.detail.source_records;},
 r=>{r.glossary.items[0].id='1';},r=>{r.segments[1].paragraphs='wrong';},
 r=>{r.suggest[2]=[];},r=>{r.detail.article_refs[0].article_number='1';},
 r=>{r.comparison.sections[0].items[0].references['1995']=[1];}
];
for(const mutate of badCases){const r=structuredClone(fixtures.responses);mutate(r);assert.throws(()=>checkResponses(r),'invalid fixture accepted');}
const rows=csv(read('corpus.csv'));assert.deepEqual(rows.shift(),['C-ID','record_id','language','kind','words','characters','source','text_sha256']);assert.equal(rows.length,1435);
const unique=new Set(),totals={},ui=new Map();
for(const r of rows){assert.equal(r.length,8);const [b,id,l,,w,c,,hash]=r;assert.match(hash,/^[0-9a-f]{64}$/);assert(/^[0-9]+$/.test(w)&&/^[0-9]+$/.test(c));const key=[b,id,l].join('|');assert(!unique.has(key));unique.add(key);const t=totals[b]??={ids:new Set(),languages:{}};t.ids.add(id);const a=t.languages[l]??={records:0,words:0,characters:0};a.records++;a.words+=Number(w);a.characters+=Number(c);if(b==='C-012'){const h=ui.get(id)||{};h[l]=hash;ui.set(id,h);}}
const meta=json('measurement-metadata.json');assert.equal(meta.revision,manifest.source_revision);
assert.equal(meta.version,manifest.version,'Metadata release version');
for(const [b,t] of Object.entries(totals)){assert.deepEqual(t.languages,meta.summary[b].languages);assert.equal(t.ids.size,meta.summary[b].unique_units);}
assert.equal(Object.keys(totals).length,14);
const reuse=json('reuse-ledger.json'),seen=new Set(),signatures=new Set();
assert.equal(reuse.version,manifest.version,'Reuse release version');
const extractionDemo=extractionTest(json('extraction-demo.json'));
for(const g of reuse.ui_formulation_groups){const sig=['ru','kk','en'].map(l=>g.hashes[l]).join('|');assert(!signatures.has(sig));signatures.add(sig);for(const key of g.keys){assert(!seen.has(key));seen.add(key);assert.deepEqual(ui.get(key),g.hashes);}}
assert.equal(seen.size,ui.size);assert.equal(ui.size,152);assert.equal(signatures.size,137);
assert.equal(reuse.ui_formulation_groups.filter(g=>g.keys.length>1).length,13);
assert.deepEqual(Object.fromEntries(['ru','kk','en'].map(l=>[l,reuse.derived_reuse.filter(r=>r.language===l).reduce((s,r)=>s+r.words,0)])),{ru:223,kk:210,en:277});
for(const r of reuse.derived_reuse){assert(unique.has([r.source_batch,r.source_id,r.language].join('|')));assert.match(r.text_sha256,/^[0-9a-f]{64}$/);}
const registry=read('work-register.md'),operations=read('editorial-operations.md'),risks=read('risks.md');
const W=new Set([...registry.matchAll(/^## (W-\d{3})/gm)].map(m=>m[1]));assert.equal(W.size,40);
for(const id of W){const section=registry.split('## '+id+' — ')[1]?.split('\n## ')[0];assert(/^\| Основание состава \| .+ \|$/m.test(section),'Work observation '+id);}
const O=new Set([...operations.matchAll(/^\| (OP-\d{3}) \|/gm)].map(m=>m[1]));assert.equal(O.size,84);
// Bind every published operation quantity to the CSV or an explicitly scoped
// structural count. The latter are disclosed observations, not re-extraction.
export function checkOperations(text){
 const parsed=text.split('\n').filter(l=>/^\| OP-\d{3} \|/.test(l)).map(l=>l.split('|').slice(1,-1).map(s=>s.trim()));
 assert.equal(parsed.length,84);assert.equal(new Set(parsed.map(r=>r[0])).size,84);
 const records=ids=>rows.filter(r=>ids.includes(r[0])).length;
 const words=(ids,lang)=>ids.reduce((s,id)=>s+(totals[id].languages[lang]?.words||0),0);
 const fixed={'OP-001':['комплект',1],'OP-066':['документная версия',Object.keys(totals['C-009'].languages).filter(l=>l!=='en').length+Object.keys(totals['C-010'].languages).length],'OP-072':['уникальная цитатная запись',totals['C-011'].ids.size],'OP-073':['паспорт',totals['C-013'].ids.size],'OP-074':['реестр',1],'OP-075':['партия',1],'OP-076':['табличное представление',60],'OP-077':['партия',1],'OP-078':['размещение',75],'OP-079':['партия',1],'OP-080':['партия',1]};
 for(const r of parsed){assert.equal(r.length,7);const [id,w,b,,language,q,unit]=r,ids=b.split(', ');assert(W.has(w));ids.forEach(i=>assert(totals[i]));let expected;
  if(fixed[id]){assert.equal(unit,fixed[id][0]);expected=fixed[id][1];}
  else if(unit==='1000 слов исходника')expected=words(ids,'ru')/1000;
  else if(unit==='1000 слов перевода'||unit==='1000 слов версии')expected=words(ids,language.toLowerCase())/1000;
  else if(unit==='учётная единица')expected=ids.reduce((s,i)=>s+totals[i].ids.size,0);
  else if(unit==='запись-версия')expected=records(ids);
  else if(unit==='уникальная группа RU/KK/EN')expected=signatures.size;
  else if(unit==='ключ-версия')expected=totals['C-012'].languages.kk.records+totals['C-012'].languages.en.records;
  else assert.fail('Unknown operation unit '+id);
  assert.equal(Number(q),expected,'Operation quantity '+id);
 }
}
checkOperations(operations);
const badQuantity=operations.replace(/^(\| OP-059 \|.*)\| 2\.076 \|/m,'$1| 99 |');
assert.notEqual(badQuantity,operations);assert.throws(()=>checkOperations(badQuantity),/Operation quantity OP-059/);
for(const id of ['081','082','083'])assert(new RegExp('^\\| OP-'+id+' \\|.*\\| 137 \\| уникальная группа RU/KK/EN \\|$','m').test(operations));
assert(/^\| OP-084 \|.*\| 304 \| ключ-версия \|$/m.test(operations));
const R=new Set([...risks.matchAll(/^## (R-\d{3})\./gm)].map(m=>m[1]));assert.equal(R.size,22);
for(const name of Object.keys(manifest.files).filter(n=>n.endsWith('.md'))){const s=read(name);
 for(const [prefix,set] of [['W',W],['OP',O],['R',R],['C',new Set(Object.keys(totals))]])for(const m of s.matchAll(new RegExp('\\b'+prefix+'-\\d{3}\\b','g')))assert(set.has(m[0]),'unknown ID '+m[0]);
 for(const m of s.matchAll(/\]\(([^)]+)\)/g)){const target=m[1].split('#')[0];if(!target||/^[a-z]+:/i.test(target))continue;const p=path.resolve(root,target);assert(p.startsWith(root+path.sep),'link escapes '+name);assert(fs.existsSync(p),'missing link '+target);}
 assert(!/\/Users\/|PRIVATE KEY|ghp_[A-Za-z0-9]|estimate-input\.json|measurement\.json|basis\.md/.test(s),'private content '+name);
}
console.log(JSON.stringify({result:'PASS',version:manifest.version,records:rows.length,works:W.size,operations:O.size,risks:R.size,ui_keys:ui.size,ui_formulation_groups:signatures.size,negative_contract_tests:badCases.length,negative_locator_tests:1,word_fixtures:fixtures.word_cases.length,extraction_demo:extractionDemo,scope:'metadata, links, hashes, synthetic extraction and contracts; not runtime acceptance or full-text re-extraction'},null,2));
