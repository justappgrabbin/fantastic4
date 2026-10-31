import test from 'node:test';
import assert from 'node:assert/strict';
import { activationSignature, activationTransition, canonicalActivation } from '../src/index.mjs';

test('bigram occupies two levels with one active',()=>{
  const signature=activationSignature('bigram',[1]);
  assert.equal(signature.levelCount,2);
  assert.equal(signature.activeCount,1);
  assert.deepEqual(signature.inactiveLevels,[2]);
  assert.equal(signature.mask,'10');
});

test('trigram occupies three levels with at least two active',()=>{
  const signature=activationSignature('trigram',[1,3]);
  assert.equal(signature.levelCount,3);
  assert.equal(signature.activeCount,2);
  assert.deepEqual(signature.inactiveLevels,[2]);
  assert.throws(()=>activationSignature('trigram',[1]),error=>error.code==='INSUFFICIENT_ACTIVATION');
});

test('hexagram occupies six levels with five active',()=>{
  const signature=canonicalActivation('hexagram',4);
  assert.equal(signature.levelCount,6);
  assert.equal(signature.activeCount,5);
  assert.equal(signature.mask,'111011');
});

test('activation transitions preserve occupancy and report position changes',()=>{
  const source=canonicalActivation('trigram',3);
  const target=canonicalActivation('trigram',1);
  assert.deepEqual(activationTransition(source,target).changedLevels,[1,3]);
});
