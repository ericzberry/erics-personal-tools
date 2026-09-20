import {mountApp} from './components/views.js';
import {sharedVault} from './secret-vault.js';
import {unlockInWindow} from './vault-window.js';
// The side panel cannot raise the passkey sheet, so every protected section in
// it asks through a small window instead. Configured before any tool asks for
// the shared vault, because the first request is the one that creates it.
sharedVault({unlockElsewhere:unlockInWindow()});
mountApp(document.getElementById('app'));
const {initializeNavigation}=await import('./navigation.js');
initializeNavigation();
await import('./capability-links.js');
// Mount once before attaching feature controllers. Components own presentation;
// controllers own data, events and service integration.
await Promise.all([import('./sidepanel.js'),import('./context-panel.js'),import('./settings.js'),import('./rewards.js')]);
// The home screen reads the saved reminders for the fortnight's birthdays and
// the wallet for what is worth using before the quarter closes.
await import('./home-page.js').then(({mountPanelHome})=>mountPanelHome());

await import('./release-banner.js');
