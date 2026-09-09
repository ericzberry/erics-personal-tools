import {mountApp} from './components/views.js';
mountApp(document.getElementById('app'));
// Mount once before attaching feature controllers. Components own presentation;
// controllers own data, events and service integration.
await Promise.all([import('./sidepanel.js'),import('./context-panel.js'),import('./settings.js')]);

await import('./release-banner.js');
