import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FeatureSpace, completeAnalogy, equivalence, retargetPlan, toBitString,
  verifyInvolution, addressed, transition, AddressSpace, gateState,
} from '../src/index.mjs';
import { analogy, changeLines, fromNumber, shortestPath } from '../src/iching.mjs';

const address = (gate) => ({ mode:'macro', gate, line:1, color:1, tone:1, base:1 });

test('reproduces Klein strong-equivalence ATO example', () => {
  assert.equal(toBitString(equivalence('101','011')), '001');
  assert.equal(toBitString(completeAnalogy('101','011','011').result), '101');
  assert.equal(verifyInvolution('101','011'), true);
});

test('reproduces Klein verbal analogy and resolves its result', () => {
  const space = new FeatureSpace(['male','female','young','adult','love','hate','light','dark'])
    .add('boy loves light','10101010')
    .add('girl hates light','01100110')
    .add('woman hates dark','01010101')
    .add('man loves dark','10011001');
  const result = space.analogy('boy loves light','girl hates light','woman hates dark');
  assert.equal(toBitString(result.result), '10011001');
  assert.equal(result.candidates[0].id, 'man loves dark');
});

test('retargets an event sequence while preserving its operators', () => {
  const source = ['000','001','011','111'];
  const before = source.slice(0,-1).map((state,index) => toBitString(equivalence(state,source[index+1])));
  const changed = retargetPlan(source,'101');
  const after = changed.result.slice(0,-1).map((state,index) => toBitString(equivalence(state,changed.result[index+1])));
  assert.deepEqual(after,before);
  assert.equal(toBitString(changed.result.at(-1)),'101');
});

test('the 64-state substrate supports changing lines and analogies', () => {
  assert.equal(fromNumber(64).bits,'111111');
  assert.equal(changeLines('000000',[1,6]).result.bits,'100001');
  assert.equal(shortestPath('000000','100001').distance,2);
  assert.equal(analogy('111110','010001','100101').result.bits,'001010');
});

test('every state and transition remains addressed', () => {
  const one = addressed({ bits: gateState(address(1)).bits }, address(1));
  const two = addressed({ bits: gateState(address(2)).bits }, address(2));
  const space = new AddressSpace();
  space.put(one); space.put(two);
  const edge = transition(one,two,{ kind:'changing-line', line:1 });
  space.connect(edge);
  assert.equal(space.reachable(address(1),address(2)),true);
});
