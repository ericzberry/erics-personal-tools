// Which saved connection answers a tool is not a decision worth putting in
// front of the owner. Connections are set up once in Settings; a feature needs
// one that can answer, not a particular one, so every feature asks here
// instead of showing a picker and waiting to be told.
//
// `load` is the only thing that differs between hosts: the sidebar asks the
// Worker, the restaurant workspace asks the extension, and the phone asks its
// offline copy. What they agree on is the shape of a connection.
export function aiConnections({load, provider = '', need = 'to use this'}) {
  const missing = `Save ${provider === 'openai' ? 'an OpenAI' : 'an AI'} connection in Settings ${need}`;
  let chosen = '';
  const usable = async token => (await load(token) || []).filter(entry => entry.hasApiKey && (!provider || entry.provider === provider));
  return {
    // The id of a connection that can answer, remembered for the session so one
    // errand does not fetch the list twice.
    async id(token) {
      if (chosen) return chosen;
      const available = await usable(token);
      if (!available.length) throw Error(missing);
      return (chosen = available[0].id);
    },
    // Empty when a connection can answer, and the one sentence worth saying
    // when none can. Nothing is said about which one was picked.
    async note(token) {
      const available = await usable(token);
      chosen = available.find(entry => entry.id === chosen)?.id || available[0]?.id || '';
      return available.length ? '' : missing;
    },
    forget() { chosen = ''; },
    get missing() { return missing; }
  };
}
