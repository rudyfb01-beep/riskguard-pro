import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {provideRouter} from '@angular/router';
import {HttpInterceptorFn, provideHttpClient, withInterceptors} from '@angular/common/http';
import {API_HEADERS} from './services/persistence.service';

/** Agrega la cabecera anti-CSRF a las llamadas a la API propia. */
const apiHeadersInterceptor: HttpInterceptorFn = (req, next) =>
  req.url.startsWith('/api/') ? next(req.clone({ setHeaders: { ...API_HEADERS } })) : next(req);

import {routes} from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiHeadersInterceptor]))
  ],
};
