import { useWallet } from './WalletProvider';

type Props = { ordersOpen: boolean; onToggleView: () => void };

export default function WalletPanel({ ordersOpen, onToggleView }: Props) {
  const { accountId, ready, busy, error, session, authenticate, connect, disconnect } = useWallet();
  return <section className="wallet-panel" aria-label="NEAR Testnet wallet" aria-busy={busy}>
    <div className="wallet-controls">
      <div className="wallet-account" aria-live="polite">
        <small>NEAR Testnet wallet</small>
        <strong>{accountId || (busy ? 'Checking connection…' : 'Not connected')}</strong>
        {accountId && <small>{session ? 'Ownership verified' : 'Ownership not verified'}</small>}
      </div>
      <div className="wallet-actions" role="group" aria-label="Orders and wallet">
        <button className="secondary-button" type="button"
          aria-controls="workspace" onClick={onToggleView}>
          {ordersOpen ? '← Back to purchase' : 'Orders'}
        </button>
        {accountId && !session && <button type="button" disabled={busy}
        onClick={() => { void authenticate(); }}>Verify ownership</button>}
      <button type="button" disabled={busy || !ready}
        onClick={() => { void (accountId ? disconnect() : connect()); }}>
        {busy ? 'Please wait…' : accountId ? 'Disconnect' : 'Connect wallet'}
      </button>
      </div>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
