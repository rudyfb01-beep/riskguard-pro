import { Injectable, inject } from '@angular/core';
import { CatalogService } from './catalog.service';
import { RiskDataService } from './risk-data.service';
import { ResilienceService } from './resilience.service';
import { PersistenceService, apiFetch } from './persistence.service';
import {
  AccountingAccount, BusinessProcess, GeneralParameters, OrgArea, ProviderCatalogs, RiskAppetite, RiskScale,
  normalizeAccounts, normalizeGeneralParameters, normalizeProviderCatalogs, normalizeRiskAppetite, normalizeRiskScale,
} from '../models/catalog.model';

/** Error de validación de un mantenedor (se muestra tal cual al usuario). */
export class CatalogValidationError extends Error {}

/**
 * Altas, cambios y bajas de los mantenedores. Valida duplicados y uso, deja registro en la
 * bitácora y, al renombrar, propaga el nuevo nombre a los registros que lo usan.
 */
@Injectable({ providedIn: 'root' })
export class CatalogAdminService {
  private readonly cat = inject(CatalogService);
  private readonly rs = inject(RiskDataService);
  private readonly res = inject(ResilienceService);
  private readonly persistence = inject(PersistenceService);

  canManage(): boolean {
    return this.rs.hasPermission('canManageCatalogs');
  }

  private guard() {
    this.rs.ensure(['canManageCatalogs'], 'administrar mantenedores');
  }

  /**
   * Con base de datos el servidor propaga los renombres (aunque el usuario no tenga permiso sobre
   * riesgos o controles) y la app recarga; aquí solo se aplica si los datos no vienen del servidor.
   */
  private get cascadeLocally(): boolean {
    return this.persistence.mode() !== 'database';
  }

  newId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  // ---------------------------------------------------------------------------
  // Áreas
  // ---------------------------------------------------------------------------

  areaUsage(area: OrgArea): { processes: number; roles: number; users: number } {
    return {
      processes: this.cat.processes().filter(p => p.areaId === area.id).length,
      roles: this.rs.organizationalRoles().filter(r => r.department === area.name).length,
      users: this.rs.userProfiles().filter(u => u.department === area.name).length,
    };
  }

  async saveArea(data: OrgArea): Promise<void> {
    this.guard();
    const name = data.name.trim();
    if (!name) throw new CatalogValidationError('Ingresa el nombre del área.');
    if (this.cat.areas().some(a => a.id !== data.id && a.name.toLowerCase() === name.toLowerCase())) {
      throw new CatalogValidationError(`Ya existe un área llamada "${name}".`);
    }
    const prev = this.cat.areas().find(a => a.id === data.id);
    const area: OrgArea = { ...data, name, manager: data.manager.trim(), description: data.description.trim() };
    this.cat.areas.update(list => (prev ? list.map(a => (a.id === area.id ? area : a)) : [...list, area]));

    if (prev && prev.name !== name && this.cascadeLocally) {
      this.rs.organizationalRoles.update(list => list.map(r => (r.department === prev.name ? { ...r, department: name } : r)));
      this.rs.userProfiles.update(list => list.map(u => (u.department === prev.name ? { ...u, department: name } : u)));
      const cp = this.rs.currentProfile();
      if (cp.department === prev.name) this.rs.currentProfile.set({ ...cp, department: name });
    }
    await this.rs.appendAuditLog('MANTENEDOR_AREA', 'Mantenedor', area.id,
      prev ? `Área modificada: "${prev.name}"${prev.name !== name ? ` → "${name}"` : ''}${prev.active !== area.active ? (area.active ? ' (reactivada)' : ' (desactivada)') : ''}.`
        : `Área creada: "${name}".`);
  }

  async deleteArea(area: OrgArea): Promise<void> {
    this.guard();
    const u = this.areaUsage(area);
    const total = u.processes + u.roles + u.users;
    if (total > 0) {
      throw new CatalogValidationError(`"${area.name}" está en uso (${u.processes} procesos, ${u.roles} puestos, ${u.users} usuarios). Desactívala en vez de eliminarla.`);
    }
    this.cat.areas.update(list => list.filter(a => a.id !== area.id));
    await this.rs.appendAuditLog('MANTENEDOR_AREA', 'Mantenedor', area.id, `Área eliminada: "${area.name}".`);
  }

  // ---------------------------------------------------------------------------
  // Procesos
  // ---------------------------------------------------------------------------

  nextProcessCode(): string {
    const max = this.cat.processes().reduce((m, p) => Math.max(m, Number(p.code.replace(/\D/g, '')) || 0), 0);
    return `PRC-${String(max + 1).padStart(2, '0')}`;
  }

