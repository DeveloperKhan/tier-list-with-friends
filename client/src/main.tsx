import React from 'react';
import ReactDOM from 'react-dom/client';
import { DiscordProvider } from '@/context/DiscordContext';
import App from '@/App';
import '@/index.css';

function setAppHeight() {
  document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
}
setAppHeight();
window.addEventListener('resize', setAppHeight);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DiscordProvider>
      <App />
    </DiscordProvider>
  </React.StrictMode>,
);
