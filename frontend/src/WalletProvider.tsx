import { NearConnector } from '@hot-labs/near-connect';
import type { Account, NearWalletBase } from '@hot-labs/near-connect';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Connection = { wallet: NearWalletBase; accounts: Account[] };
type WalletState = {
  accountId: string;
  ready: boolean;
  busy: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};
const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    try {
      const client = connector.current ??= new NearConnector({
        network: 'testnet',
        autoConnect: false,
        features: { testnet: true, signInWithoutAddKey: true },
      });
      const signedIn = (value: Connection) => {
        if (active) setConnection(value.wallet.manifest.features.testnet &&
          value.accounts[0]?.accountId ? value : null);
      };
      const signedOut = () => { if (active) setConnection(null); };
      client.on('wallet:signIn', signedIn);
      client.on('wallet:signOut', signedOut);
      client.getConnectedWallet().then(signedIn).catch(signedOut).finally(() => {
        if (active) setBusy(false);
      });
      setReady(true);
      return () => {
        active = false;
        client.off('wallet:signIn', signedIn);
        client.off('wallet:signOut', signedOut);
      };
    } catch {
      setError('Wallet support could not start. Reload the page to try again.');
      setBusy(false);
    }
  }, []);

  async function connect() {
    if (busy || !connector.current) return;
    setBusy(true);
    setError('');
    try {
      await connector.current.whenManifestLoaded;
      if (!connector.current.availableWallets.length) {
        setError('The wallet list is unavailable. Reload the page and try again.');
        return;
      }
      await connector.current.connect();
    } catch (error) {
      setError(error instanceof Error && error.message === 'User rejected'
        ? 'Wallet connection canceled.'
        : 'Could not connect to the wallet. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy || !connection || !connector.current) return;
    setBusy(true);
    setError('');
    try {
      await connector.current.disconnect(connection.wallet);
    } catch {
      setError('Could not disconnect the wallet. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <WalletContext.Provider value={{
    accountId: connection?.accounts[0]?.accountId ?? '',
    ready, busy, error, connect, disconnect,
  }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const state = useContext(WalletContext);
  if (!state) throw new Error('useWallet must be used inside WalletProvider');
  return state;
}
