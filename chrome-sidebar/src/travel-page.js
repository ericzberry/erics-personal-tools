import {mountTravel} from './travel.js';
import {cloudRequest,CONNECTION_KEY} from './cloud-storage.js';
const storage = globalThis.chrome?.storage?.local;
const credentials = {
  async get(){return storage ? (await storage.get(CONNECTION_KEY))[CONNECTION_KEY]?.token || '' : '';},
  async set(token){if(!storage)throw Error('Open Travel wallet from the installed extension.');await storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});await storage.set({[CONNECTION_KEY]:{token}});},
  async remove(){if(storage)await storage.remove(CONNECTION_KEY);}
};
mountTravel(document.getElementById('travel-root'),{credentials,request:cloudRequest});
