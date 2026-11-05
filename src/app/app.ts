import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PermissionDeniedError, RiskDataService } from './services/risk-data.service';
import { UserPermissions } from './models/risk.model';
import { PersistenceService } from './services/persistence.service';
import { LoginScreen } from './components/login-screen';
import { TopBar } from './components/top-bar';
import { ExecutiveKpis } from './components/executive-kpis';
import { HeatmapMatrix } from './components/heatmap-matrix';
import { RiskModal } from './components/risk-modal';
import { RiskImportModal } from './components/risk-import-modal';
import { FlawModal } from './components/flaw-modal';
import { ControlModal } from './components/control-modal';
import { ExecutiveReportModal } from './components/executive-report-modal';
import { ProcessHeatmap } from './components/process-heatmap';
import { DepartmentDashboard } from './components/department-dashboard';
import { RiskCharts } from './components/risk-charts';
import { ReportsCenter } from './components/reports-center';
import { SidebarNav } from './components/sidebar-nav';
import { KriThresholdModal } from './components/kri-threshold-modal';
import { RolesManagementModal } from './components/roles-management-modal';
import { AlertSettingsModal } from './components/alert-settings-modal';
import { RegulatoryReporting } from './components/regulatory-reporting';
import { ProvidersPanel } from './components/providers-panel';
import { ContinuityPanel } from './components/continuity-panel';
import { SecurityPanel } from './components/security-panel';
import { AprPanel } from './components/apr-panel';
import { CatalogsPanel } from './components/catalogs-panel';
import { CompliancePanel } from './components/compliance-panel';
import { ActionPlansPanel } from './components/action-plans-panel';
import { LinkedPlans } from './components/linked-plans';
import { SurveysPanel } from './components/surveys-panel';
import { ActionPlanService } from './services/action-plan.service';
import { AuditsPanel } from './components/audits-panel';
import { MoneyPipe } from './utils/money.pipe';
import { Control, KriDefinition, OperationalFlaw, Risk } from './models/risk.model';

