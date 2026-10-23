import { Pipe, PipeTransform, inject } from '@angular/core';
import { CatalogService } from '../services/catalog.service';

/**
 * Formatea un monto en la moneda de registro configurada en Mantenedores → Parámetros generales.
 * CLP: $1.234.567 · USD: US$1.234.567. Se recalcula si cambia la moneda (pipe impuro).
 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly cat = inject(CatalogService);

  transform(value: number | null | undefined): string {
    return this.cat.formatMoney(value);
  }
}
