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

export function travelMetadata(record) { const {number,notes,...value}=record; return {...value,hasNotes:!!notes}; }
