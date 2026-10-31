import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { IntegratedToolFactory } from '../src/integrated-tool-factory.mjs';
const execFileAsync=promisify(execFile);

test('exported souvenir is a zero-import executable module',async()=>{
  const factory=new IntegratedToolFactory();
  const tool=factory.generate({purpose:'orchestrate a workflow system',dimension:'Space',input:'sense build test mount'}).tool;
  const expected=await tool.execute('sense build test mount');
  const exported=factory.exportTool(tool.id);
  assert.equal(/\bimport\s/.test(exported.source),false);
  const directory=await mkdtemp(join(tmpdir(),'cynthia-souvenir-'));
  const path=join(directory,exported.fileName); await writeFile(path,exported.source);
  const module=await import(`${pathToFileURL(path).href}?fresh=1`);
  assert.deepEqual(await module.execute('sense build test mount'),expected);
  assert.equal(module.manifest.id,tool.id);
  assert.equal(module.default.execute,module.execute);
  const probe=`import(${JSON.stringify(pathToFileURL(path).href)}).then(async m=>process.stdout.write(JSON.stringify(await m.execute('sense build test mount'))))`;
  const isolated=await execFileAsync(process.execPath,['--input-type=module','--eval',probe]);
  assert.deepEqual(JSON.parse(isolated.stdout),expected);
});

test('learned state travels inside the exported tool',async()=>{
  const factory=new IntegratedToolFactory(),tool=factory.generate({purpose:'analyze and learn',dimension:'Evolution',level:4}).tool;
  await tool.execute('memory'); await tool.execute('memory');
  const exported=factory.exportTool(tool.id),directory=await mkdtemp(join(tmpdir(),'cynthia-stateful-')),path=join(directory,exported.fileName);
  await writeFile(path,exported.source); const module=await import(`${pathToFileURL(path).href}?fresh=2`);
  assert.equal((await module.execute('memory')).occurrences,3);
});
