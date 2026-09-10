const fail = (status, message) => { throw {status, message}; };
export const TRAVEL_CATEGORIES = ['Airline','Hotel','Rental car','Trusted traveler','Passport','Visa','Other'];
export function normalizeTravel(input, previous = {}) {
  const field = (key, max, required = false) => {
    const value = input[key] ?? previous[key] ?? '';
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, `Check ${key} (up to ${max} characters).`);
    return value.trim();
  };
  const category = field('category', 30, true);
  if (!TRAVEL_CATEGORIES.includes(category)) fail(400, 'Choose a travel category.');
  const expires = field('expires', 10);
  if (expires && (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || !Number.isFinite(Date.parse(expires)) || new Date(expires).toISOString().slice(0,10) !== expires)) fail(400, 'Enter a valid expiration date.');
  return {category, name:field('name',100,true), traveler:field('traveler',100), number:field('number',200,true), notes:field('notes',2000), expires};
}

// Wallet lists group by category in registry order so a person scans by type.
// Records saved with a retired category keep their own group before Other
// rather than disappearing from the list.
export function groupTravelRecords(records) {
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, {sensitivity:'base', numeric:true});
  const category = record => record.category || 'Other';
  const known = TRAVEL_CATEGORIES.slice(0, -1), other = TRAVEL_CATEGORIES.at(-1);
  const extra = [...new Set(records.map(category))].filter(value => !TRAVEL_CATEGORIES.includes(value)).sort((a, b) => a.localeCompare(b));
  return [...known, ...extra, other]
    .map(value => ({category: value, records: records.filter(record => category(record) === value).sort(byName)}))
    .filter(group => group.records.length);
}

export function travelMetadata(record) { const {number,notes,...value}=record; return {...value,hasNotes:!!notes}; }
