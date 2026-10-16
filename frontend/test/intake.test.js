import test from 'node:test';
import assert from 'node:assert/strict';
import {intakeState} from '../src/utils/intake.ts';
test('Intake requires an explicit boolean and treats malformed responses as unknown',()=>{
 assert.equal(intakeState({intakeEnabled:true}),'enabled');assert.equal(intakeState({intakeEnabled:false}),'disabled');
 for(const config of [null,{},[],{intakeEnabled:'true'},{intakeEnabled:1},{intakeEnabled:undefined}])assert.equal(intakeState(config),'unknown');
});
