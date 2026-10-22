import {RenderMode, ServerRoute} from '@angular/ssr';

// Los datos se cargan desde la API en el navegador (dependen de la base de datos
// y del usuario), por lo que la aplicación se renderiza en el cliente.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
