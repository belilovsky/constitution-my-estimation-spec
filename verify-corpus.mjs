#!/usr/bin/env node
// Optional read-only verifier for owner-supplied normalized text, never downloads.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const file=process.argv[2];assert(file,'Pass a normalized JSONL text file');
const root=path.dirname(fileURLToPath(import.meta.url));
const expected=new Map(fs.readFileSync(path.join(root,'corpus.csv'),'utf8').trimEnd().split('\n').slice(1).map(line=>{
 const cells=[...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replaceAll('""','"'));assert.equal(cells.length,8);return [cells.slice(0,3).join('|'),cells];
}));
const seen=new Set();
for(const line of fs.readFileSync(file,'utf8').split('\n').filter(s=>s.trim())){
 const r=JSON.parse(line),key=[r.batch,r.id,r.language].join('|'),e=expected.get(key);assert(e,'Unknown '+key);assert(!seen.has(key),'Duplicate '+key);seen.add(key);assert.equal(typeof r.text,'string');
 assert.equal(crypto.createHash('sha256').update(r.text).digest('hex'),e[7],'Text hash '+key);
 assert.equal((r.text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)||[]).length,Number(e[4]),'Words '+key);
 assert.equal([...r.text].length,Number(e[5]),'Characters '+key);
}
assert.equal(seen.size,expected.size,'Incomplete corpus');
console.log(JSON.stringify({result:'PASS',records:seen.size,scope:'supplied normalized texts vs published CSV; not source extraction or legal review'}));
