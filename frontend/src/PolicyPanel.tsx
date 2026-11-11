import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { getPolicy, getPolicyHistory, policyMessage, savePolicy } from './api';
import type { PolicyDecision, PurchasePolicy } from './api';
import { fromYocto, toYocto } from './amounts';

type Props = { token: string; budget: string; revision: number; onSaved: () => void };

export default function PolicyPanel({ token, budget, revision, onSaved }: Props) {
  const [policy, setPolicy] = useState<PurchasePolicy | null>(null);
  const [maxOrder, setMaxOrder] = useState('');
  const [maxUnit, setMaxUnit] = useState('');
  const [merchant, setMerchant] = useState('');
  const [decisions, setDecisions] = useState<PolicyDecision[]>([]);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getPolicy(token).then((value) => {
      if (!active) return;
      setPolicy(value);
      setMaxOrder(value.max_order_yocto ? fromYocto(value.max_order_yocto) : '');
      setMaxUnit(value.max_unit_yocto ? fromYocto(value.max_unit_yocto) : '');
      setMerchant(value.allowed_merchant);
    }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    let active = true;
    setHistoryError('');
    getPolicyHistory(token).then(({ decisions }) => { if (active) setDecisions(decisions); })
      .catch((reason: Error) => { if (active) setHistoryError(reason.message); });
    return () => { active = false; };
  }, [token, revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setNotice('');
    try {
      const settings = {
        max_order_yocto: maxOrder.trim() ? toYocto(maxOrder.trim()) : '',
        max_unit_yocto: maxUnit.trim() ? toYocto(maxUnit.trim()) : '',
        allowed_merchant: merchant.trim(),
      };
      setSaving(true);
      setPolicy(await savePolicy(token, settings));
      setNotice('Purchase rules saved.');
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save purchase rules.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="policy-panel" aria-label="Purchase budget and rules">
    <div className="policy-summary">
      <div><small>Current new-purchase budget</small><strong>{budget.trim() || 'Not set'}{budget.trim() && ' test NEAR'}</strong></div>
      <div><small>Saved per-purchase limit</small><strong>{policy ?
        (policy.max_order_yocto ? `${fromYocto(policy.max_order_yocto)} test NEAR` : 'Not set') : (error ? 'Unavailable' : 'Loading…')}</strong></div>
    </div>
    <small>The purchase budget is a limit, not your wallet balance.</small>
    <details>
      <summary>Purchase rules &amp; recent checks</summary>
      <p>Set optional limits for new purchases. Rules are checked again before opening the wallet.</p>
      <form className="policy-form" onSubmit={submit}>
        <fieldset disabled={!policy || saving}>
          <label htmlFor="policy-order">Maximum per purchase (test NEAR)</label>
          <input id="policy-order" inputMode="decimal" maxLength={40} value={maxOrder}
            onChange={(event) => setMaxOrder(event.target.value)} placeholder="No limit" />
          <label htmlFor="policy-unit">Maximum unit price (test NEAR)</label>
          <input id="policy-unit" inputMode="decimal" maxLength={40} value={maxUnit}
            onChange={(event) => setMaxUnit(event.target.value)} placeholder="No limit" />
          <label htmlFor="policy-merchant">Allowed merchant account</label>
          <input id="policy-merchant" maxLength={64} value={merchant}
            onChange={(event) => setMerchant(event.target.value)} placeholder="Any merchant" />
          <small>Leave a field empty to disable that rule.</small>
          <button type="submit">{saving ? 'Saving…' : 'Save rules'}</button>
        </fieldset>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <h3>Recent checks</h3>
      {historyError ? <p className="error" role="alert">{historyError}</p> :
        decisions.length === 0 ? <p>No purchase checks yet.</p> : <ul className="policy-history">
          {decisions.slice(0, 5).map((item, index) => <li key={`${item.product_id}-${index}`}>
            <strong>{item.decision === 'allowed' ? 'Allowed' : 'Blocked'}</strong>
            {' · '}{item.product_id} · {fromYocto(item.total_yocto)} test NEAR
            <small>{item.reason === 'within_limits' ? 'Within your limits.' : policyMessage(item.reason)}</small>
          </li>)}
        </ul>}
    </details>
  </section>;
}
