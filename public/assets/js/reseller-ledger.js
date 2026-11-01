/** Ledger values are manually entered and do not confirm payment or access. */
export function validLedgerKey(value) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(value || ''));
}
export function validBillingPeriod(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
}
export function ledgerRows(charges) {
  if (!charges || typeof charges !== 'object') return [];
  return Object.entries(charges).flatMap(([period, users]) => {
    if (!validBillingPeriod(period) || !users || typeof users !== 'object') return [];
    return Object.entries(users).filter(([username, charge]) => validLedgerKey(username) && charge && typeof charge === 'object')
      .map(([username, charge]) => ({ period, username, amount: charge.amount === 100 ? 100 : 0, status: charge.status === 'paid' ? 'paid' : 'due' }));
  }).sort((a, b) => b.period.localeCompare(a.period) || a.username.localeCompare(b.username));
}
