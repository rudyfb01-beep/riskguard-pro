import { Injectable, computed, inject, signal } from '@angular/core';
import { RiskDataService } from './risk-data.service';
import { AprInputs, computeApr, EMPTY_APR_INPUTS, normalizeAprInputs } from '../models/apr.model';

export type { AprInputs, AprYear } from '../models/apr.model';
export { computeApr, DEMO_APR_INPUTS, EMPTY_APR_INPUTS, normalizeAprInputs } from '../models/apr.model';

/**
 * Preparación para el cálculo de APR por riesgo operacional.
 *
 * El Capítulo CAC-20 (RAN CACs) está en consulta pública desde octubre de 2026 y
 * su metodología no se conoce en detalle. Este servicio:
 *  1. Resume la base de pérdidas por año y su calidad (insumo de cualquier
 *     método estandarizado que use pérdidas).
 *  2. Simula el método estándar de Basilea III (BCBS, 2017: indicador de negocio,
 *     BIC e ILM) con parámetros editables. Es una REFERENCIA, no el cálculo
 *     normativo; debe reemplazarse cuando se publique el CAC-20 definitivo.
 * Montos del indicador de negocio en millones de pesos (MM$).
 */

@Injectable({ providedIn: 'root' })
export class AprService {
  private readonly rs = inject(RiskDataService);

  readonly inputs = signal<AprInputs>(structuredClone(EMPTY_APR_INPUTS));

  /** Pérdidas por año contable (o de ocurrencia si falta), en USD como la base de pérdidas. */
  readonly lossHistory = computed(() => {
    const byYear = new Map<number, { year: number; events: number; aboveThreshold: number; gross: number; recovered: number; net: number; incomplete: number }>();
    for (const f of this.rs.lossDatabase()) {
      const date = f.accountingDate || f.occurrenceDate || f.reportedAt.slice(0, 10);
      const year = Number(date.slice(0, 4));
      if (!byYear.has(year)) byYear.set(year, { year, events: 0, aboveThreshold: 0, gross: 0, recovered: 0, net: 0, incomplete: 0 });
      const row = byYear.get(year)!;
      row.events++;
      if (this.rs.isAboveLossThreshold(f)) {
        row.aboveThreshold++;
        row.gross += f.realLossAmountUSD || 0;
        row.recovered += f.recoveredAmountUSD || 0;
        row.net += this.rs.netLoss(f);
      }
      if (this.rs.missingLossFields(f).length) row.incomplete++;
    }
    return [...byYear.values()].sort((a, b) => b.year - a.year);
  });

  readonly dataQuality = computed(() => {
    const db = this.rs.lossDatabase();
    const complete = db.filter(f => this.rs.missingLossFields(f).length === 0).length;
    return {
      events: db.length,
      completePct: db.length ? Math.round((complete / db.length) * 100) : null as number | null,
      yearsAvailable: this.lossHistory().length,
      withoutAccountingDate: db.filter(f => !f.accountingDate).length,
    };
  });

  /** Pesos por unidad de la base de pérdidas: 1 si los montos ya se registran en CLP. */
  readonly lossToClp = computed(() => (this.rs.currencyCode() === 'CLP' ? 1 : normalizeAprInputs(this.inputs()).usdToClp));

  readonly result = computed(() => computeApr({ ...this.inputs(), usdToClp: this.lossToClp() }, this.lossHistory()));

  async saveInputs(next: AprInputs) {
    this.inputs.set(normalizeAprInputs(structuredClone(next)));
    const r = this.result();
    await this.rs.appendAuditLog('CONFIGURACIÓN_APR', 'Reporte', 'APR-OPERACIONAL',
      `Actualización de insumos de simulación de APR operacional. BI ${Math.round(r.bi).toLocaleString('es-CL')} MM$, APR estimado ${Math.round(r.apr).toLocaleString('es-CL')} MM$ (referencia Basilea III).`);
  }
}