export type ActiveTab =
  | 'tablero'
  | 'tableros-departamento'
  | 'graficos-analitica'
  | 'matriz-riesgos'
  | 'controles'
  | 'incidentes-perdidas'
  | 'falencias'
  | 'reportes-regulatorios'
  | 'proveedores'
  | 'continuidad'
  | 'seguridad-informacion'
  | 'apr-operacional'
  | 'mantenedores'
  | 'cumplimiento-ran'
  | 'planes-accion'
  | 'autoevaluaciones'
  | 'alertas-kri'
  | 'auditorias'
  | 'bitacora'
  | 'reportes-pdf';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatIconModule,
    TopBar,
    SidebarNav,
    ExecutiveKpis,
    HeatmapMatrix,
    ProcessHeatmap,
    DepartmentDashboard,
    RiskCharts,
    ReportsCenter,
    RiskModal,
    RiskImportModal,
    FlawModal,
    ControlModal,
    ExecutiveReportModal,
    KriThresholdModal,
    RolesManagementModal,
    AlertSettingsModal,
    RegulatoryReporting,
    ProvidersPanel,
    ContinuityPanel,
    SecurityPanel,
    AprPanel,
    CatalogsPanel,
    CompliancePanel,
    ActionPlansPanel,
    LinkedPlans,
    SurveysPanel,
    AuditsPanel,
    MoneyPipe,
    LoginScreen,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly riskService = inject(RiskDataService);
  readonly persistence = inject(PersistenceService);

  constructor() {
    // Carga los datos desde la base (o activa el modo demostración) en el navegador.
    afterNextRender(() => {
      this.persistence.init();
      // Si un administrador cambia los permisos del cargo, se aplican sin cerrar sesión:
      // al volver a la pestaña y cada 2 minutos se relee el perfil de la sesión.
      const refresh = () => { if (document.visibilityState === 'visible') this.persistence.refreshSessionProfile(); };
      window.addEventListener('focus', refresh);
      const timer = setInterval(refresh, 120_000);
      this.destroyRef.onDestroy(() => { window.removeEventListener('focus', refresh); clearInterval(timer); });
    });

    // Acciones bloqueadas por permisos: se informan al usuario.
    effect(() => {
      const n = this.riskService.permissionNotice();
      if (n) this.showToast(n.message);
    });

    // Un plan abierto desde cualquier módulo (incluidos los formularios modales) lleva a Planes de Acción.
    effect(() => {
      if (!this.actionPlans.openRequest()) return;
      untracked(() => {
        this.isRiskModalOpen.set(false);
        this.isControlModalOpen.set(false);
        this.isFlawModalOpen.set(false);
        this.setTab('planes-accion');
      });
    });
  }

  private readonly actionPlans = inject(ActionPlanService);

  private readonly destroyRef = inject(DestroyRef);

  /** El cargo actual tiene al menos uno de los permisos (para mostrar u ocultar acciones). */
  openKriThresholds() {
    if (!this.riskService.requirePermission(['canConfigureKRIs'], 'configurar umbrales de KRIs')) return;
    this.isKriThresholdModalOpen.set(true);
  }

  can(...permissions: (keyof UserPermissions)[]): boolean {
    return this.riskService.canAny(...permissions);
  }

  // Active Navigation Tab
  readonly activeTab = signal<ActiveTab>('tablero');

  // Layout mode: 'vertical' (sidebar on left) vs 'horizontal' (top navigation)
  readonly layoutMode = signal<'vertical' | 'horizontal'>('vertical');
  readonly isSidebarCollapsed = signal<boolean>(false);
  readonly isMobileSidebarOpen = signal<boolean>(false);

  toggleLayoutMode() {
    this.layoutMode.update(m => m === 'vertical' ? 'horizontal' : 'vertical');
    this.showToast(
      this.layoutMode() === 'vertical'
        ? 'Diseño actualizado: Menú lateral vertical a la izquierda.'
        : 'Diseño actualizado: Menú horizontal superior.'
    );
  }

  toggleSidebarCollapse() {
    this.isSidebarCollapsed.update(c => !c);
  }

  toggleMobileSidebar() {
    this.isMobileSidebarOpen.update(o => !o);
  }

  readonly activeTabInfo = computed(() => {
    switch (this.activeTab()) {
      case 'tablero':
        return { title: 'Tablero Ejecutivo', section: 'Dirección & Estrategia', icon: 'dashboard' };
      case 'tableros-departamento':
        return { title: 'Tableros por Proceso', section: 'Dirección & Estrategia', icon: 'corporate_fare' };
      case 'graficos-analitica':
        return { title: 'Gráficos & Analítica Avanzada', section: 'Dirección & Estrategia', icon: 'analytics' };
      case 'matriz-riesgos':
        return { title: 'Matriz de Riesgos Operacionales', section: 'Gestión de Riesgo', icon: 'grid_view' };
      case 'controles':
        return { title: 'Controles Internos y Evidencias', section: 'Gestión de Riesgo', icon: 'verified_user' };
      case 'incidentes-perdidas':
      case 'falencias':
        return { title: 'Incidentes y Eventos de Pérdida', section: 'Gestión de Riesgo', icon: 'report_problem' };
      case 'reportes-regulatorios':
        return { title: 'Reporte CMF / ANCI', section: 'Gestión de Riesgo', icon: 'gavel' };
      case 'proveedores':
        return { title: 'Proveedores y Externalización', section: 'Resiliencia & Terceros', icon: 'handshake' };
      case 'continuidad':
        return { title: 'Continuidad del Negocio', section: 'Resiliencia & Terceros', icon: 'restart_alt' };
      case 'seguridad-informacion':
        return { title: 'Seguridad de la Información', section: 'Resiliencia & Terceros', icon: 'security' };
      case 'apr-operacional':
        return { title: 'APR por Riesgo Operacional', section: 'Gobernanza & Cumplimiento', icon: 'account_balance' };
      case 'alertas-kri':
        return { title: 'Alertas & KRIs en Tiempo Real', section: 'Supervisión & Auditoría', icon: 'notification_important' };
      case 'auditorias':
        return { title: 'Auditorías Periódicas', section: 'Supervisión & Auditoría', icon: 'fact_check' };
      case 'bitacora':
        return { title: 'Bitácora Inalterable (Ledger)', section: 'Supervisión & Auditoría', icon: 'lock' };
      case 'reportes-pdf':
        return { title: 'Centro de Reportes & PDF', section: 'Gobernanza & Cumplimiento', icon: 'picture_as_pdf' };
      case 'cumplimiento-ran':
        return { title: 'Cumplimiento Normativo', section: 'Gobernanza & Cumplimiento', icon: 'policy' };
      case 'autoevaluaciones':
        return { title: 'Autoevaluaciones', section: 'Gestión de Riesgo', icon: 'fact_check' };
      case 'planes-accion':
        return { title: 'Planes de Acción', section: 'Incidentes & Seguimiento', icon: 'assignment_turned_in' };
      case 'mantenedores':
        return { title: 'Mantenedores', section: 'Configuración', icon: 'tune' };
    }
  });

  onRoleChange(event: Event) {
    const roleId = (event.target as HTMLSelectElement).value;
    const profile = this.riskService.availableProfiles.find(p => p.id === roleId);
    if (profile) {
      this.riskService.switchProfile(profile.id);
      this.showToast(`Sesión cambiada a: ${profile.name} (${profile.role})`);
    }
  }

  // Modals state
  readonly isRiskModalOpen = signal<boolean>(false);
  readonly isImportRisksOpen = signal<boolean>(false);
  readonly editingRisk = signal<Risk | null>(null);

  readonly isFlawModalOpen = signal<boolean>(false);
  readonly editingFlaw = signal<OperationalFlaw | null>(null);

  readonly isControlModalOpen = signal<boolean>(false);
  readonly editingControl = signal<Control | null>(null);

  readonly isReportModalOpen = signal<boolean>(false);

  readonly isKriThresholdModalOpen = signal<boolean>(false);
  readonly isRolesModalOpen = signal<boolean>(false);
  readonly isAlertSettingsModalOpen = signal<boolean>(false);
  readonly configuringKri = signal<KriDefinition | null>(null);

  openAlertSettings(kri?: KriDefinition) {
    if (!this.riskService.requirePermission(['canConfigureKRIs'], 'configurar notificaciones de KRIs')) return;
    this.configuringKri.set(kri || null);
    this.isAlertSettingsModalOpen.set(true);
  }

  closeAlertSettings() {
    this.isAlertSettingsModalOpen.set(false);
    this.configuringKri.set(null);
  }

  // Filter for incidents
  readonly incidentTypeFilter = signal<string>('todos');

  // Vista del módulo de incidentes: tarjetas o tabla de base de pérdidas
  readonly incidentView = signal<'tarjetas' | 'base-perdidas'>('tarjetas');

  // Filtered incidents computed
  readonly filteredIncidents = computed(() => {
    const filter = this.incidentTypeFilter();
    const list = this.riskService.flaws();
    if (filter === 'todos') return list;
    return list.filter(item => item.incidentType === filter);
  });

  // Distribución de incidentes por categoría Basilea (tablero ejecutivo)
  readonly incidentsByCategory = computed(() => {
    const colors: Record<string, string> = {
      'Fallas Tecnológicas': 'bg-indigo-600', 'Fraude Interno': 'bg-rose-600', 'Fraude Externo': 'bg-rose-400',
      'Ejecución y Procesos': 'bg-amber-500', 'Cumplimiento Normativo': 'bg-emerald-600',
      'Prácticas Laborales': 'bg-sky-500', 'Daño a Activos Físicos': 'bg-slate-500',
    };
    const counts = new Map<string, number>();
    for (const f of this.riskService.flaws()) {
      const cat = f.baselCategory || f.aiSuggestedCategory || 'Sin clasificar';
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    const total = this.riskService.flaws().length;
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count, pct: total ? Math.round((count / total) * 100) : 0, color: colors[category] ?? 'bg-slate-400' }));
  });

  // Expanded risk row in register
  readonly expandedRiskId = signal<string | null>(null);

  // Verification state for immutable audit ledger
  readonly integrityStatus = signal<{
    verified: boolean;
    valid?: boolean;
    totalBlocks?: number;
    verifying?: boolean;
  }>({ verified: false });

  // Notification toast
  readonly toastMessage = signal<string | null>(null);

  showToast(message: string) {
    this.toastMessage.set(message);
    setTimeout(() => {
      this.toastMessage.set(null);
    }, 4000);
  }

  // Highlighted risk id for visual confirmation when navigating from heatmap
  readonly highlightedRiskId = signal<string | null>(null);

  setTab(tab: ActiveTab) {
    this.activeTab.set(tab);
  }

  /** Código y nombre de un control por su id (para el inventario de riesgos). */
  controlCode(id: string): string {
    return this.riskService.controls().find(c => c.id === id)?.code ?? id;
  }

  controlName(id: string): string {
    return this.riskService.controls().find(c => c.id === id)?.name ?? 'Control eliminado';
  }

  /** Navega a un módulo desde la matriz de cumplimiento (ignora pestañas desconocidas). */
  openModule(tab: string) {
    this.setTab(tab as ActiveTab);
  }

  readonly selectedDepartmentForPdf = signal<string>('TODOS');

  openDepartmentPdf(processName: string) {
    this.selectedDepartmentForPdf.set(processName);
    this.activeTab.set('reportes-pdf');
    this.showToast(`Informe departamental para ${processName} preparado.`);
  }

  // Navigate directly to a specific risk from the 4×4 Heatmap Matrix
  navigateToRisk(risk: Risk) {
    this.activeTab.set('matriz-riesgos');
    this.riskService.riskSearchTerm.set('');
    this.riskService.filterProcess.set('TODOS');
    this.riskService.filterCategory.set('TODAS');
    this.riskService.filterLevel.set('TODOS');
    this.riskService.matrixSelectedCell.set(null);

    this.expandedRiskId.set(risk.id);
    this.highlightedRiskId.set(risk.id);

    setTimeout(() => {
      if (typeof document !== 'undefined') {
        const el = document.getElementById('risk-row-' + risk.id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 150);

    this.showToast(`Navegando al riesgo ${risk.code}: ${risk.title.slice(0, 40)}...`);

    setTimeout(() => {
      if (this.highlightedRiskId() === risk.id) {
        this.highlightedRiskId.set(null);
      }
    }, 5000);
  }

  // Open Create Risk Modal
  openCreateRisk() {
    if (!this.riskService.requirePermission(['canEditRisks'], 'crear riesgos')) return;
    this.editingRisk.set(null);
    this.isRiskModalOpen.set(true);
  }

  // Importación de matriz desde Excel/CSV
  openImportRisks() {
    if (!this.riskService.requirePermission(['canEditRisks'], 'importar riesgos')) return;
    this.isImportRisksOpen.set(true);
  }

  onRisksImported(r: { created: number; updated: number; skipped: number }) {
    this.isImportRisksOpen.set(false);
    this.showToast(`Matriz importada: ${r.created} riesgos nuevos, ${r.updated} actualizados${r.skipped ? `, ${r.skipped} omitidos` : ''}.`);
  }

  // Open Edit Risk Modal
  openEditRisk(risk: Risk) {
    this.editingRisk.set(risk);
    this.isRiskModalOpen.set(true);
  }

  // Open Create Control Modal
  openCreateControl() {
    if (!this.riskService.requirePermission(['canEditRisks', 'canEvaluateControls'], 'crear controles')) return;
    this.editingControl.set(null);
    this.isControlModalOpen.set(true);
  }

  // Open Edit Control Modal
  openEditControl(control: Control) {
    this.editingControl.set(control);
    this.isControlModalOpen.set(true);
  }

  // Open modal to report a new incident or loss event
  openCreateFlaw() {
    if (!this.riskService.requirePermission(['canReportFlaws'], 'registrar incidencias')) return;
    this.editingFlaw.set(null);
    this.isFlawModalOpen.set(true);
  }

  // Open modal to edit/update an incident or loss event
  openEditFlaw(flaw: OperationalFlaw) {
    this.editingFlaw.set(flaw);
    this.isFlawModalOpen.set(true);
  }

  // Toggle risk row expansion
  toggleExpandRisk(riskId: string) {
    const current = this.expandedRiskId();
    this.expandedRiskId.set(current === riskId ? null : riskId);
  }

  // Convert incident/flaw from incidents tab
  async convertFlawDirectly(flaw: OperationalFlaw) {
    try {
      const created = await this.riskService.convertFlawToRisk(flaw.id);
      this.showToast(`Incidencia convertida exitosamente en el riesgo operacional ${created.code}`);
      this.setTab('matriz-riesgos');
    } catch (err) {
      if (!(err instanceof PermissionDeniedError)) this.showToast('Error convirtiendo incidencia a riesgo');
    }
  }

  // Simulate an anomaly alert in real time
  async simulateRealTimeAnomaly() {
    if (!this.riskService.requirePermission(['canConfigureKRIs'], 'probar disparos de alertas KRI')) return;
    const examples = [
      {
        title: 'Desvío de KRI: Tasa inusual de transacciones rechazadas en switch bancario (> 15%)',
        process: 'Operaciones de Pago',
        kriMetric: 'Tasa de Rechazos en Switch',
        threshold: '<= 3.0%',
        currentValue: '17.8%',
        severity: 'Crítico' as const,
        description: 'Pico anómalo detectado por el motor de transacciones. 84 operaciones declinadas en 10 minutos.'
      },
      {
        title: 'Anomalía de Ciberseguridad: 42 intentos de fuerza bruta en servicio SSO',
        process: 'Ciberseguridad & TI',
        kriMetric: 'Tasa de Reintentos Fallidos SSO',
        threshold: '<= 5 / min',
        currentValue: '42 / min',
        severity: 'Alto' as const,
        description: 'Dirección IP externa intentando acceso con diccionario de contraseñas contra portal corporativo.'
      },
      {
        title: `Falla operativa: desfase de conciliación superior a ${this.riskService.catalog.formatMoney(this.riskService.currencyCode() === 'CLP' ? 70_000_000 : 75_000)} en caja corresponsal`,
        process: 'Tesorería',
        kriMetric: 'Descuadre Diario No Conciliado',
        threshold: `<= ${this.riskService.catalog.formatMoney(this.riskService.currencyCode() === 'CLP' ? 5_000_000 : 5_000)}`,
        currentValue: this.riskService.catalog.formatMoney(this.riskService.currencyCode() === 'CLP' ? 74_500_000 : 78_420),
        severity: 'Crítico' as const,
        description: 'La conciliación automática nocturna identificó tres lotes pendientes de liquidación sin acuse de recibo.'
      }
    ];

    const raw = examples[Math.floor(Math.random() * examples.length)];
    // La alerta de prueba se asigna al proceso equivalente del mantenedor.
    const pick = { ...raw, process: this.riskService.closestProcess(raw.process) };
    const alert = await this.riskService.triggerAlert(pick);
    this.showToast(`¡Alerta generada en tiempo real! ${alert.code} registrada en la bitácora inalterable.`);
    this.setTab('alertas-kri');
  }

  // Verify Audit Trail Integrity
  async verifyChainIntegrity() {
    this.integrityStatus.set({ verified: false, verifying: true });
    const result = await this.riskService.verifyAuditTrailIntegrity();
    setTimeout(() => {
      this.integrityStatus.set({
        verified: true,
        valid: result.isValid,
        totalBlocks: result.totalBlocks,
        verifying: false
      });
      this.showToast(result.isValid
        ? `Integridad criptográfica verificada: ${result.totalBlocks} bloques inalterables válidos.`
        : '¡Alerta de inconsistencia en la cadena de bloques!'
      );
    }, 600);
  }

  // Helper for level badge colors
  levelBadgeClass(level: string): string {
    switch (level) {
      case 'Crítico': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alto': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Medio': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Bajo':
      default: return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
  }

  severityBadgeClass(severity: string): string {
    switch (severity) {
      case 'Crítica':
      case 'Crítico': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'Alta':
      case 'Alto': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'Media':
      case 'Medio': return 'bg-amber-100 text-amber-800 border-amber-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  }

  getControlById(id: string): Control | undefined {
    return this.riskService.controls().find(c => c.id === id);
  }

  controlTypeBadgeClass(type: string): string {
    switch (type) {
      case 'Preventivo': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Detectivo': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'Correctivo': return 'bg-purple-50 text-purple-700 border-purple-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  }
}