  processUsage(name: string): { risks: number; controls: number; flaws: number; kris: number; alerts: number; findings: number; total: number } {
    const risks = this.rs.risks().filter(r => r.process === name).length;
    const controls = this.rs.controls().filter(c => c.process === name).length;
    const flaws = this.rs.flaws().filter(f => f.process === name).length;
    const kris = this.rs.kriDefinitions().filter(k => k.process === name).length;
    const alerts = this.rs.alerts().filter(a => a.process === name).length;
    const findings = this.rs.audits().reduce((n, a) => n + a.findings.filter(f => f.process === name).length, 0);
    return { risks, controls, flaws, kris, alerts, findings, total: risks + controls + flaws + kris + alerts + findings };
  }

  async saveProcess(data: BusinessProcess): Promise<void> {
    this.guard();
    const name = data.name.trim();
    const code = data.code.trim().toUpperCase();
    if (!name) throw new CatalogValidationError('Ingresa el nombre del proceso.');
    if (!code) throw new CatalogValidationError('Ingresa el código del proceso.');
    if (this.cat.processes().some(p => p.id !== data.id && p.name.toLowerCase() === name.toLowerCase())) {
      throw new CatalogValidationError(`Ya existe un proceso llamado "${name}".`);
    }
    if (this.cat.processes().some(p => p.id !== data.id && p.code.toUpperCase() === code)) {
      throw new CatalogValidationError(`El código ${code} ya está asignado a otro proceso.`);
    }
    const prev = this.cat.processes().find(p => p.id === data.id);
    const proc: BusinessProcess = { ...data, name, code, owner: data.owner.trim(), description: data.description.trim() };
    this.cat.processes.update(list => (prev ? list.map(p => (p.id === proc.id ? proc : p)) : [...list, proc]));

    if (prev && prev.name !== name && this.cascadeLocally) this.renameProcessLocally(prev.name, name);
    await this.rs.appendAuditLog('MANTENEDOR_PROCESO', 'Mantenedor', code,
      prev ? `Proceso ${code} modificado${prev.name !== name ? `: "${prev.name}" → "${name}" (referencias actualizadas)` : ''}${prev.active !== proc.active ? (proc.active ? ' (reactivado)' : ' (desactivado)') : ''}.`
        : `Proceso creado: ${code} "${name}".`);
  }

  private renameProcessLocally(oldName: string, newName: string) {
    const swap = <T extends { process: string }>(list: T[]) =>
      list.some(x => x.process === oldName) ? list.map(x => (x.process === oldName ? { ...x, process: newName } : x)) : list;
    this.rs.risks.update(swap);
    this.rs.controls.update(swap);
    this.rs.flaws.update(swap);
    this.rs.alerts.update(swap);
    this.rs.kriDefinitions.update(swap);
    this.rs.audits.update(list => list.map(a => {
      const touches = a.scope.includes(oldName) || a.findings.some(f => f.process === oldName);
      return touches ? { ...a, scope: a.scope.map(s => (s === oldName ? newName : s)), findings: swap(a.findings) } : a;
    }));
    this.res.providers.update(list => list.map(p => (p.supportedProcesses.includes(oldName)
      ? { ...p, supportedProcesses: p.supportedProcesses.map(s => (s === oldName ? newName : s)) } : p)));
  }

  async deleteProcess(proc: BusinessProcess): Promise<void> {
    this.guard();
    const u = this.processUsage(proc.name);
    if (u.total > 0) {
      throw new CatalogValidationError(`"${proc.name}" está en uso por ${u.total} registro(s). Desactívalo en vez de eliminarlo.`);
    }
    this.cat.processes.update(list => list.filter(p => p.id !== proc.id));
    await this.rs.appendAuditLog('MANTENEDOR_PROCESO', 'Mantenedor', proc.code, `Proceso eliminado: ${proc.code} "${proc.name}".`);
  }

  // ---------------------------------------------------------------------------
  // Parámetros generales
  // ---------------------------------------------------------------------------

  async saveParameters(next: GeneralParameters): Promise<void> {
    this.guard();
    const prev = this.cat.params();
    const clean = normalizeGeneralParameters(next);
    this.cat.generalParameters.set(clean);
    const changes: string[] = [];
    if (prev.currency !== clean.currency) changes.push(`moneda ${prev.currency} → ${clean.currency}`);
    if (prev.contractExpiryWarningDays !== clean.contractExpiryWarningDays) changes.push(`aviso de vencimiento de contratos ${prev.contractExpiryWarningDays} → ${clean.contractExpiryWarningDays} días`);
    for (const k of Object.keys(clean.providerAssessmentMonths) as (keyof GeneralParameters['providerAssessmentMonths'])[]) {
      if (prev.providerAssessmentMonths[k] !== clean.providerAssessmentMonths[k]) changes.push(`evaluación proveedor ${k} ${prev.providerAssessmentMonths[k]} → ${clean.providerAssessmentMonths[k]} meses`);
    }
    for (const k of Object.keys(clean.vulnSlaDays) as (keyof GeneralParameters['vulnSlaDays'])[]) {
      if (prev.vulnSlaDays[k] !== clean.vulnSlaDays[k]) changes.push(`plazo vulnerabilidad ${k} ${prev.vulnSlaDays[k]} → ${clean.vulnSlaDays[k]} días`);
    }
    if (changes.length) {
      await this.rs.appendAuditLog('CONFIGURACIÓN_PARÁMETROS', 'Mantenedor', 'PARAMETROS', `Parámetros generales: ${changes.join('; ')}.`);
    }
  }

