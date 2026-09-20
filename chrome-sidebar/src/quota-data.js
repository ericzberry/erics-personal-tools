// Cloudflare's storage limits, where a reading stops being routine, and how a
// size is written for a person to read. The Worker measures and imports this
// for the plan's numbers; the Settings screen imports it to say them. One plan
// change moves one file.
const MB = 1024 * 1024, GB = 1024 * MB;
// D1 is the only durable store this account uses. Both limits bind at once: a
// single database may not exceed the first, and every database together may not
// exceed the second.
export const D1_PLANS = {
  free: {label: 'Free', database: 500 * MB, account: 5 * GB, databases: 10},
  paid: {label: 'Paid', database: 10 * GB, account: 250 * GB, databases: 50000}
};
export const planFor = name => D1_PLANS[name === 'paid' ? 'paid' : 'free'];
// Where a reading becomes news. Crossing one of these upward is worth saying
// out loud once; sitting above one is not, or a database at 78% would announce
// itself every hour for a year.
export const BANDS = [0.75, 0.9, 1];
export const bandFor = fraction => Number.isFinite(fraction) ? BANDS.filter(band => fraction >= band).pop() ?? null : null;

// Sizes a person reads — 303 kB, 1.4 MB, 500 MB — not byte counts.
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  for (const [unit, size] of [['GB', GB], ['MB', MB], ['kB', 1024]]) {
    if (bytes >= size) {
      const value = bytes / size;
      return `${value >= 100 ? Math.round(value) : String(Number(value.toFixed(1)))} ${unit}`;
    }
  }
  return `${Math.round(bytes)} bytes`;
}

// A measurement is what Cloudflare said: sizes, and when. What those sizes mean
// is a separate question, answered by the plan in force at the moment of
// asking — so the limits are applied here, on the way out, and never stored
// beside the reading. Freezing them means a plan changed today is still
// measured against yesterday's limit until the next reading replaces it, which
// is exactly the hour someone would be looking.
export function against(measurement, planName) {
  const plan = planFor(planName);
  const databases = measurement?.databases ?? [];
  const totalBytes = Number(measurement?.totalBytes) || 0;
  const perDatabase = (databases[0]?.bytes || 0) / plan.database;
  const perAccount = totalBytes / plan.account;
  return {
    ...measurement, plan: plan.label,
    databaseLimitBytes: plan.database, accountLimitBytes: plan.account, databaseLimit: plan.databases,
    fraction: Math.max(perDatabase, perAccount), worst: perDatabase >= perAccount ? 'database' : 'account'
  };
}

// The one line the figure is worth, and the tone it earns. Below the first band
// there is nothing to decide, so it takes no tone at all — a bar the owner
// glanced at is not news.
export function usageSummary(usage) {
  if (!usage || !Number.isFinite(usage.fraction)) return null;
  const account = usage.worst === 'account';
  const limit = account ? usage.accountLimitBytes : usage.databaseLimitBytes;
  const used = account ? usage.totalBytes : usage.databases?.[0]?.bytes ?? 0;
  const percent = usage.fraction * 100;
  const label = percent >= 1 ? `${Math.round(percent)}%` : percent > 0 ? '<1%' : '0%';
  return {
    percent, label, used, limit,
    scope: account ? 'across the account' : usage.databases?.[0]?.name || 'the database',
    headline: `${formatBytes(used)} of ${formatBytes(limit)} · ${label}`,
    tone: bandFor(usage.fraction) === null ? '' : usage.fraction >= 1 ? 'error' : 'alert'
  };
}

// What a crossing says on a lock screen. No table names, no record counts — the
// number, the limit, and which of the two limits is the one being approached.
export function usageAlert(usage) {
  const summary = usageSummary(usage);
  if (!summary) return null;
  return {
    title: `Cloudflare storage ${summary.label} full`,
    body: `${formatBytes(summary.used)} of ${formatBytes(summary.limit)} ${summary.scope} on the ${usage.plan} plan.`
  };
}
