import {mountApp} from './components/views.js';
mountApp(document.getElementById('app'));
const {initializeNavigation}=await import('./navigation.js');
initializeNavigation();
await import('./capability-links.js');
// Mount once before attaching feature controllers. Components own presentation;
// controllers own data, events and service integration.
await Promise.all([import('./sidepanel.js'),import('./context-panel.js'),import('./settings.js'),import('./rewards.js')]);

await import('./release-banner.js');
