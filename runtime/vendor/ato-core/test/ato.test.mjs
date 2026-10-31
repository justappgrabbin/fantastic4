import test from 'node:test';
import assert from 'node:assert/strict';
import { ATOEngine, ATOError, FunctionRegistry } from '../src/index.mjs';

const address = { mode: 'macro', gate: 63, line: 4, color: 2, tone: 1, base: 2 };

function registry() {
  return new FunctionRegistry()
    .register('trim', (value) => String(value).trim())
    .register('classify', (value) => ({ text: value, kind: value.includes('?') ? 'question' : 'statement' }))
    .register('render', (value) => `Report: ${value.kind} — ${value.text}`)
    .register('standalone.upper', (value) => String(value).toUpperCase());
}

test('builds and executes a typed multi-edge assembly through all five stages', async () => {
  const engine = new ATOEngine({ registry: registry() });
  const compiled = engine.compile({
    id: 'logic-report',
    address,
    purpose: 'Turn a question into a classified report',
    graph: {
      nodes: [
        { id: 'input', kind: 'source' },
        { id: 'clean', kind: 'tool' },
        { id: 'understand', kind: 'tool' },
        { id: 'report', kind: 'sink' },
      ],
      edges: [
        { id: 'e1', from: 'input', to: 'clean', functionId: 'trim', fromPort: { type: 'text' }, toPort: { type: 'text' }, channel: '9-52' },
        { id: 'e2', from: 'clean', to: 'understand', functionId: 'classify', fromPort: { type: 'text' }, toPort: { type: 'text' }, channel: '63-4' },
        { id: 'e3', from: 'understand', to: 'report', functionId: 'render', fromPort: { type: 'json' }, toPort: { type: 'json' }, channel: '16-48' },
      ],
    },
  });
  assert.deepEqual(compiled.trace.map((event) => event.stage), [
    'movement.create', 'mind.encode', 'design.structure', 'space.integrate', 'being.instantiate',
  ]);
  assert.ok(compiled.trace.every((event) => event.status === 'passed'));
  const result = await compiled.execute('  Why now?  ');
  assert.equal(result.outputs.report, 'Report: question — Why now?');
});

test('a standalone tool remains callable without a mesh', () => {
  const tools = registry();
  assert.equal(tools.resolve('standalone.upper')('independent'), 'INDEPENDENT');
});

test('rejects an edge whose port types do not match', () => {
  const engine = new ATOEngine({ registry: registry() });
  assert.throws(() => engine.compile({
    address,
    graph: {
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b', functionId: 'trim', fromPort: { type: 'text' }, toPort: { type: 'json' } }],
    },
  }), (error) => error instanceof ATOError && error.stage === 'design.structure' && error.code === 'PORT_TYPE_MISMATCH');
});

test('rejects cycles in the first vertical slice', () => {
  const engine = new ATOEngine({ registry: registry() });
  assert.throws(() => engine.compile({
    address,
    graph: {
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { from: 'a', to: 'b', functionId: 'trim', fromPort: { type: 'text' }, toPort: { type: 'text' } },
        { from: 'b', to: 'a', functionId: 'trim', fromPort: { type: 'text' }, toPort: { type: 'text' } },
      ],
    },
  }), (error) => error instanceof ATOError && error.code === 'CYCLE_DETECTED');
});

test('supports interruption before downstream edge calls', async () => {
  const engine = new ATOEngine({ registry: registry() });
  const compiled = engine.compile({
    address,
    graph: {
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ from: 'a', to: 'b', functionId: 'trim', fromPort: { type: 'text' }, toPort: { type: 'text' } }],
    },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(compiled.execute('x', { signal: controller.signal }), (error) => error.code === 'INTERRUPTED');
});
