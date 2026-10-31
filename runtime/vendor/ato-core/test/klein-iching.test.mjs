import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSES, houseOperator, locateHexagram, rowAnalogy, transformHouse, trigramAnalogy } from '../src/index.mjs';

test('encodes all 64 hexagrams exactly once in Klein eight-house space',()=>{
  const all=HOUSES.flatMap((house)=>house.members.map((member)=>member.bits));
  assert.equal(all.length,64);
  assert.equal(new Set(all).size,64);
  assert.equal(locateHexagram('001000').houseId,'arousing');
  assert.equal(locateHexagram('001000').row,2);
});

test('transforms every row of one house into the parallel row of another',()=>{
  const transformed=transformHouse('abysmal','keepingStill');
  assert.equal(transformed.operator,'001001');
  assert.equal(transformed.valid,true);
  assert.equal(transformed.products[0].resultBits,'100100');
  assert.equal(transformed.products[7].resultBits,'110100');
});

test('reproduces Klein row analogies across houses',()=>{
  const result=rowAnalogy('arousing',2,'clinging');
  assert.equal(result.relation,'111110');
  assert.equal(result.location.houseId,'clinging');
  assert.equal(result.location.row,2);
  // Trigram form of Klein's Thunder/Earth :: Fire/? gives Mountain.
  assert.equal(trigramAnalogy('001','000','101').trigram.image,'Mountain');
});

test('house operator is reversible',()=>{
  assert.equal(houseOperator('joyous','arousing').bits,houseOperator('arousing','joyous').bits);
  assert.equal(transformHouse('joyous','arousing').valid,true);
});
