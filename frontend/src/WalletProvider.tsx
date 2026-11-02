import { NearConnector } from '@hot-labs/near-connect';
import type { Account, NearWalletBase } from '@hot-labs/near-connect';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthChallenge, revokeSession, verifyWallet } from './api';
import type { AuthSession } from './api';

type Connection = { wallet: NearWalletBase; accounts: Account[] };
type WalletState = {
  accountId: string;
  ready: boolean;
  busy: boolean;
  error: string;
  session: AuthSession | null;
  authenticate: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};
const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const generation = useRef(0);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    if (!session) return;
    const timeout = setTimeout(() => setSession(null), session.expires_in * 1000);
    return () => clearTimeout(timeout);
  }, [session]);

  useEffect(() => {
    let active = true;
    try {
      const client = connector.current ??= new NearConnector({
        network: 'testnet',
        autoConnect: false,
        features: { testnet: true, signInWithoutAddKey: true, signMessage: true },
      });
      const signedIn = (value: Connection) => {
        if (!active) return;
        ++generation.current;
        setSession(null);
        setConnection(value.wallet.manifest.features.testnet &&
          value.wallet.manifest.features.signMessage &&
          value.accounts[0]?.accountId ? value : null);
      };
      const signedOut = () => {
        if (!active) return;
        ++generation.current;
        setSession(null);
        setConnection(null);
      };
      client.on('wallet:signIn', signedIn);
      client.on('wallet:signOut', signedOut);
      client.getConnectedWallet().then(signedIn).catch(signedOut).finally(() => {
        if (active) setBusy(false);
      });
      setReady(true);
      return () => {
        active = false;
        ++generation.current;
        client.off('wallet:signIn', signedIn);
        client.off('wallet:signOut', signedOut);
      };
    } catch {
      setError('Wallet support could not start. Reload the page to try again.');
      setBusy(false);
    }
  }, []);

  async function authenticate() {
    if (busy || !connection) return;
    const version = generation.current;
    const accountId = connection.accounts[0].accountId;
    setBusy(true);
    setError('');
    try {
      const challenge = await getAuthChallenge(accountId);
      if (generation.current !== version) return;
      const signed = await connection.wallet.signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: Uint8Array.from(atob(challenge.nonce), (char) => char.charCodeAt(0)),
        signerId: accountId,
        network: 'testnet',
      });
      if (generation.current !== version) return;
      if (signed.accountId !== accountId) throw new Error('The wallet signed with a different account.');
      const verified = await verifyWallet(challenge.nonce, signed.publicKey, signed.signature);
      if (generation.current !== version || verified.account_id !== accountId) {
        await revokeSession(verified.token).catch(() => {});
        return;
      }
      setSession(verified);
    } catch (error) {
      if (generation.current === version) setError(error instanceof Error
        ? error.message : 'Wallet verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

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
      if (session) await revokeSession(session.token);
      setSession(null);
      await connector.current.disconnect(connection.wallet);
    } catch {
      setError('Could not disconnect the wallet. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <WalletContext.Provider value={{
    accountId: connection?.accounts[0]?.accountId ?? '',
    ready, busy, error, session, authenticate, connect, disconnect,
  }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const state = useContext(WalletContext);
  if (!state) throw new Error('useWallet must be used inside WalletProvider');
  return state;
}
