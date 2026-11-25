import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cropRectangle} from '../src/utils/photoCrop.js';
test('portrait and landscape crops stay square with centered initial alignment',()=>{assert.deepEqual(cropRectangle(800,1200),{sx:0,sy:200,size:800});assert.deepEqual(cropRectangle(1200,800),{sx:200,sy:0,size:800});});
test('zoom and alignment select the intended image area without leaving image bounds',()=>{assert.deepEqual(cropRectangle(800,1200,2,100,0),{sx:400,sy:0,size:400});assert.deepEqual(cropRectangle(800,1200,2,0,100),{sx:0,sy:800,size:400});for(const z of [0,1,2,3,10])for(const x of [-10,0,50,100,200]){const c=cropRectangle(1600,900,z,x,x);assert.ok(c.sx>=0&&c.sy>=0&&c.sx+c.size<=1600&&c.sy+c.size<=900);}});
