import test from 'node:test';
import assert from 'node:assert/strict';
import {registerSidebarLauncher} from '../src/components/sidebar-launcher.js';
test('native launcher installs once per update and opens the clicked window immediately',()=>{
 let installed,clicked,menu,clears=0;const opened=[];
 registerSidebarLauncher({runtime:{onInstalled:{addListener:f=>installed=f}},contextMenus:{removeAll:cb=>{clears++;cb();},create:(spec,cb)=>{menu=spec;cb();},onClicked:{addListener:f=>clicked=f}},sidePanel:{open:options=>{opened.push(options);return Promise.resolve();}}});
 installed();installed();assert.equal(clears,2);assert.deepEqual(menu.contexts,['all']);
 clicked({menuItemId:menu.id},{windowId:42});assert.deepEqual(opened,[{windowId:42}]);
 clicked({menuItemId:'other'},{windowId:3});clicked({menuItemId:menu.id},undefined);assert.equal(opened.length,1);
});
