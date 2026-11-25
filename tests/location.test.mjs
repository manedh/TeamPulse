import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('src/utils/location.js','utf8').replaceAll('export ','');
function location(get,extra={}){const ctx=vm.createContext({isSecureContext:true,navigator:{geolocation:{getCurrentPosition:get}},setTimeout,clearTimeout,...extra});vm.runInContext(source,ctx);return vm.runInContext('captureLocation',ctx);}
test('fresh network position preserves zero coordinates',async()=>{let options;const capture=location((ok,_fail,opts)=>{options=opts;ok({coords:{latitude:0,longitude:0,accuracy:12}})});const r=await capture();assert.equal(r.status,'captured');assert.equal(r.latitude,0);assert.equal(options.maximumAge,0);assert.equal(options.enableHighAccuracy,false);assert.equal(options.timeout,10000)});
test('network timeout falls back to fresh high accuracy GPS',async()=>{const attempts=[];const capture=location((ok,fail,opts)=>{attempts.push(opts);if(!opts.enableHighAccuracy)fail({code:3});else ok({coords:{latitude:28,longitude:77,accuracy:500}})});assert.equal((await capture()).accuracy,500);assert.equal(attempts.length,2);assert.equal(attempts[1].timeout,20000);assert.equal(attempts[1].enableHighAccuracy,true);assert.equal(attempts[1].maximumAge,0)});
test('permission denial does not retry or disguise the failure',async()=>{let calls=0;assert.equal((await location((_ok,fail)=>{calls++;fail({code:1})})()).status,'denied');assert.equal(calls,1)});
test('insecure and policy blocked contexts do not start GPS',async()=>{const fail=()=>assert.fail('GPS must not start');assert.equal((await location(fail,{isSecureContext:false})()).status,'insecure');assert.equal((await location(fail,{document:{permissionsPolicy:{allowsFeature:()=>false}}})()).status,'blocked')});
test('silent browser callback is bounded by application deadline',async()=>{const timers=[];const capture=location(()=>{},{setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout:()=>{}});const promise=capture();timers.shift()();await Promise.resolve();await Promise.resolve();timers.shift()();assert.equal((await promise).status,'timeout')});
test('invalid positions are rejected and precise retry uses longer budget',async()=>{const timeouts=[];const capture=location((ok,_fail,opts)=>{timeouts.push(opts.timeout);ok({coords:{latitude:1000,longitude:77,accuracy:2}})});assert.equal((await capture({precise:true})).status,'unavailable');assert.deepEqual(timeouts,[20000,10000])});

test('permission prompt has time to be answered before the application deadline',async()=>{
 let success;const timers=[];
 const capture=location(ok=>{success=ok;},{setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout:()=>{}});
 const result=capture();
 assert.equal(timers[0].delay,60000);
 success({coords:{latitude:28.6,longitude:77.2,accuracy:25}});
 assert.equal((await result).status,'captured');
});

test('a late callback from an expired attempt cannot replace the fallback result',async()=>{
 let firstSuccess;let calls=0;const timers=[];
 const capture=location(ok=>{calls++;if(calls===1)firstSuccess=ok;else ok({coords:{latitude:19,longitude:72,accuracy:20}});},{setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}});
 const result=capture();timers[0]();await Promise.resolve();await Promise.resolve();
 firstSuccess({coords:{latitude:1,longitude:1,accuracy:1}});
 const point=await result;assert.equal(point.latitude,19);assert.equal(calls,2);
});
