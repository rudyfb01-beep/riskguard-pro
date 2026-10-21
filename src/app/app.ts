import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from './services/risk-data.service';
import { TopBar } from './components/top-bar';
import { ExecutiveKpis } from './components/executive-kpis';
import { HeatmapMatrix } from './components/heatmap-matrix';
import { RiskModal } from './components/risk-modal';
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
import { Control, KriDefinition, OperationalFlaw, Risk } from './models/risk.model';

export type ActiveTab =
  | 'tablero'
  | 'tableros-departamento'
  | 'graficos-analitica'
  | 'matriz-riesgos'
  | 'controles'
  | 'incidentes-perdidas'
  | 'falencias'
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
    FlawModal,
    ControlModal,
    ExecutiveReportModal,
    KriThresholdModal,
    RolesManagementModal,
    AlertSettingsModal,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly riskService = inject(RiskDataService);

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
        return { title: 'Tableros por Departamento', section: 'Dirección & Estrategia', icon: 'corporate_fare' };
      case 'graficos-analitica':
        return { title: 'Gráficos & Analítica Avanzada', section: 'Dirección & Estrategia', icon: 'analytics' };
      case 'matriz-riesgos':
        return { title: 'Matriz de Riesgos Operacionales', section: 'Gestión de Riesgo', icon: 'grid_view' };
      case 'controles':
        return { title: 'Controles Internos y Evidencias', section: 'Gestión de Riesgo', icon: 'verified_user' };
      case 'incidentes-perdidas':
      case 'falencias':
        return { title: 'Incidentes y Eventos de Pérdida', section: 'Gestión de Riesgo', icon: 'report_problem' };
      case 'alertas-kri':
        return { title: 'Alertas & KRIs en Tiempo Real', section: 'Supervisión & Auditoría', icon: 'notification_important' };
      case 'auditorias':
        return { title: 'Auditorías Periódicas', section: 'Supervisión & Auditoría', icon: 'fact_check' };
      case 'bitacora':
        return { title: 'Bitácora Inalterable (Ledger)', section: 'Supervisión & Auditoría', icon: 'lock' };
      case 'reportes-pdf':
        return { title: 'Centro de Reportes & PDF', section: 'Gobernanza & Cumplimiento', icon: 'picture_as_pdf' };
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
    this.configuringKri.set(kri || null);
    this.isAlertSettingsModalOpen.set(true);
  }

  closeAlertSettings() {
    this.isAlertSettingsModalOpen.set(false);
    this.configuringKri.set(null);
  }

  // Filter for incidents
  readonly incidentTypeFilter = signal<string>('todos');

  // Filtered incidents computed
  readonly filteredIncidents = computed(() => {
    const filter = this.incidentTypeFilter();
    const list = this.riskService.flaws();
    if (filter === 'todos') return list;
    return list.filter(item => item.incidentType === filter);
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

  readonly selectedDepartmentForPdf = signal<string>('TODOS');

  openDepartmentPdf(processName: string) {
    this.selectedDepartmentForPdf.set(processName);
    this.activeTab.set('reportes-pdf');
    this.showToast(`Informe departamental para ${processName} preparado.`);
  }

  // Navigate directly to a specific risk from the 4x4 Heatmap Matrix
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
    this.editingRisk.set(null);
    this.isRiskModalOpen.set(true);
  }

  // Open Edit Risk Modal
  openEditRisk(risk: Risk) {
    this.editingRisk.set(risk);
    this.isRiskModalOpen.set(true);
  }

  // Open Create Control Modal
  openCreateControl() {
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
    } catch {
      this.showToast('Error convirtiendo incidencia a riesgo');
    }
  }

  // Simulate an anomaly alert in real time
  async simulateRealTimeAnomaly() {
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
        title: 'Falla Operativa: Desfase de conciliación superior a $75,000 USD en caja corresponsal',
        process: 'Tesorería',
        kriMetric: 'Descuadre Diario No Conciliado',
        threshold: '<= $5,000 USD',
        currentValue: '$78,420 USD',
        severity: 'Crítico' as const,
        description: 'La conciliación automática nocturna identificó tres lotes pendientes de liquidación sin acuse de recibo.'
      }
    ];

    const pick = examples[Math.floor(Math.random() * examples.length)];
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
