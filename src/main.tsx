import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import ErrorFallback from './app/ErrorFallback';
import { ErrorBoundary, initMonitoring } from './services/sentry';
import './index.css';
initMonitoring();
createRoot(document.getElementById('root') as HTMLElement).render(<React.StrictMode><ErrorBoundary fallback={<ErrorFallback />}><BrowserRouter><App /></BrowserRouter></ErrorBoundary></React.StrictMode>);