  // ---------------------------------------------------------------------------
  // Escala de riesgo y apetito
  // ---------------------------------------------------------------------------

  async saveRiskScale(next: RiskScale): Promise<void> {
    this.guard();
    const clean = normalizeRiskScale(next);
    if ([...clean.likelihood, ...clean.impact].some(l => !l.name.trim())) throw new CatalogValidationError('Cada nivel debe tener nombre.');
    const prev = this.cat.riskScale();
    this.cat.riskScaleRaw.set(clean);
    const names = (s: RiskScale) => `P: ${s.likelihood.map(l => l.name).join('/')} · I: ${s.impact.map(l => l.name).join('/')}`;
    await this.rs.appendAuditLog('CONFIGURACIÓN_PARÁMETROS', 'Mantenedor', 'ESCALA',
      `Escala de riesgo actualizada${names(prev) !== names(clean) ? ` (${names(clean)})` : ' (criterios)'}.`);
  }

  async saveRiskAppetite(next: RiskAppetite): Promise<void> {
    this.guard();
    const clean = normalizeRiskAppetite(next);
    const bad = next.limits.find(l => Number(l.toleranceMaxScore) < Number(l.appetiteMaxScore));
    if (bad) throw new CatalogValidationError(`En "${bad.category}" la tolerancia no puede ser menor que el apetito.`);
    const prev = this.cat.riskAppetite();
    this.cat.riskAppetiteRaw.set(clean);
    const changes = clean.limits.filter((l, i) => JSON.stringify(l) !== JSON.stringify(prev.limits[i]))
      .map(l => `${l.category}: apetito ≤${l.appetiteMaxScore}, tolerancia ≤${l.toleranceMaxScore}${l.annualLossLimit ? `, pérdida anual ≤${l.annualLossLimit}` : ''}`);
    await this.rs.appendAuditLog('CONFIGURACIÓN_PARÁMETROS', 'Mantenedor', 'APETITO',
      `Apetito de riesgo actualizado${clean.approvalDate ? ` (aprobado ${clean.approvalDate}${clean.approvedBy ? ` por ${clean.approvedBy}` : ''})` : ''}${changes.length ? `: ${changes.join('; ')}` : ''}.`);
  }

  // ---------------------------------------------------------------------------
  // Cuentas contables
  // ---------------------------------------------------------------------------

  accountUsage(code: string): number {
    return this.rs.flaws().filter(f => f.accountingAccount === code).length;
  }

  async saveAccount(account: AccountingAccount, originalCode?: string): Promise<void> {
    this.guard();
    const code = account.code.trim();
    if (!code || !account.name.trim()) throw new CatalogValidationError('Ingresa código y nombre de la cuenta.');
    const list = this.cat.accountingAccounts();
    if (list.some(a => a.code.toLowerCase() === code.toLowerCase() && a.code !== originalCode)) {
      throw new CatalogValidationError(`La cuenta ${code} ya existe.`);
    }
    if (originalCode && originalCode !== code && this.accountUsage(originalCode) > 0) {
      throw new CatalogValidationError(`La cuenta ${originalCode} está asignada a eventos de pérdida; no se puede cambiar su código. Desactívala y crea una nueva.`);
    }
    const clean = { code, name: account.name.trim(), active: account.active };
    const next = originalCode ? list.map(a => (a.code === originalCode ? clean : a)) : [...list, clean];
    this.cat.accountingAccountsRaw.set(normalizeAccounts(next));
    await this.rs.appendAuditLog('CONFIGURACIÓN_PARÁMETROS', 'Mantenedor', code,
      `${originalCode ? 'Cuenta contable modificada' : 'Cuenta contable creada'}: ${code} "${clean.name}"${clean.active ? '' : ' (inactiva)'}.`);
  }

