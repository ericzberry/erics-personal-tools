import {showSettings} from './navigation.js';
import {mountTravelTool} from './capability-links.js';
const $=id=>document.getElementById(id);
// Settings holds the one cloud connection, which the travel wallet owns, so
// arriving at Settings builds the wallet however the screen was opened.
$('open-settings').addEventListener('click',()=>{mountTravelTool();showSettings(true);$('close-settings').focus();});
$('close-settings').addEventListener('click',()=>{showSettings(false);$('navigation-toggle').focus();});
