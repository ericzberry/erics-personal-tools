export function selectSession(sessions, selection = 'auto', now = Date.now()) {
  if (selection !== 'auto') return sessions[selection];
  const all = Object.values(sessions).sort((a,b) => b.lastSeenAt-a.lastSeenAt);
  return all.find(s => s.connected && now-s.lastSeenAt < 15000 && s.state === 'drafting')
    || all.find(s => s.connected && now-s.lastSeenAt < 15000)
    || all[0];
}
