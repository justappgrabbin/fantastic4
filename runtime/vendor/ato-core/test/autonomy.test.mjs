import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfidenceLedger, DeletionGuard } from '../src/index.mjs';

test('confidence activates only a previously granted bounded policy',()=>{const ledger=new ConfidenceLedger();ledger.record('renewal',{kind:'success',weight:4});assert.equal(ledger.evaluate({taskClass:'renewal'}).reason,'NO_STANDING_POLICY');ledger.grant('renewal',{threshold:.7,destinations:['official.gov'],dataScopes:['name','case'],effects:['draft']});assert.equal(ledger.evaluate({taskClass:'renewal',destination:'official.gov',dataScopes:['name'],effect:'draft'}).authorized,true);});

test('high confidence cannot expand destination, data, or effects',()=>{const ledger=new ConfidenceLedger();ledger.grant('form',{threshold:.5,destinations:['a.gov'],dataScopes:['name'],effects:['draft']});ledger.record('form',{kind:'success',weight:10});assert.equal(ledger.evaluate({taskClass:'form',destination:'b.gov'}).reason,'DESTINATION_OUT_OF_SCOPE');assert.equal(ledger.evaluate({taskClass:'form',destination:'a.gov',dataScopes:['ssn']}).reason,'DATA_SCOPE_OUT_OF_SCOPE');assert.equal(ledger.evaluate({taskClass:'form',destination:'a.gov',effect:'submit'}).reason,'EFFECT_OUT_OF_SCOPE');});

test('corrections and denials lower contextual confidence',()=>{const ledger=new ConfidenceLedger();ledger.record('x',{kind:'success',weight:5});const before=ledger.score('x').score;ledger.record('x',{kind:'denial',weight:2});assert.ok(ledger.score('x').score<before);});

test('deletion always requires a matching specific request and confirmation',()=>{const guard=new DeletionGuard();assert.equal(guard.authorize('none').authorized,false);const request=guard.request({target:'file:a'});assert.equal(guard.authorize(request.id).authorized,false);assert.throws(()=>guard.confirm(request.id,{target:'file:b'}));guard.confirm(request.id,{target:'file:a'});assert.equal(guard.authorize(request.id).authorized,true);});
