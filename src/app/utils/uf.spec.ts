import { describe, expect, it } from 'vitest';
import { OperationalFlaw } from '../models/risk.model';
import { formatUf, lossReferenceDay, normalizeUfTable, parseMindicador, parseUfText, toUf, ufForLoss, ufOn, ufStampFor } from './uf';
import { normalizeGeneralParameters } from '../models/catalog.model';

const table = { '2026-10-01': 39500.12, '2026-10-02': 39510.5, '2026-10-31': 39600 };
const flaw = (o: Partial<OperationalFlaw> = {}): OperationalFlaw => ({
  id: 'f', title: 't', description: '', reportedBy: 'x', process: 'p', severity: 'Media', reportedAt: '2026-11-05 10:00', status: 'Pendiente de Evaluación',
  realLossAmountUSD: 3_950_012, ...o,
});

describe('UF', () => {
  it('valor del día o el último anterior (hasta 45 días)', () => {
    expect(ufOn(table, '2026-10-02')).toEqual({ value: 39510.5, date: '2026-10-02' });
    expect(ufOn(table, '2026-10-15')).toEqual({ value: 39510.5, date: '2026-10-02' });
    expect(ufOn(table, '2026-12-20')).toBeNull();
    expect(ufOn(table, '2026-09-30')).toBeNull();
    expect(ufOn(table, undefined)).toBeNull();
  });

  it('fecha de referencia: contable, descubrimiento, ocurrencia o registro', () => {
    expect(lossReferenceDay(flaw({ occurrenceDate: '2026-10-01', accountingDate: '2026-10-31' }))).toBe('2026-10-31');
    expect(lossReferenceDay(flaw({ occurrenceDate: '2026-10-01' }))).toBe('2026-10-01');
    expect(lossReferenceDay(flaw())).toBe('2026-11-05');
  });

  it('el valor guardado en el evento manda; si falta, se usa la tabla', () => {
    const f = flaw({ accountingDate: '2026-10-01' });
    expect(ufStampFor(f, table)).toEqual({ ufValueClp: 39500.12, ufDate: '2026-10-01' });
    expect(ufForLoss({ ...f, ufValueClp: 38000, ufDate: '2025-12-31' }, table)).toEqual({ value: 38000, date: '2025-12-31', stored: true });
    expect(ufForLoss(f, table)).toMatchObject({ value: 39500.12, stored: false });
    expect(toUf(3_950_012, 39500.12)).toBe(100);
    expect(formatUf(1234.5)).toBe('UF 1.234,50');
  });

  it('lee valores pegados y la serie de mindicador.cl', () => {
    const r = parseUfText('Fecha;Valor\n01-11-2026;39.612,45\n2026-11-02\t39613.1\n31/02/2026;39.000\nhola');
    expect(r.values).toEqual({ '2026-11-01': 39612.45, '2026-11-02': 39613.1 });
    expect(r.errors).toHaveLength(2);
    expect(parseMindicador({ serie: [{ fecha: '2026-11-06T03:00:00.000Z', valor: 39620.33 }, { fecha: 'x', valor: 1 }] })).toEqual({ '2026-11-06': 39620.33 });
    expect(normalizeUfTable({ '2026-11-01': '39612.456', mal: 1, '2026-11-02': 5 })).toEqual({ '2026-11-01': 39612.46 });
  });

  it('la moneda por omisión es CLP (las bases antiguas guardan USD explícito)', () => {
    expect(normalizeGeneralParameters({}).currency).toBe('CLP');
    expect(normalizeGeneralParameters({ currency: 'USD' }).currency).toBe('USD');
  });
});
