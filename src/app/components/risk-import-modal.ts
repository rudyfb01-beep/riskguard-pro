import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { CatalogService } from '../services/catalog.service';
import { CatalogAdminService } from '../services/catalog-admin.service';
import { MoneyPipe } from '../utils/money.pipe';
import {
  ColumnMap, IMPORT_FIELDS, ImportField, ImportRow, SheetRows, SourceScale,
  buildRows, detectScale, findHeaderRow, guessColumns, norm, parseCsv, templateCsv,
} from '../utils/risk-import';

interface LoadedSheet { name: string; rows: SheetRows }
type RowFilter = 'all' | 'warnings' | 'errors';

const colLetter = (i: number): string => {
  let s = '', n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

@Component({
  selector: 'app-risk-import-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatIconModule, MoneyPipe],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
      <div class="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden my-4">

        <div class="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
              <mat-icon class="text-emerald-600">upload_file</mat-icon>
              <span>Importar matriz de riesgos desde Excel</span>
            </h2>
            <p class="text-xs text-slate-500 mt-0.5">Archivos .xlsx o .csv · revisa la asociación de columnas y la vista previa antes de importar</p>
          </div>
          <button type="button" (click)="closeModal.emit()" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/50" aria-label="Cerrar">
            <mat-icon class="text-lg">close</mat-icon>
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">

          <!-- 1. Archivo -->
          <section class="flex flex-col md:flex-row gap-4 md:items-center">
            <label
              class="flex-1 flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-4 cursor-pointer transition-colors"
              [class.border-emerald-400]="dragging()" [class.bg-emerald-50]="dragging()" [class.border-slate-300]="!dragging()"
              (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
              <mat-icon class="text-slate-400">description</mat-icon>
              <span class="text-xs text-slate-600">
                @if (fileName()) {
                  <strong class="text-slate-900">{{ fileName() }}</strong> · haz clic o arrastra otro archivo para cambiarlo
                } @else {
                  <strong class="text-slate-900">Selecciona o arrastra tu matriz</strong> (.xlsx o .csv)
                }
              </span>
              <input type="file" accept=".xlsx,.csv,.txt" class="hidden" (change)="onFile($event)" />
            </label>
            <button type="button" (click)="downloadTemplate()" class="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 self-start md:self-auto">
              <mat-icon class="text-sm">download</mat-icon> Descargar plantilla
            </button>
          </section>

          @if (loading()) {
            <p class="text-xs text-slate-500 flex items-center gap-2"><mat-icon class="text-sm animate-spin">progress_activity</mat-icon> Leyendo el archivo…</p>
          }
          @if (error()) {
            <div class="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{{ error() }}</div>
          }

          @if (sheet(); as sh) {
            <!-- 2. Hoja, encabezado y escala -->
            <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
              @if (sheets().length > 1) {
                <label class="text-xs">
                  <span class="block font-semibold text-slate-700 mb-1">Hoja</span>
                  <select class="w-full rounded-lg border border-slate-300 px-2 py-1.5" [ngModel]="sheetIdx()" (ngModelChange)="selectSheet(+$event)">
                    @for (s of sheets(); track $index) { <option [value]="$index">{{ s.name }}</option> }
                  </select>
                </label>
              }
              <label class="text-xs">
                <span class="block font-semibold text-slate-700 mb-1">Fila de encabezados</span>
                <input type="number" min="1" [max]="sh.rows.length" class="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                  [ngModel]="headerRow() + 1" (ngModelChange)="setHeaderRow(+$event - 1)" />
              </label>
              <label class="text-xs">
                <span class="block font-semibold text-slate-700 mb-1">Escala de tu matriz</span>
                <select class="w-full rounded-lg border border-slate-300 px-2 py-1.5" [ngModel]="scale()" (ngModelChange)="setScale(+$event)">
                  @for (s of scales; track s) { <option [value]="s">1 a {{ s }}{{ s === 4 ? ' (igual a la aplicación)' : ' → se convierte a 1–4' }}</option> }
                </select>
              </label>
              <label class="text-xs">
                <span class="block font-semibold text-slate-700 mb-1">Códigos que ya existen</span>
                <select class="w-full rounded-lg border border-slate-300 px-2 py-1.5" [ngModel]="updateExisting()" (ngModelChange)="updateExisting.set($event === true || $event === 'true')">
                  <option [value]="true">Actualizar el riesgo existente</option>
                  <option [value]="false">Omitirlos</option>
                </select>
              </label>
              <label class="text-xs md:col-span-2">
                <span class="block font-semibold text-slate-700 mb-1">Procesos que no están en el mantenedor</span>
                <select class="w-full rounded-lg border border-slate-300 px-2 py-1.5" [ngModel]="createProcesses()" (ngModelChange)="createProcesses.set($event === true || $event === 'true')" [disabled]="!canCreateProcesses()">
                  <option [value]="false">Asociar al proceso más parecido</option>
                  <option [value]="true">Crearlos en el mantenedor</option>
                </select>
                @if (!canCreateProcesses()) { <span class="block text-[10px] text-slate-400 mt-0.5">Crear procesos requiere el permiso de administrar mantenedores.</span> }
              </label>
            </section>

            <!-- 3. Columnas -->
            <section>
              <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Columnas</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                @for (f of fields; track f.key) {
                  <label class="text-xs border rounded-lg px-2.5 py-2" [class.border-rose-300]="f.required && map()[f.key] === undefined" [class.border-slate-200]="!(f.required && map()[f.key] === undefined)" [title]="f.hint">
                    <span class="block font-semibold text-slate-700 mb-1">{{ f.label }}{{ f.required ? ' *' : '' }}</span>
                    <select class="w-full rounded border border-slate-300 px-1.5 py-1 text-[11px]" [ngModel]="map()[f.key] ?? -1" (ngModelChange)="setColumn(f.key, +$event)">
                      <option [value]="-1">— No importar —</option>
                      @for (c of columns(); track c.index) { <option [value]="c.index">{{ c.label }}</option> }
                    </select>
                  </label>
                }
              </div>
            </section>

            <!-- 4. Vista previa -->
            <section>
              <div class="flex flex-wrap items-center gap-2 mb-2">
                <h3 class="text-xs font-bold text-slate-700 uppercase tracking-wider mr-2">Vista previa</h3>
                <button type="button" (click)="filter.set('all')" class="px-2 py-0.5 rounded-full text-[11px] border" [class]="filter() === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'">{{ rows().length }} filas</button>
                <span class="px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-200">{{ summary().create }} nuevos</span>
                <span class="px-2 py-0.5 rounded-full text-[11px] bg-sky-50 text-sky-800 border border-sky-200">{{ summary().update }} {{ updateExisting() ? 'se actualizan' : 'ya existen (se omiten)' }}</span>
                <button type="button" (click)="filter.set('warnings')" class="px-2 py-0.5 rounded-full text-[11px] border" [class]="filter() === 'warnings' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-200'">{{ summary().warnings }} con observaciones</button>
                <button type="button" (click)="filter.set('errors')" class="px-2 py-0.5 rounded-full text-[11px] border" [class]="filter() === 'errors' ? 'bg-rose-600 text-white border-rose-600' : 'bg-rose-50 text-rose-800 border-rose-200'">{{ summary().errors }} con errores (no se importan)</button>
                @if (summary().newProcesses.length) {
                  <span class="px-2 py-0.5 rounded-full text-[11px] bg-violet-50 text-violet-800 border border-violet-200" [title]="summary().newProcesses.join(', ')">{{ summary().newProcesses.length }} procesos nuevos</span>
                }
              </div>
              @if (missingRequired().length) {
                <div class="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">Falta asociar: {{ missingRequired().join(', ') }}.</div>
              }
              <div class="border border-slate-200 rounded-lg overflow-auto max-h-[40vh]">
                <table class="w-full text-[11px]">
                  <thead class="bg-slate-50 text-slate-500 sticky top-0">
                    <tr class="text-left">
                      <th class="px-2 py-1.5">Fila</th><th class="px-2 py-1.5">Código</th><th class="px-2 py-1.5">Riesgo</th><th class="px-2 py-1.5">Proceso</th>
                      <th class="px-2 py-1.5">Categoría</th><th class="px-2 py-1.5 text-center">P×I</th><th class="px-2 py-1.5">Nivel</th>
                      <th class="px-2 py-1.5 text-right">Exposición</th><th class="px-2 py-1.5 text-center">Ctrl.</th><th class="px-2 py-1.5">Observaciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of visibleRows(); track r.rowNumber) {
                      <tr class="border-t border-slate-100 align-top" [class.bg-rose-50]="r.errors.length">
                        <td class="px-2 py-1.5 text-slate-400 font-mono">{{ r.rowNumber }}</td>
                        <td class="px-2 py-1.5 font-mono whitespace-nowrap">
                          {{ r.code || '(nuevo)' }}
                          @if (exists(r)) { <span class="ml-1 px-1 rounded bg-sky-100 text-sky-800 text-[10px]">{{ updateExisting() ? 'actualiza' : 'omite' }}</span> }
                        </td>
                        <td class="px-2 py-1.5 text-slate-900 min-w-[160px]">{{ r.title }}</td>
                        <td class="px-2 py-1.5 min-w-[110px]">{{ r.process }} @if (r.newProcess) { <span class="px-1 rounded bg-violet-100 text-violet-800 text-[10px]">nuevo</span> }</td>
                        <td class="px-2 py-1.5 min-w-[100px]">{{ r.category }}</td>
                        <td class="px-2 py-1.5 text-center font-mono">{{ r.errors.length && !(r.likelihood && r.impact) ? '—' : r.likelihood + '×' + r.impact }}</td>
                        <td class="px-2 py-1.5">
                          @if (r.likelihood && r.impact) { <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" [class]="levelClass(r)">{{ level(r) }}</span> }
                        </td>
                        <td class="px-2 py-1.5 text-right font-mono whitespace-nowrap">{{ r.exposure | money }}</td>
                        <td class="px-2 py-1.5 text-center">{{ r.controlIds.length || '' }}</td>
                        <td class="px-2 py-1.5 min-w-[200px] max-w-[320px]">
                          @for (e of r.errors; track $index) { <div class="text-rose-700">✕ {{ e }}</div> }
                          @for (w of r.warnings; track $index) { <div class="text-amber-700">• {{ w }}</div> }
                        </td>
                      </tr>
                    } @empty {
                      <tr><td colspan="10" class="px-3 py-6 text-center text-slate-400">No hay filas para mostrar.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (filteredRows().length > visibleRows().length) {
                <p class="text-[11px] text-slate-400 mt-1">Se muestran las primeras {{ visibleRows().length }} de {{ filteredRows().length }} filas; se importan todas.</p>
              }
              <p class="text-[11px] text-slate-500 mt-2">
                El riesgo residual se calcula con los controles vinculados, igual que en el resto de la aplicación.
                Los riesgos nuevos quedan con un plan de mitigación "No iniciado" para completar después.
              </p>
            </section>
          }
        </div>

        <div class="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button type="button" (click)="closeModal.emit()" class="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">Cancelar</button>
          <button type="button" (click)="importNow()" [disabled]="!importable() || importing()"
            class="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
            <mat-icon class="text-sm">{{ importing() ? 'hourglass_top' : 'upload' }}</mat-icon>
            {{ importing() ? 'Importando…' : 'Importar ' + importable() + ' riesgo' + (importable() === 1 ? '' : 's') }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class RiskImportModal {
  private readonly rs = inject(RiskDataService);
  private readonly catalog = inject(CatalogService);
  private readonly catalogAdmin = inject(CatalogAdminService);

  readonly closeModal = output<void>();
  readonly imported = output<{ created: number; updated: number; skipped: number }>();

  readonly fields = IMPORT_FIELDS;
  readonly scales: SourceScale[] = [3, 4, 5, 6, 10];

  readonly fileName = signal('');
  readonly sheets = signal<LoadedSheet[]>([]);
  readonly sheetIdx = signal(0);
  readonly headerRow = signal(0);
  readonly map = signal<ColumnMap>({});
  readonly scale = signal<SourceScale>(4);
  readonly updateExisting = signal(true);
  readonly createProcesses = signal(false);
  readonly filter = signal<RowFilter>('all');
  readonly loading = signal(false);
  readonly importing = signal(false);
  readonly dragging = signal(false);
  readonly error = signal('');

  readonly sheet = computed(() => this.sheets()[this.sheetIdx()] ?? null);
  readonly canCreateProcesses = computed(() => this.rs.hasPermission('canManageCatalogs'));

  readonly columns = computed(() => {
    const sh = this.sheet();
    if (!sh) return [];
    const header = sh.rows[this.headerRow()] ?? [];
    const width = Math.max(header.length, ...sh.rows.slice(this.headerRow(), this.headerRow() + 50).map(r => r.length));
    return Array.from({ length: width }, (_, i) => {
      const h = String(header[i] ?? '').trim();
      return { index: i, label: `${colLetter(i)}${h ? ': ' + h.slice(0, 40) : ''}` };
    });
  });

  readonly rows = computed<ImportRow[]>(() => {
    const sh = this.sheet();
    if (!sh || this.missingRequired().length) return [];
    const processes = this.catalog.processNames();
    return buildRows(sh.rows, this.headerRow(), this.map(), {
      scale: this.scale(),
      processes,
      likelihoodNames: this.catalog.riskScale().likelihood.map(l => l.name),
      impactNames: this.catalog.riskScale().impact.map(l => l.name),
      controls: this.rs.controls().map(c => ({ id: c.id, code: c.code, name: c.name })),
      createMissingProcesses: this.createProcesses() && this.canCreateProcesses(),
      defaultProcess: processes[0] ?? 'Sin proceso',
    });
  });

  private readonly existingCodes = computed(() => new Set(this.rs.risks().map(r => r.code.toUpperCase())));
  exists(r: ImportRow): boolean { return !!r.code && this.existingCodes().has(r.code); }

  readonly summary = computed(() => {
    const rows = this.rows();
    const ok = rows.filter(r => !r.errors.length);
    const update = ok.filter(r => this.exists(r)).length;
    return {
      create: ok.length - update,
      update,
      warnings: rows.filter(r => r.warnings.length && !r.errors.length).length,
      errors: rows.length - ok.length,
      newProcesses: [...new Set(ok.filter(r => r.newProcess && !(this.exists(r) && !this.updateExisting())).map(r => r.process))],
    };
  });

  readonly importable = computed(() => this.summary().create + (this.updateExisting() ? this.summary().update : 0));

  readonly missingRequired = computed(() =>
    this.sheet() ? IMPORT_FIELDS.filter(f => f.required && this.map()[f.key] === undefined).map(f => f.label) : []);

  readonly filteredRows = computed(() => {
    const f = this.filter();
    const rows = this.rows();
    if (f === 'errors') return rows.filter(r => r.errors.length);
    if (f === 'warnings') return rows.filter(r => r.warnings.length && !r.errors.length);
    return rows;
  });
  readonly visibleRows = computed(() => this.filteredRows().slice(0, 300));

  level(r: ImportRow) { return this.rs.calculateRiskLevel(r.likelihood, r.impact); }
  levelClass(r: ImportRow): string {
    return { 'Bajo': 'bg-emerald-100 text-emerald-800', 'Medio': 'bg-amber-100 text-amber-800', 'Alto': 'bg-orange-100 text-orange-800', 'Crítico': 'bg-rose-100 text-rose-800' }[this.level(r)];
  }

  // ---------------------------------------------------------------------------
  // Lectura del archivo
  // ---------------------------------------------------------------------------

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.load(file);
    input.value = '';
  }

  onDrop(ev: DragEvent) {
    ev.preventDefault();
    this.dragging.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (file) void this.load(file);
  }

  private async load(file: File) {
    this.error.set('');
    this.loading.set(true);
    try {
      const name = file.name.toLowerCase();
      let sheets: LoadedSheet[];
      if (name.endsWith('.xls')) {
        throw new Error('El formato .xls (Excel 97-2003) no se puede leer. Ábrelo en Excel y guárdalo como .xlsx o .csv.');
      } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
        sheets = [{ name: file.name, rows: parseCsv(await this.readText(file)) }];
      } else if (name.endsWith('.xlsx')) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const all = await readXlsxFile(file);
        sheets = all.map(s => ({ name: s.sheet, rows: s.data as unknown as SheetRows }));
      } else {
        throw new Error('Formato no admitido. Usa un archivo .xlsx o .csv.');
      }
      sheets = sheets.filter(s => s.rows.some(r => r.some(c => c !== null && c !== '')));
      if (!sheets.length) throw new Error('El archivo no tiene datos.');

      // Hoja por defecto: la que tiene el encabezado más reconocible.
      const score = (s: LoadedSheet) => { const h = findHeaderRow(s.rows); return h < 0 ? 0 : Object.keys(guessColumns(s.rows[h])).length; };
      const best = sheets.reduce((bi, s, i) => (score(s) > score(sheets[bi]) ? i : bi), 0);
      this.fileName.set(file.name);
      this.sheets.set(sheets);
      this.selectSheet(best);
    } catch (err) {
      this.sheets.set([]);
      this.fileName.set(file.name);
      this.error.set((err as Error).message || 'No se pudo leer el archivo.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Excel guarda los CSV en UTF-8 o en Windows-1252 según la versión: se prueba UTF-8 y, si falla, Windows-1252. */
  private async readText(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    const utf8 = new TextDecoder('utf-8').decode(buf);
    return utf8.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : utf8;
  }

  selectSheet(i: number) {
    this.sheetIdx.set(i);
    const rows = this.sheets()[i]?.rows ?? [];
    this.setHeaderRow(Math.max(0, findHeaderRow(rows)));
  }

  setHeaderRow(i: number) {
    const rows = this.sheet()?.rows ?? [];
    const idx = Math.min(Math.max(0, i || 0), Math.max(0, rows.length - 1));
    this.headerRow.set(idx);
    const map = guessColumns(rows[idx] ?? []);
    this.map.set(map);
    this.scale.set(detectScale(rows.slice(idx + 1), [map.likelihood, map.impact]));
  }

  setScale(v: number) {
    if (this.scales.includes(v as SourceScale)) this.scale.set(v as SourceScale);
  }

  setColumn(field: ImportField, index: number) {
    const next: ColumnMap = { ...this.map() };
    // Una columna solo puede usarse para un campo.
    for (const k of Object.keys(next) as ImportField[]) if (next[k] === index && k !== field) delete next[k];
    if (index < 0) delete next[field]; else next[field] = index;
    this.map.set(next);
    if (field === 'likelihood' || field === 'impact') {
      this.scale.set(detectScale((this.sheet()?.rows ?? []).slice(this.headerRow() + 1), [next.likelihood, next.impact]));
    }
  }

  downloadTemplate() {
    const blob = new Blob([templateCsv(this.catalog.currency())], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Plantilla_matriz_riesgos_RiskGuard.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------------------------------------------------------------------
  // Importación
  // ---------------------------------------------------------------------------

  async importNow() {
    if (!this.importable() || this.importing()) return;
    this.importing.set(true);
    this.error.set('');
    try {
      // Procesos nuevos primero, para que los riesgos queden asociados al mantenedor.
      const existing = new Set(this.catalog.processes().map(p => norm(p.name)));
      for (const name of this.summary().newProcesses) {
        if (existing.has(norm(name))) continue;
        await this.catalogAdmin.saveProcess({
          id: this.catalogAdmin.newId('proc'), code: this.catalogAdmin.nextProcessCode(), name, owner: '',
          criticality: 'Medio', description: 'Creado al importar la matriz de riesgos.', active: true,
        });
        existing.add(norm(name));
      }
      const result = await this.rs.importRisks(this.rows(), {
        updateExisting: this.updateExisting(),
        hasExposure: this.map().exposure !== undefined,
        hasControls: this.map().controls !== undefined,
        fileName: this.fileName(),
      });
      this.imported.emit(result);
    } catch (err) {
      this.error.set((err as Error).message || 'No se pudo completar la importación.');
    } finally {
      this.importing.set(false);
    }
  }
}
