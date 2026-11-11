import { useEffect, useRef, useState } from 'react';
import { ApiError, cancelOrder, getOrder, policyMessage } from './api';
import type { OrderDetails } from './api';
import { fromYocto } from './amounts';
import { checkPayment, PaymentRecoveryError, resetUnknownPayment, startPayment } from './paymentFlow';
import { clearAttempt, isTransactionHash, payableDetails, PaymentNotSent, readAttempt } from './paymentState';
import type { Attempt } from './paymentState';
import { useWallet } from './WalletProvider';
import { cancelSafely } from './cancelFlow';

type Props = { orderId: string; accountId: string; token: string; onPaid: (order: OrderDetails) => void };

export default function PaymentPanel({ orderId, accountId, token, onPaid }: Props) {
  const { busy: walletBusy, sendTransfer, invalidateSession } = useWallet();
  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [hashInput, setHashInput] = useState('');
  const [noTransfer, setNoTransfer] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [phase, setPhase] = useState('');
  const version = useRef(0);
  const working = useRef(false);
  const context = { orderId, accountId, token };

  function loadAttempt(fallbackHash?: string) {
    try {
      const saved = readAttempt(accountId, orderId);
      setAttempt(saved?.hash ? saved : fallbackHash ? { hash: fallbackHash } : saved);
    } catch (error) {
      setAttempt({ hash: fallbackHash ?? null });
      if (!fallbackHash) setError(error instanceof Error ? error.message : 'Payment recovery is unavailable.');
    }
  }

  useEffect(() => {
    const current = ++version.current;
    setLoading(true);
    setDetails(null);
    setError('');
    getOrder(orderId, token).then((saved) => {
      if (version.current !== current) return;
      setDetails(saved);
      if (saved.status === 'paid') {
        setAttempt(null);
        try { clearAttempt(accountId, orderId); } catch { /* Paid status is saved by the backend. */ }
      } else loadAttempt();
    }).catch((error: Error) => {
      if (version.current !== current) return;
      if (error instanceof ApiError && error.status === 401) invalidateSession();
      else setError(error.message);
    }).finally(() => { if (version.current === current) setLoading(false); });
    return () => { ++version.current; };
  }, [orderId, accountId, token, refresh]);

  async function run(action: 'pay' | 'check' | 'reset') {
    if (working.current || !details) return;
    working.current = true;
    const current = version.current;
    setPhase(action === 'pay' ? 'Preparing payment…' : 'Checking payment…');
    setError('');
    setNotice('');
    let currentHash = action === 'check' ? attempt?.hash ?? hashInput.trim() : undefined;
    try {
      let paid: OrderDetails | null;
      if (action === 'pay') {
        paid = await startPayment(context, payableDetails(details), async (payment) => {
          if (version.current === current) setPhase('Confirm in your wallet…');
          const hash = await sendTransfer(payment);
          currentHash = hash;
          if (version.current === current) {
            setAttempt({ hash });
            setPhase('Checking payment…');
          }
          return hash;
        });
      } else if (action === 'check') {
        const hash = attempt?.hash ?? hashInput.trim();
        if (isTransactionHash(hash)) setAttempt({ hash });
        paid = await checkPayment(context, hash);
      } else paid = await resetUnknownPayment(context, noTransfer);
      if (version.current !== current) return;
      setAttempt(null);
      setNoTransfer(false);
      if (paid) {
        setDetails(paid);
        onPaid(paid);
      } else setNotice('You can request a new payment. No funds were sent by this reset.');
    } catch (error) {
      if (version.current !== current) return;
      if (error instanceof ApiError && error.status === 401) invalidateSession();
      else if (error instanceof PaymentNotSent) {
        loadAttempt();
        setNotice(error.message);
      } else {
        if (error instanceof PaymentRecoveryError) currentHash = error.hash;
        loadAttempt(isTransactionHash(currentHash) ? currentHash : undefined);
        const message = error instanceof Error ? error.message : 'Payment could not be confirmed. Check wallet history.';
        if (error instanceof ApiError && ['transaction_pending', 'transaction_not_found'].includes(error.code))
          setNotice(message);
        else setError(message);
      }
    } finally {
      working.current = false;
      if (version.current === current) setPhase('');
    }
  }

  async function cancel() {
    if (working.current || walletBusy || !details || details.status !== 'pending_payment') return;
    if (!window.confirm('Cancel this item? Check your wallet first: a submitted transfer can still be confirmed.')) return;
    working.current = true;
    setPhase('Cancelling…');
    setError('');
    try {
      await cancelSafely(accountId, [orderId], () => cancelOrder(token, orderId));
      const updated = await getOrder(orderId, token);
      setDetails(updated);
      onPaid(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Cancellation failed.');
    } finally {
      working.current = false;
      setPhase('');
    }
  }

  const disabled = loading || !details || !!phase || walletBusy;
  return <section className="payment-panel" aria-label="Payment" aria-busy={loading || !!phase}>
    <div className="payment-heading"><h3>Payment</h3><small>NEAR Testnet</small></div>
    {loading && <p role="status">Loading payment details…</p>}
    {details?.status === 'paid' ? <div className="payment-receipt">
      <span className="order-status paid">Payment confirmed</span>
      {details.payment && <div className="receipt-field">
        <small>Sent to</small><strong>{details.payment.receiver_id}</strong>
      </div>}
      {details.transaction_hash && isTransactionHash(details.transaction_hash) && <>
        <div className="receipt-field"><small>Transaction</small><span>{details.transaction_hash}</span></div>
        <a href={`https://testnet.nearblocks.io/txns/${details.transaction_hash}`}
          target="_blank" rel="noopener noreferrer">View on NEAR Explorer ↗</a>
      </>}
    </div> : <>
      {details?.status === 'cancelled' && <p>This item is cancelled. If a transfer was already sent, enter its transaction hash to check it.</p>}
      {details?.payment && details.status === 'pending_payment' && <p>
        Send <strong>{fromYocto(details.total_yocto)} test NEAR</strong> to{' '}
        <strong>{details.payment.receiver_id}</strong>. The network fee is additional.
      </p>}
      {details && !details.payment && <p>Payment is unavailable for this order.</p>}
      {details && !attempt && details.policy_error !== '' &&
        <p className="error" role="alert">{policyMessage(details.policy_error)}</p>}
      {!loading && details?.status === 'pending_payment' && details.payment && !attempt && details.policy_error === '' && <button type="button" disabled={disabled}
        onClick={() => { void run('pay'); }}>Pay {fromYocto(details.total_yocto)} test NEAR</button>}
      {details?.status === 'pending_payment' && <button className="secondary-button" type="button" disabled={disabled}
        onClick={() => { void cancel(); }}>Cancel item</button>}
      {details?.status === 'cancelled' && !attempt && <div>
        <label htmlFor="cancelled-payment-hash">Transaction hash</label>
        <input id="cancelled-payment-hash" value={hashInput} maxLength={44} disabled={disabled}
          onChange={(event) => setHashInput(event.target.value)} />
        <button type="button" disabled={disabled || !isTransactionHash(hashInput.trim())}
          onClick={() => { void run('check'); }}>Check payment</button>
      </div>}
      {attempt?.hash && <>
        <small>Transaction: {attempt.hash}</small>
        <button type="button" disabled={disabled} onClick={() => { void run('check'); }}>Check payment</button>
        <p>Checking this transaction does not send another transfer.</p>
      </>}
      {attempt && !attempt.hash && <div>
        <p>A wallet request started without a confirmed result. Check wallet history and close any pending confirmation.</p>
        <label htmlFor="payment-hash">Transaction hash, if a transfer was sent</label>
        <input id="payment-hash" value={hashInput} maxLength={44} disabled={disabled}
          onChange={(event) => setHashInput(event.target.value)} />
        <button type="button" disabled={disabled || !isTransactionHash(hashInput.trim())}
          onClick={() => { void run('check'); }}>Check payment</button>
        {details?.status === 'pending_payment' && <><label className="payment-reset">
          <input type="checkbox" checked={noTransfer} disabled={disabled}
            onChange={(event) => setNoTransfer(event.target.checked)} />
          <span>I checked my wallet: no transfer was sent and no confirmation is open.</span>
        </label>
        <button className="secondary-button" type="button" disabled={disabled || !noTransfer}
          onClick={() => { void run('reset'); }}>Allow a new payment</button></>}
      </div>}
    </>}
    {phase && <p role="status">{phase}</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {!loading && !phase && details?.status !== 'paid' && <button className="secondary-button" type="button" disabled={walletBusy}
      onClick={() => { if (!working.current) setRefresh(refresh + 1); }}>Refresh details</button>}
  </section>;
}
