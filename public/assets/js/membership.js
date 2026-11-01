/** Membership helpers shared by the admin, viewer and Xtream server.
 * expDate is a Unix timestamp in seconds. Legacy PRO records without an
 * expiry remain valid; malformed expiry values fail closed.
 */
export function effectiveMembershipPlan(account, nowSec = Math.floor(Date.now() / 1000)) {
  if (!account || String(account.status || 'active').toLowerCase() !== 'active' || String(account.plan || '').toLowerCase() !== 'pro') return 'free';
  if (account.expDate === null || account.expDate === undefined || account.expDate === '') return 'pro';
  const expiry = Number(account.expDate);
  return Number.isFinite(expiry) && expiry > nowSec ? 'pro' : 'free';
}

export function membershipUpdate(account, action, nowSec = Math.floor(Date.now() / 1000)) {
  if (!account || !Number.isFinite(nowSec)) throw new Error('Invalid account');
  if (action === 'free') return { ...account, plan: 'free', expDate: null, maxConnections: 1 };
  if (action === 'trial') {
    if (account.trialUsedAt) throw new Error('This account has already used its trial.');
    if (effectiveMembershipPlan(account, nowSec) === 'pro') throw new Error('A trial cannot replace an active PRO subscription.');
    return { ...account, plan: 'pro', status: 'Active', expDate: nowSec + 86400, trialUsedAt: nowSec, maxConnections: 1 };
  }
  if (action === 'month') {
    const expiry = Number(account.expDate);
    const base = effectiveMembershipPlan(account, nowSec) === 'pro' && Number.isFinite(expiry) && expiry > nowSec ? expiry : nowSec;
    return { ...account, plan: 'pro', status: 'Active', expDate: base + 30 * 86400, maxConnections: 1 };
  }
  throw new Error('Unknown membership action');
}
