import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ApiProvider } from './context/ApiContext.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ApiProvider>
        <App />
      </ApiProvider>
    </ErrorBoundary>
  </StrictMode>,
);
