// IndexedDB holds ciphertext only. The device's existing access token unlocks it.
export function encryptedDeviceStore({indexedDB=globalThis.indexedDB,crypto=globalThis.crypto}={}) {
  let database;
  async function db(){
    if(!indexedDB)throw Error('Offline storage is unavailable. Enable browser storage and try again.');
    if(!database)database=new Promise((resolve,reject)=>{
      const open=indexedDB.open('erics-tools-private-data',1);
      open.onupgradeneeded=()=>open.result.createObjectStore('resources');
      open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(Error('Could not open offline storage.'));
    });
    return database;
  }
  async function identity(resource,token){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
    const fingerprint=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
    return {id:`${resource}:${fingerprint}`,key:await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt'])};
  }
  async function transaction(mode,action){
    const database=await db();
    return new Promise((resolve,reject)=>{
      const tx=database.transaction('resources',mode);const request=action(tx.objectStore('resources'));
      tx.oncomplete=()=>resolve(request?.result);tx.onerror=tx.onabort=()=>reject(Error('Could not save offline data. Check available device storage.'));
    });
  }
  return {
    async read(resource,token){
      const {id,key}=await identity(resource,token),value=await transaction('readonly',store=>store.get(id));
      if(!value)return null;
      try{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:value.iv,additionalData:new TextEncoder().encode(id)},key,value.ciphertext)));}
      catch{throw Error('This device’s offline copy could not be opened. Reconnect with your original access token.');}
    },
    async write(resource,token,value){
      const {id,key}=await identity(resource,token),iv=crypto.getRandomValues(new Uint8Array(12));
      const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(id)},key,new TextEncoder().encode(JSON.stringify(value)));
      await transaction('readwrite',store=>store.put({iv,ciphertext},id));
    },
    async remove(resource,token){const {id}=await identity(resource,token);await transaction('readwrite',store=>store.delete(id));}
  };
}
