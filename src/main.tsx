import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App';
import './styles.css';

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID || 'missing-privy-app-id';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['wallet', 'email', 'sms', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#f8d34a',
          showWalletLoginFirst: true,
          walletChainType: 'ethereum-only',
          walletList: [
            'detected_ethereum_wallets',
            'metamask',
            'base_account',
            'coinbase_wallet',
            'rainbow',
            'rabby_wallet',
            'wallet_connect'
          ]
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets'
          }
        },
        defaultChain: {
          id: 84532,
          name: 'Base Sepolia',
          network: 'base-sepolia',
          nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
          rpcUrls: {
            default: { http: [import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'] }
          }
        }
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);
