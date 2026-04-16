import React from 'react';
import ReactDOM from 'react-dom/client';
import { DiscordProvider } from '@/context/DiscordContext';
import App from '@/App';
import '@/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DiscordProvider>
      <App />
    </DiscordProvider>
  </React.StrictMode>,
);
