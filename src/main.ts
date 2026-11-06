import {bootstrapApplication} from '@angular/platform-browser';
import {App} from './app/app';
import {appConfig} from './app/app.config';

// Ventana emergente del ingreso con Google (sesión vencida): al volver con éxito se cierra
// sola; la ventana principal detecta la sesión nueva y continúa.
const popupLogin = new URLSearchParams(location.search).get('popup_login');
if (popupLogin === 'ok' && window.opener) {
  document.body.textContent = 'Sesión iniciada. Puede cerrar esta ventana.';
  window.close();
} else {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
