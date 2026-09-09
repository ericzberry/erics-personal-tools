const storageKey='personalToolCredentials';
export function credentialStore(storage){
  async function read(){return (await storage.get(storageKey))[storageKey]||[];}
  return {
    async list(){return (await read()).map(({id,name})=>({id,name}));},
    async save({id,name,secret}){
      name=name.trim();secret=secret.trim();
      if(!name||name.length>100)throw Error('Enter a name up to 100 characters.');
      if(!secret||secret.length>16384)throw Error('Enter a key up to 16,384 characters.');
      await storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
      const records=await read();
      const existing=id?records.find(r=>r.id===id):records.find(r=>r.name.toLowerCase()===name.toLowerCase());
      if(id&&!existing)throw Error('This credential was removed. Add it again.');
      const record={id:existing?.id||crypto.randomUUID(),name,secret};
      await storage.set({[storageKey]:[...records.filter(r=>r.id!==record.id),record]});
    },
    async remove(id){await storage.set({[storageKey]:(await read()).filter(r=>r.id!==id)});}
  };
}
