import { useWallet } from './WalletProvider';

export default function WalletPanel() {
  const { accountId, ready, busy, error, connect, disconnect } = useWallet();
  return <section className="wallet-panel" aria-label="NEAR Testnet wallet" aria-busy={busy}>
    <div className="wallet-controls">
      <div aria-live="polite">
        <small>NEAR Testnet wallet</small>
        <strong>{accountId || (busy ? 'Checking connection…' : 'Not connected')}</strong>
      </div>
      <button type="button" disabled={busy || !ready}
        onClick={() => { void (accountId ? disconnect() : connect()); }}>
        {busy ? 'Please wait…' : accountId ? 'Disconnect' : 'Connect wallet'}
      </button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
