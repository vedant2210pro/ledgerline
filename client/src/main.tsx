import '@fontsource-variable/dm-sans/index.css';
import '@fontsource-variable/manrope/index.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