  async deleteAccount(code: string): Promise<void> {
    this.guard();
    const n = this.accountUsage(code);
    if (n > 0) throw new CatalogValidationError(`La cuenta ${code} está asignada a ${n} evento(s) de pérdida. Desactívala en vez de eliminarla.`);
    this.cat.accountingAccountsRaw.set(this.cat.accountingAccounts().filter(a => a.code !== code));
    await this.rs.appendAuditLog('CONFIGURACIÓN_PARÁMETROS', 'Mantenedor', code, `Cuenta contable eliminada: ${code}.`);
  }

  /** Carga varias cuentas desde texto (una por línea: "código;nombre" o "código<TAB>nombre"). */
  async importAccounts(text: string): Promise<number> {
    this.guard();
    const rows = text.split(/\r?\n/).map(l => l.split(/[;\t]/).map(x => x.trim())).filter(r => r[0] && r[1]);
    if (!rows.length) throw new CatalogValidationError('No se encontraron filas con código y nombre (separados por punto y coma o tabulación).');
    const list = [...this.cat.accountingAccounts()];
    let added = 0;
    for (const [code, name] of rows) {
      const i = list.findIndex(a => a.code.toLowerCase() === code.toLowerCase());
      if (i >= 0) list[i] = { ...list[i], name };
      else { list.push({ code, name, active: true }); added++; }
    }
    this.cat.accountingAccountsRaw.set(normalizeAccounts(list));
    await this.rs.appendAuditLog('CONFIGURACIÓN_PARÁMETROS', 'Mantenedor', 'CUENTAS', `Carga de plan de cuentas: ${rows.length} filas (${added} nuevas).`);
    return rows.length;
  }

  // ---------------------------------------------------------------------------
  // Catálogos de proveedores
  // ---------------------------------------------------------------------------

  categoryUsage(category: string): number {
    return this.res.providers().filter(p => p.category === category).length;
  }

  async saveProviderCatalogs(next: ProviderCatalogs, renamedCategories: Record<string, string> = {}): Promise<void> {
    this.guard();
    const clean = normalizeProviderCatalogs(next);
    if (!clean.clauses.length) throw new CatalogValidationError('Debe haber al menos una cláusula.');
    const prev = this.cat.providerCatalogs();
    const removed = prev.categories.filter(c => !clean.categories.includes(c) && !renamedCategories[c]);
    const inUse = removed.filter(c => this.categoryUsage(c) > 0);
    if (inUse.length) throw new CatalogValidationError(`No se puede quitar "${inUse[0]}": hay proveedores con esa categoría.`);
    const renamingInUse = Object.entries(renamedCategories).some(([from, to]) => from !== to && this.categoryUsage(from) > 0);
    if (renamingInUse && !this.rs.hasPermission('canManageProviders')) {
      throw new CatalogValidationError('Renombrar una categoría en uso cambia los proveedores que la tienen: requiere también el permiso "Gestionar Proveedores".');
    }
    this.cat.providerCatalogsRaw.set(clean);
    // Renombre de categoría: se actualizan los proveedores que la usan.
    for (const [from, to] of Object.entries(renamedCategories)) {
      if (from !== to && this.categoryUsage(from) > 0) {
        this.res.providers.update(list => list.map(p => (p.category === from ? { ...p, category: to } : p)));
      }
    }
    const added = clean.clauses.filter(c => !prev.clauses.some(p => p.key === c.key)).map(c => c.label);
    const gone = prev.clauses.filter(c => !clean.clauses.some(p => p.key === c.key)).map(c => c.label);
    await this.rs.appendAuditLog('CONFIGURACIÓN_PARÁMETROS', 'Mantenedor', 'PROVEEDORES',
      `Catálogos de proveedores actualizados: ${clean.categories.length} categorías, ${clean.clauses.length} cláusulas`
      + `${added.length ? `; cláusulas nuevas: ${added.join(', ')}` : ''}${gone.length ? `; quitadas: ${gone.join(', ')}` : ''}.`);
  }

  // ---------------------------------------------------------------------------
  // Cambio de moneda con conversión de montos
  // ---------------------------------------------------------------------------

  /**
   * Cambia la moneda de registro y convierte todos los montos guardados con el tipo de cambio
   * indicado (pesos por dólar). Con base de datos lo hace el servidor en una transacción y la app recarga.
   */
  async convertCurrency(to: 'CLP' | 'USD', rate: number): Promise<void> {
    this.guard();
    const from = this.cat.currency();
    if (from === to) return;
    if (!Number.isFinite(rate) || rate < 100 || rate > 5000) throw new CatalogValidationError('Ingresa un tipo de cambio en pesos por dólar entre 100 y 5.000.');

    await this.persistence.flush();
    const resp = await apiFetch('/api/admin/convert-currency', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, rate }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new CatalogValidationError(data?.error || `Error ${resp.status} al convertir los montos.`);
    await this.persistence.reload();
  }
}
