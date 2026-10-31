# Cynthia Integrated Tool Factory

Dependency-free JavaScript core joining five-dimensional semantic routing, purpose planning, eight reachable structural production levels, deterministic executable generation, ATO-style manifests, mesh mounting, reversible lifecycle, lineage, and serializable snapshots.

## Use

```js
import { IntegratedToolFactory } from './src/integrated-tool-factory.mjs';
const factory = new IntegratedToolFactory();
const { tool } = factory.generate({
  purpose: 'orchestrate a workflow system',
  dimension: 'Space',
  input: 'sense classify build test mount'
});
const output = await tool.execute('sense classify build test mount');
```

## Native ATO mounting

```js
import { Automaton, AutomataMesh } from './ato-core/src/index.mjs';
import { IntegratedToolFactory, ATONativeBridge } from './src/integrated-tool-factory.mjs';

const factory = new IntegratedToolFactory();
const mesh = new AutomataMesh();
const bridge = new ATONativeBridge({ Automaton, mesh, factory });
const { automaton } = bridge.generateAndMount({
  purpose: 'orchestrate a workflow system',
  dimension: 'Space'
});
const result = await bridge.run(automaton.id, 'sense classify build test mount');
```

The resulting object is a genuine ATO Core `Automaton`, passes ATO's constructor and mesh boundaries, retains its factory lineage, and can connect to other Automatons through typed ports.

## Export a souvenir

```js
const exported = factory.exportTool(tool.id);
// Save exported.source as exported.fileName.
```

The exported `.mjs` contains its complete runtime, manifest, current learned state, deterministic generator, `execute()`, `call()`, and `exportState()`. It has zero imports and runs without the factory or ATO Core.

Run `npm test` and `npm run demo` with Node 18 or newer. The module is browser-compatible and uses no backend, network, package dependency, `eval`, or `new Function`.

## Dimension vocabulary (v1.3.0)

`DimensionRouter`'s five term lists now carry real GoEmotions-derived vocabulary on top of
the original hand-curated JUT-source seed terms, not just 9-10 words per dimension. Method,
license notes, and honest limitations: `DATASET_PROVENANCE.md`. Still zero network/deps at
runtime — the dataset was only used offline to generate a bigger static array.

## Deliberate boundary

This core synthesizes from a bounded, inspectable family of eight structural runtimes. It plans level and address from purpose and dimension, but it does not pretend to invent arbitrary algorithms. New runtime families should be registered through reviewed code in the next extension rather than executing untrusted generated source.
