// URLs carry only a record identifier; private values stay in encrypted storage.
export function travelEditorPath(id) {
  return `travel.html?${new URLSearchParams(id ? {edit:id} : {new:'1'})}`;
}

export function travelPageMode(search) {
  const query = new URLSearchParams(search);
  const editId = query.get('edit');
  return {mode: editId || query.get('new') === '1' ? 'editor' : 'browse', editId};
}

export async function openTravelEditor(id, api = globalThis.chrome) {
  const path = travelEditorPath(id);
  if (api?.tabs?.create && api?.runtime?.getURL) {
    await api.tabs.create({url:api.runtime.getURL(path)});
  } else {
    // Local preview, without an extension API.
    window.open(path, '_blank', 'noopener');
  }
}
