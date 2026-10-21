import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {registerLocaleData} from '@angular/common';
import localeEsCl from '@angular/common/locales/es-CL';

// Formato chileno para números y fechas (miles con punto, decimales con coma).
registerLocaleData(localeEsCl);
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
    {provide: LOCALE_ID, useValue: 'es-CL'},
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiHeadersInterceptor]))
  ],
};
