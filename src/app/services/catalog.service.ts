import { Injectable, computed, signal } from '@angular/core';
import {
  AccountingAccount, AppetiteLimit, BusinessProcess, DEFAULT_GENERAL_PARAMETERS, DEFAULT_PROVIDER_CATALOGS, DEFAULT_RISK_APPETITE,
  DEFAULT_RISK_SCALE, GeneralParameters, OrgArea, appetiteStatus, normalizeAccounts, normalizeGeneralParameters,
  normalizeProviderCatalogs, normalizeRiskAppetite, normalizeRiskScale,
} from '../models/catalog.model';
import { DEFAULT_AREAS } from '../data/base-seed';
import { DEMO_ACCOUNTING_ACCOUNTS, DEMO_PROCESSES } from '../data/demo-seed';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * Estado de los mantenedores (áreas, procesos y parámetros generales).
 * Solo contiene datos y vistas derivadas; las altas y cambios están en CatalogAdminService.
 */
@Injectable({ providedIn: 'root' })
export class CatalogService {
  readonly areas = signal<OrgArea[]>(clone(DEFAULT_AREAS));
  readonly processes = signal<BusinessProcess[]>(clone(DEMO_PROCESSES));
  /** Valor guardado tal cual; usar `params()` para leerlo ya validado. */
  readonly generalParameters = signal<unknown>(clone(DEFAULT_GENERAL_PARAMETERS));

  /** Pestaña de Mantenedores que se abre al navegar desde otra pantalla. */
  readonly requestedTab = signal<string | null>(null);

  readonly params = computed<GeneralParameters>(() => normalizeGeneralParameters(this.generalParameters()));

  // Prioridad 2 (cada uno se guarda como un ajuste; usar las versiones normalizadas)
  readonly riskScaleRaw = signal<unknown>(clone(DEFAULT_RISK_SCALE));
  readonly riskAppetiteRaw = signal<unknown>(clone(DEFAULT_RISK_APPETITE));
  readonly accountingAccountsRaw = signal<unknown>(clone(DEMO_ACCOUNTING_ACCOUNTS));
  readonly providerCatalogsRaw = signal<unknown>(clone(DEFAULT_PROVIDER_CATALOGS));

  readonly riskScale = computed(() => normalizeRiskScale(this.riskScaleRaw()));
  readonly riskAppetite = computed(() => normalizeRiskAppetite(this.riskAppetiteRaw()));
  readonly accountingAccounts = computed(() => normalizeAccounts(this.accountingAccountsRaw()));
  readonly providerCatalogs = computed(() => normalizeProviderCatalogs(this.providerCatalogsRaw()));

  likelihoodName(level: number): string {
    return this.riskScale().likelihood.find(l => l.level === level)?.name ?? String(level);
  }

  impactName(level: number): string {
    return this.riskScale().impact.find(l => l.level === level)?.name ?? String(level);
  }

  appetiteLimit(category: string): AppetiteLimit | undefined {
    return this.riskAppetite().limits.find(l => l.category === category);
  }

  appetiteStatus(residualScore: number, category: string) {
    return appetiteStatus(residualScore, this.appetiteLimit(category));
  }

  /** Opciones de cuenta contable: activas + la actual si no está en el catálogo. */
  accountOptions(current?: string): AccountingAccount[] {
    const list = this.accountingAccounts().filter(a => a.active || a.code === current);
    return current && !list.some(a => a.code === current) ? [...list, { code: current, name: '(no está en el catálogo)', active: false }] : list;
  }

  /** "código – nombre" de una cuenta (o el texto tal cual si no está en el catálogo). */
  accountLabel(code: string | undefined): string {
    if (!code) return '';
    const a = this.accountingAccounts().find(x => x.code === code);
    return a ? `${a.code} – ${a.name}` : code;
  }

  providerCategoryOptions(current?: string): string[] {
    const list = this.providerCatalogs().categories;
    return current && !list.includes(current) ? [...list, current] : list;
  }

  readonly currency = computed(() => this.params().currency);

  readonly activeAreas = computed(() => this.areas().filter(a => a.active).sort((a, b) => a.name.localeCompare(b.name, 'es')));
  readonly activeProcesses = computed(() => this.processes().filter(p => p.active).sort((a, b) => a.code.localeCompare(b.code)));
  /** Nombres de procesos activos, para listas de selección. */
  readonly processNames = computed(() => this.activeProcesses().map(p => p.name));

  areaById(id: string | undefined): OrgArea | undefined {
    return id ? this.areas().find(a => a.id === id) : undefined;
  }

  processByName(name: string): BusinessProcess | undefined {
    const n = name.trim().toLowerCase();
    return this.processes().find(p => p.name.toLowerCase() === n);
  }

  /** Opciones para un selector de proceso: activos + el valor actual si ya no está en la lista. */
  processOptions(current?: string): string[] {
    const names = this.processNames();
    return current && !names.includes(current) ? [...names, current] : names;
  }

  /** Opciones para un selector de área: activas + el valor actual si no está en la lista. */
  areaOptions(current?: string): string[] {
    const names = this.activeAreas().map(a => a.name);
    return current && !names.includes(current) ? [...names, current] : names;
  }
}
