import { useEffect, useState } from 'react';
import { getWalletBalance } from './api';
import { formatBalance } from './balance';
import { fromYocto } from './amounts';

type Props = { accountId: string; revision: number };
type BalanceState = { account: string; amount: string | null; error: string; loading: boolean };

export default function WalletBalance({ accountId, revision }: Props) {
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<BalanceState>({ account: '', amount: null, error: '', loading: true });
  const current = state.account === accountId ? state : { amount: null, error: '', loading: true };

  useEffect(() => {
    let active = true;
    setState({ account: accountId, amount: null, error: '', loading: true });
    getWalletBalance(accountId).then((amount) => {
      if (active) setState({ account: accountId, amount, error: '', loading: false });
    }).catch((error: Error) => {
      if (active) setState({ account: accountId, amount: null, error: error.message, loading: false });
    });
    return () => { active = false; };
  }, [accountId, revision, refresh]);

  return <div className="wallet-balance">
    <div aria-live="polite">
      <small>Wallet balance · Testnet</small>
      {current.loading ? <strong>Loading…</strong> : current.amount === null ? <strong>Unavailable</strong> :
        <strong title={`${fromYocto(current.amount)} test NEAR`}>{formatBalance(current.amount)} test NEAR</strong>}
      <small>Balance includes storage reserve; network fees are additional.</small>
      {current.error && <small role="status">{current.error}</small>}
    </div>
    <button type="button" className="secondary-button balance-refresh" disabled={current.loading}
      aria-label="Refresh wallet balance" onClick={() => setRefresh((value) => value + 1)}>Refresh</button>
  </div>;
}
