import * as Sentry from '@sentry/node';
import { env } from './config/env';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      if (event.extra) {
        delete event.extra['phone'];
        delete event.extra['body'];
        delete event.extra['message'];
      }
      return event;
    },
  });
}
