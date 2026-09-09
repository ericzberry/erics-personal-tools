import test from 'node:test';
import assert from 'node:assert/strict';
import {travelEditorPath,travelPageMode,openTravelEditor} from '../src/travel-navigation.js';

test('add and edit open a separate extension tab with only the record identifier',async()=>{
  const opened=[];
  const api={runtime:{getURL:path=>`chrome-extension://test/${path}`},tabs:{create:async value=>opened.push(value)}};
  await openTravelEditor(undefined,api);
  await openTravelEditor('record & two',api);
  assert.deepEqual(opened,[{url:'chrome-extension://test/travel.html?new=1'},{url:'chrome-extension://test/travel.html?edit=record+%26+two'}]);
  assert.deepEqual(travelPageMode('?edit=record+%26+two'),{mode:'editor',editId:'record & two'});
  assert.deepEqual(travelPageMode('?new=1'),{mode:'editor',editId:null});
  assert.equal(travelPageMode('').mode,'browse');
  assert.equal(travelEditorPath(),'travel.html?new=1');
});
