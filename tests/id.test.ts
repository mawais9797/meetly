import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newId } from '../apps/web/lib/id';

test('UUID generation works with LAN-safe crypto that has no randomUUID method',()=>{
 const random={getRandomValues<T extends ArrayBufferView|null>(value:T):T{(value as Uint8Array).fill(255);return value;}};
 assert.equal(newId(random),'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
test('UUIDs have version/variant bits and do not collide in a sample',()=>{
 const ids=Array.from({length:1000},()=>newId());
 assert.ok(ids.every(id=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)));
 assert.equal(new Set(ids).size,ids.length);
});
