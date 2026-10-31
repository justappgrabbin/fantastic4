import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const records=JSON.parse(await readFile(new URL('../lineage/SOURCES.json',import.meta.url),'utf8'));
for(const record of records){const bytes=await readFile(new URL('../'+record.path,import.meta.url));if(createHash('sha256').update(bytes).digest('hex')!==record.sha256)throw new Error('Preserved source changed: '+record.path);}
console.log(`${records.length} original source files match recorded SHA-256 hashes`);
