import * as Sentry from '@sentry/react';
import { runtimeEnv } from '../utils/env';
export const initMonitoring = () => { if (!runtimeEnv.sentryDsn) return; Sentry.init({ dsn: runtimeEnv.sentryDsn, tracesSampleRate: 0.2, environment: import.meta.env.MODE }); };
export const ErrorBoundary = Sentry.ErrorBoundary;
