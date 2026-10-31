import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGate, kingWenGateForBinaryValue } from '../src/gate-address.mjs';
import { GATE_DATA } from '../src/gate-data.mjs';

test('resolves all 64 King Wen gates to content without error', () => {
  for (let gate = 1; gate <= 64; gate += 1) {
    const resolved = resolveGate(gate);
    assert.equal(resolved.kingWenGate, gate);
    assert.equal(resolved.content.gate, gate);
    assert.ok(resolved.content.name, `gate ${gate} should have a name`);
    assert.equal(resolved.address.address.gate, gate);
  }
});

test('Gate 1 (The Creative) is the all-yang hexagram', () => {
  const gate1 = resolveGate(1);
  assert.equal(gate1.bits, '111111');
  assert.equal(gate1.content.name, 'The Creative');
});

test('Gate 2 (The Receptive) is the all-yin hexagram', () => {
  const gate2 = resolveGate(2);
  assert.equal(gate2.bits, '000000');
  assert.equal(gate2.content.name, 'The Receptive');
});

test('spot-checked gates from king-wen.mjs match GATE_DATA names', () => {
  // These are the gates the earlier session verified against a primary source
  // (see the comment block at the top of king-wen.mjs). Confirmed here against
  // the independently-sourced GATE_DATA table rather than assumed:
  //   Gate 55 "Feng / Abundance"   -> GATE_DATA name "Abundance", keynote "Abundance"
  //   Gate 56 "Lu / The Wanderer"  -> GATE_DATA name "Stimulation", keynote "Wandering"
  //   Gate 6  "Song / Conflict"    -> GATE_DATA name "Conflict"
  assert.equal(GATE_DATA[55].name, 'Abundance');
  assert.equal(GATE_DATA[55].keynote, 'Abundance');
  assert.equal(GATE_DATA[56].name, 'Stimulation');
  assert.equal(GATE_DATA[56].keynote, 'Wandering');
  assert.equal(GATE_DATA[6].name, 'Conflict');
  assert.equal(resolveGate(56).content.gate, 56);
  assert.equal(resolveGate(55).content.gate, 55);
  assert.equal(resolveGate(6).content.gate, 6);
});

test('binary value <-> King Wen gate is a true bijection across all 64', () => {
  const seen = new Set();
  for (let gate = 1; gate <= 64; gate += 1) {
    const resolved = resolveGate(gate);
    assert.equal(kingWenGateForBinaryValue(resolved.binaryValue), gate);
    assert.ok(!seen.has(resolved.binaryValue), `binary value ${resolved.binaryValue} collided for gate ${gate}`);
    seen.add(resolved.binaryValue);
  }
  assert.equal(seen.size, 64);
});

test('ATO-Core binary numbering and King Wen numbering genuinely differ (this is the bug this module exists to prevent)', () => {
  const gate1 = resolveGate(1);
  // King Wen gate 1 is NOT ATO-Core's hexagram #1 (which is 000000, King Wen gate 2)
  assert.notEqual(gate1.atoCoreNumber, 1);
  assert.equal(gate1.atoCoreNumber, 64); // all-yang is the highest binary value, 111111 = 63 -> number 64
});
