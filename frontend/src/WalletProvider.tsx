import { NearConnector } from '@hot-labs/near-connect';
import type { Account, NearWalletBase } from '@hot-labs/near-connect';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getAuthChallenge, getAuthSession, revokeSession, verifyWallet } from './api';
import type { AuthSession, PaymentDetails } from './api';
import { isTransactionHash, PaymentNotSent, transferRequest } from './paymentState';
import { clearSession, restoreSession, saveSession } from './walletSession';
import type { SavedSession } from './walletSession';

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
  sendTransfer: (payment: PaymentDetails) => Promise<string>;
  invalidateSession: () => void;
};
const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const generation = useRef(0);
  const sending = useRef(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState<SavedSession | null>(null);
  const connectionVersion = generation.current;

  useEffect(() => {
    if (!session) return;
    const timeout = setTimeout(() => {
      clearSession();
      setSession(null);
    }, Math.max(0, session.expires_at - Date.now()));
    return () => clearTimeout(timeout);
  }, [session]);

  useEffect(() => {
    let active = true;
    try {
      const client = connector.current ??= new NearConnector({
        network: 'testnet',
        autoConnect: false,
        features: { testnet: true, signInWithoutAddKey: true, signMessage: true, signAndSendTransaction: true },
      });
      const signedIn = async (value: Connection) => {
        if (!active) return;
        const version = ++generation.current;
        setSession(null);
        const supported = value.wallet.manifest.features.testnet &&
          value.wallet.manifest.features.signMessage &&
          value.wallet.manifest.features.signAndSendTransaction &&
          value.accounts[0]?.accountId;
        setConnection(supported ? value : null);
        setBusy(true);
        const restored = supported
          ? await restoreSession(value.accounts[0].accountId, getAuthSession) : null;
        if (!active || generation.current !== version) return;
        if (!restored) clearSession();
        setSession(restored);
        setBusy(false);
      };
      const signedOut = () => {
        if (!active) return;
        ++generation.current;
        clearSession();
        setSession(null);
        setConnection(null);
        setBusy(false);
      };
      client.on('wallet:signIn', signedIn);
      client.on('wallet:signOut', signedOut);
      client.getConnectedWallet().then(signedIn).catch(signedOut);
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
    const version = ++generation.current;
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
      setSession(saveSession(verified));
    } catch (error) {
      if (generation.current === version) setError(error instanceof Error
        ? error.message : 'Wallet verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function sendTransfer(payment: PaymentDetails) {
    if (generation.current !== connectionVersion || sending.current || busy || !connection || !session)
      throw new PaymentNotSent('Connect and verify your wallet before paying.');
    const version = generation.current;
    sending.current = true;
    setBusy(true);
    try {
      let accounts: Account[];
      try { accounts = await connection.wallet.getAccounts({ network: 'testnet' }); } catch {
        throw new PaymentNotSent('Could not check the wallet account. Reconnect and try again.');
      }
      if (generation.current !== version || session.expires_at <= Date.now() ||
        accounts[0]?.accountId !== session.account_id)
        throw new PaymentNotSent('The wallet account or session changed. Verify ownership again.');
      const result = await connection.wallet.signAndSendTransaction(
        transferRequest(payment, session.account_id));
      const hash: unknown = result?.transaction?.hash;
      if (!isTransactionHash(hash))
        throw new Error('The wallet did not return a transaction hash. Check its history.');
      return hash;
    } catch (error) {
      if (error instanceof Error && ['User cancelled the action', 'User rejected'].includes(error.message))
        throw new PaymentNotSent('Payment canceled in the wallet.');
      throw error;
    } finally {
      sending.current = false;
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
    ++generation.current;
    setBusy(true);
    setError('');
    try {
      if (session) await revokeSession(session.token);
      clearSession();
      setSession(null);
      await connector.current.disconnect(connection.wallet);
    } catch {
      setError('Could not disconnect the wallet. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function invalidateSession() {
    ++generation.current;
    clearSession();
    setSession(null);
    setError('Your session is no longer valid. Verify ownership again to continue.');
  }

  return <WalletContext.Provider value={{
    accountId: connection?.accounts[0]?.accountId ?? '',
    ready, busy, error, session, authenticate, connect, disconnect, sendTransfer, invalidateSession,
  }}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const state = useContext(WalletContext);
  if (!state) throw new Error('useWallet must be used inside WalletProvider');
  return state;
}
