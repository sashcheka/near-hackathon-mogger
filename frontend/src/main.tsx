import { createRoot } from 'react-dom/client';
import App from './App';
import { WalletProvider } from './WalletProvider';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <WalletProvider><App /></WalletProvider>,
);
