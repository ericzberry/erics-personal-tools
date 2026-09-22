import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The phone clears what the shared registry names, so it must not open a tool's
// store any other way: one opened beside the registry is one a disconnect
// leaves behind. The only stores it opens itself are its own, and those join
// the same list both halves of a disconnect read.
test('the phone opens every store through the shared registry, and a disconnect reads one list',()=>{
  const source=readFileSync(new URL('../public/app/capabilities.js',import.meta.url),'utf8');
  assert.match(source,/\bprivateStores\(/);
  assert.doesNotMatch(source,/\b[a-z]+Offline\(|\bdailyWeather\(/,'build tool stores with privateStores()');
  assert.doesNotMatch(source,/\b\w+Store\.(?:disconnect|hasPending)\(/,'check and clear stores through deviceCopies');
  const copies=source.match(/const deviceCopies=\{([^}]*)\}/)?.[1]??'';
  assert.match(copies,/\.\.\.stores\b/);
  for(const [,own] of source.matchAll(/const (\w+)=(?:offlineResource|restaurantCache)\(/g))
    assert.match(copies,new RegExp(`\\b${own}\\b`),`${own} is kept on the phone but is not in deviceCopies`);
  assert.match(source,/beforeDisconnect\(\)\{[^}]*assertNothingPending\(deviceCopies,token\)/);
  assert.match(source,/async remove\(\)\{[^}]*disconnectStores\(deviceCopies,token\)/);
});
