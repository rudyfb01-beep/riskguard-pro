import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { RiskDataService } from '../services/risk-data.service';
import { BulkImportService } from '../services/bulk-import.service';
import {
  BULK_SPECS, BulkAction, BulkColumnMap, BulkRow, BulkSpec, MAX_BULK_ROWS, buildBulkRows, bulkSummary, canBulkImport, findBulkHeader,
  guessBulkColumns, resultSheets, templateSheets,
} from '../utils/bulk-import';
import { Cell, SheetRows, parseCsv } from '../utils/risk-import';
import { buildXlsx, colName } from '../utils/xlsx-writer';

interface LoadedSheet { name: string; rows: SheetRows }
type RowFilter = 'all' | 'errors' | 'warnings' | BulkAction;

const ACTION_LABEL: Record<BulkAction, string> = { crear: 'Nuevo', actualizar: 'Actualiza', omitir: 'Se omite', error: 'Error' };
const ACTION_CLS: Record<BulkAction, string> = {
  crear: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  actualizar: 'bg-sky-50 text-sky-800 border-sky-200',
  omitir: 'bg-slate-100 text-slate-600 border-slate-200',
  error: 'bg-rose-50 text-rose-800 border-rose-200',
};

function download(name: string, data: Uint8Array) {
  const blob = new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

@Component({
  selector: 'app-bulk-import-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="space-y-5">
      <!-- Encabezado -->
      <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
        <div class="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><mat-icon>upload_file</mat-icon></div>
        <div class="flex-1 min-w-0">
          <h2 class="text-base font-bold text-slate-900">Carga masiva desde Excel</h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Descarga la plantilla del tipo de registro, complétala (o usa tu propia planilla) y súbela en .xlsx o .csv.
            Antes de guardar verás qué se crea, qué se actualiza y qué filas tienen errores. Todo se guarda de una vez y queda en la bitácora.
          </p>
        </div>
      </section>

      <!-- 1. Tipo -->
      <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <h3 class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">1. ¿Qué quieres cargar?</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          @for (s of allowedSpecs(); track s.entity) {
            <button type="button" (click)="choose(s)"
              [attr.data-entity]="s.entity"
              class="text-left rounded-xl border p-3 transition-colors flex gap-3 items-start disabled:opacity-50 disabled:cursor-not-allowed"
              [class]="spec()?.entity === s.entity ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'">
              <mat-icon class="text-slate-600 shrink-0">{{ s.icon }}</mat-icon>
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-slate-900">{{ s.label }}</span>
                <span class="block text-[11px] text-slate-500 leading-snug mt-0.5">{{ s.description }}</span>
              </span>
            </button>
          }
          @if (rs.canAny('canEditRisks')) {
          <button type="button" (click)="importRisks.emit()"
            class="text-left rounded-xl border border-dashed border-slate-300 p-3 hover:bg-slate-50 flex gap-3 items-start">
            <mat-icon class="text-slate-600 shrink-0">grid_view</mat-icon>
            <span>
              <span class="block text-sm font-semibold text-slate-900">Matriz de riesgos</span>
              <span class="block text-[11px] text-slate-500 leading-snug mt-0.5">Importador propio: convierte escalas de probabilidad e impacto y asocia controles.</span>
            </span>
          </button>
          }
          @if (rs.canAny('canManageCompliance', 'canManageRegulatoryReports')) {
          <button type="button" (click)="openModule.emit('cumplimiento-ran')"
            class="text-left rounded-xl border border-dashed border-slate-300 p-3 hover:bg-slate-50 flex gap-3 items-start">
            <mat-icon class="text-slate-600 shrink-0">policy</mat-icon>
            <span>
              <span class="block text-sm font-semibold text-slate-900">Requisitos normativos</span>
              <span class="block text-[11px] text-slate-500 leading-snug mt-0.5">Se importan desde cada norma en Cumplimiento Normativo.</span>
            </span>
          </button>
          }
        </div>
        @if (!allowedSpecs().length && !rs.canAny('canEditRisks', 'canManageCompliance', 'canManageRegulatoryReports')) {
          <p class="text-xs text-slate-500">Tu cargo no tiene permisos para cargar datos.</p>
        }
      </section>

      @if (spec(); as s) {
        <!-- 2. Archivo -->
        <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div class="flex flex-col md:flex-row md:items-center gap-3">
            <h3 class="text-xs font-bold uppercase tracking-wide text-slate-500 flex-1">2. Archivo de {{ s.label.toLowerCase() }}</h3>
            <button type="button" (click)="downloadTemplate()" class="px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 self-start">
              <mat-icon class="text-sm">download</mat-icon> Plantilla Excel (.xlsx)
            </button>
          </div>
          <label
            class="flex items-center gap-3 border-2 border-dashed rounded-xl px-4 py-5 cursor-pointer transition-colors"
            [class.border-emerald-400]="dragging()" [class.bg-emerald-50]="dragging()" [class.border-slate-300]="!dragging()"
            (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">
            <mat-icon class="text-slate-400">description</mat-icon>
            <span class="text-xs text-slate-600">
              @if (fileName()) {
                <strong class="text-slate-900">{{ fileName() }}</strong> · haz clic o arrastra otro archivo para cambiarlo
              } @else {
                <strong class="text-slate-900">Selecciona o arrastra el archivo</strong> (.xlsx o .csv, hasta {{ maxRows }} filas)
              }
            </span>
            <input type="file" accept=".xlsx,.csv,.txt" class="hidden" (change)="onFile($event)" data-testid="bulk-file" />
          </label>
          @if (s.matchBy.length) {
            <label class="flex items-center gap-2 text-xs text-slate-700">
              <input type="checkbox" [checked]="updateExisting()" (change)="setUpdate($any($event.target).checked)" />
              Actualizar los registros que ya existen (se reconocen por {{ matchLabel(s) }}; las celdas vacías conservan el valor actual)
            </label>
          }
          @if (loading()) {
            <p class="text-xs text-slate-500 flex items-center gap-2"><mat-icon class="text-sm animate-spin">progress_activity</mat-icon> Leyendo el archivo…</p>
          }
          @if (error()) {
            <div class="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">{{ error() }}</div>
          }
        </section>

        @if (sheet(); as sh) {
          <!-- 3. Columnas -->
          <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <h3 class="text-xs font-bold uppercase tracking-wide text-slate-500 flex-1">3. Columnas</h3>
              @if (sheets().length > 1) {
                <label class="text-xs flex items-center gap-2">Hoja
                  <select class="rounded-lg border border-slate-300 px-2 py-1" (change)="selectSheet(+$any($event.target).value)">
                    @for (x of sheets(); track $index) { <option [value]="$index" [selected]="$index === sheetIdx()">{{ x.name }}</option> }
                  </select>
                </label>
              }
              <span class="text-[11px] text-slate-500">Encabezado en la fila {{ headerIdx() + 1 }} · {{ mappedCount() }} de {{ s.fields.length }} columnas reconocidas</span>
              <button type="button" class="text-xs text-emerald-700 font-semibold hover:underline" (click)="showMap.set(!showMap())">{{ showMap() ? 'Ocultar' : 'Revisar asociación' }}</button>
            </div>
            @if (missingRequired().length) {
              <p class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Sin columna para: <strong>{{ missingRequired().join(', ') }}</strong>. Asócialas abajo o agrégalas al archivo.
              </p>
            }
            @if (showMap() || missingRequired().length) {
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                @for (f of s.fields; track f.key) {
                  <label class="text-xs flex items-center gap-2 border border-slate-200 rounded-lg px-2 py-1.5">
                    <span class="flex-1 min-w-0 truncate" [title]="f.hint ?? ''">{{ f.label }}@if (f.required || f.requiredOnCreate) {<span class="text-rose-600">*</span>}</span>
                    <select class="max-w-[55%] rounded border border-slate-300 px-1 py-0.5" [attr.aria-label]="'Columna para ' + f.label" (change)="setColumn(f.key, $any($event.target).value)">
                      <option value="" [selected]="map()[f.key] === undefined">— sin columna —</option>
                      @for (h of headerCells(); track $index) {
                        <option [value]="$index" [selected]="map()[f.key] === $index">{{ letter($index) }} · {{ h || '(vacía)' }}</option>
                      }
                    </select>
                  </label>
                }
              </div>
            }
          </section>

          <!-- 4. Vista previa -->
          <section class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-xs font-bold uppercase tracking-wide text-slate-500 mr-2">4. Vista previa</h3>
              @for (c of chips(); track c.id) {
                <button type="button" (click)="filter.set(c.id)" class="px-2.5 py-1 rounded-full border text-[11px] font-semibold"
                  [class]="filter() === c.id ? 'bg-slate-900 text-white border-slate-900' : c.cls">{{ c.label }}: {{ c.n }}</button>
              }
              <span class="flex-1"></span>
              <button type="button" (click)="downloadResult()" class="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5">
                <mat-icon class="text-sm">download</mat-icon> Resultado (.xlsx)
              </button>
            </div>
            <div class="overflow-x-auto border border-slate-200 rounded-xl">
              <table class="w-full text-xs">
                <thead class="bg-slate-50 text-slate-600">
                  <tr><th class="text-left px-3 py-2 w-14">Fila</th><th class="text-left px-3 py-2 w-28">Resultado</th><th class="text-left px-3 py-2">Registro</th><th class="text-left px-3 py-2">Observaciones</th></tr>
                </thead>
                <tbody>
                  @for (r of visibleRows(); track r.line) {
                    <tr class="border-t border-slate-100 align-top">
                      <td class="px-3 py-1.5 text-slate-500 tabular-nums">{{ r.line }}</td>
                      <td class="px-3 py-1.5"><span class="px-2 py-0.5 rounded-full border text-[11px] font-semibold" [class]="actionCls(r.action)">{{ actionLabel(r.action) }}</span></td>
                      <td class="px-3 py-1.5 text-slate-900">{{ r.label }}</td>
                      <td class="px-3 py-1.5">
                        @for (e of r.errors; track $index) { <div class="text-rose-700">{{ e }}</div> }
                        @for (w of r.warnings; track $index) { <div class="text-amber-700">{{ w }}</div> }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="px-3 py-6 text-center text-slate-500">No hay filas para mostrar.</td></tr>
                  }
                </tbody>
              </table>
            </div>
            @if (filteredRows().length > visibleRows().length) {
              <p class="text-[11px] text-slate-500">Se muestran {{ visibleRows().length }} de {{ filteredRows().length }} filas. Descarga el resultado para verlas todas.</p>
            }
            @if (tooMany()) {
              <p class="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">El archivo tiene más de {{ maxRows }} filas. Divídelo en varias cargas.</p>
            }

            @if (importError()) {
              <div class="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">No se guardó nada: {{ importError() }}</div>
            }
            <div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-slate-100">
              <p class="text-xs text-slate-600 flex-1">
                @if (summary().error) { {{ summary().error === 1 ? 'La fila con errores no se cargará' : 'Las ' + summary().error + ' filas con errores no se cargarán' }}: corrígelas en el archivo y vuelve a subirlo, o continúa sin ellas. }
                @else { Todas las filas están listas. }
              </p>
              <button type="button" (click)="import()" [disabled]="!toSave() || importing() || tooMany()"
                class="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5 justify-center">
                <mat-icon class="text-sm">{{ importing() ? 'progress_activity' : 'cloud_upload' }}</mat-icon>
                {{ importing() ? 'Guardando…' : 'Cargar ' + toSave() + ' registro(s)' }}
              </button>
            </div>
          </section>
        }

        @if (done(); as d) {
          <section class="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3" role="status">
            <mat-icon class="text-emerald-700">task_alt</mat-icon>
            <div class="flex-1 text-sm text-emerald-900">
              <strong>Carga completada:</strong> {{ d.created }} {{ s.label.toLowerCase() }} nuevos y {{ d.updated }} actualizados desde {{ d.file }}.
            </div>
            <button type="button" (click)="reset()" class="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100">Cargar otro archivo</button>
          </section>
        }
      }
    </div>
  `,
})
export class BulkImportPanel {
  readonly rs = inject(RiskDataService);
  private readonly bulk = inject(BulkImportService);

  readonly notify = output<string>();
  readonly importRisks = output<void>();
  readonly openModule = output<string>();

  readonly specs = BULK_SPECS;
  /** Solo los tipos que el cargo puede cargar. */
  readonly allowedSpecs = computed(() => BULK_SPECS.filter(s => canBulkImport(s, this.rs.currentProfile().permissions)));
  readonly maxRows = MAX_BULK_ROWS;

  readonly spec = signal<BulkSpec | null>(null);
  readonly sheets = signal<LoadedSheet[]>([]);
  readonly sheetIdx = signal(0);
  readonly headerIdx = signal(0);
  readonly map = signal<BulkColumnMap>({});
  readonly updateExisting = signal(true);
  readonly fileName = signal('');
  readonly loading = signal(false);
  readonly importing = signal(false);
  readonly dragging = signal(false);
  readonly error = signal('');
  readonly importError = signal('');
  readonly showMap = signal(false);
  readonly filter = signal<RowFilter>('all');
  readonly done = signal<{ created: number; updated: number; file: string } | null>(null);
  /** Cambia tras cada carga para recalcular la vista previa con los datos nuevos. */
  private readonly version = signal(0);

  readonly sheet = computed(() => this.sheets()[this.sheetIdx()] ?? null);
  readonly headerCells = computed(() => (this.sheet()?.rows[this.headerIdx()] ?? []).map(c => String(c ?? '').trim()));
  readonly mappedCount = computed(() => Object.values(this.map()).filter(v => v !== undefined).length);
  readonly missingRequired = computed(() => (this.spec()?.fields ?? []).filter(f => (f.required || f.requiredOnCreate) && this.map()[f.key] === undefined).map(f => f.label));

  readonly rows = computed<BulkRow[]>(() => {
    const s = this.spec(), sh = this.sheet();
    this.version();
    if (!s || !sh) return [];
    return buildBulkRows(s, sh.rows, this.headerIdx(), this.map(), this.bulk.context(s, this.updateExisting()));
  });
  readonly summary = computed(() => bulkSummary(this.rows()));
  readonly toSave = computed(() => this.summary().crear + this.summary().actualizar);
  readonly tooMany = computed(() => this.rows().length > MAX_BULK_ROWS);
  readonly filteredRows = computed(() => {
    const f = this.filter();
    return this.rows().filter(r => f === 'all' || (f === 'errors' ? r.action === 'error' : f === 'warnings' ? r.warnings.length > 0 && r.action !== 'omitir' : r.action === f));
  });
  readonly visibleRows = computed(() => this.filteredRows().slice(0, 300));
  readonly chips = computed(() => {
    const s = this.summary();
    return [
      { id: 'all' as RowFilter, label: 'Filas', n: s.total, cls: 'bg-white text-slate-700 border-slate-300' },
      { id: 'crear' as RowFilter, label: 'Nuevos', n: s.crear, cls: ACTION_CLS.crear },
      { id: 'actualizar' as RowFilter, label: 'Actualizan', n: s.actualizar, cls: ACTION_CLS.actualizar },
      { id: 'omitir' as RowFilter, label: 'Omitidos', n: s.omitir, cls: ACTION_CLS.omitir },
      { id: 'errors' as RowFilter, label: 'Con errores', n: s.error, cls: ACTION_CLS.error },
      { id: 'warnings' as RowFilter, label: 'Con avisos', n: this.rows().filter(r => r.warnings.length && r.action !== 'omitir').length, cls: 'bg-amber-50 text-amber-800 border-amber-200' },
    ].filter(c => c.id === 'all' || c.n > 0);
  });

  can(s: BulkSpec) { return canBulkImport(s, this.rs.currentProfile().permissions); }
  letter(i: number) { return colName(i); }
  actionLabel(a: BulkAction) { return ACTION_LABEL[a]; }
  actionCls(a: BulkAction) { return ACTION_CLS[a]; }
  matchLabel(s: BulkSpec) { return s.matchBy.map(m => (m.rut ? m.label : m.label.toLowerCase())).join(' o '); }

  choose(s: BulkSpec) {
    if (!this.can(s)) return;
    const changed = this.spec()?.entity !== s.entity;
    this.spec.set(s);
    this.done.set(null);
    this.filter.set('all');
    if (changed && this.sheets().length) this.detect();
  }

  setUpdate(v: boolean) { this.updateExisting.set(v); }

  setColumn(key: string, v: string) {
    this.map.update(m => {
      const next = { ...m };
      const idx = v === '' ? undefined : Number(v);
      // Una columna se asocia a un solo campo.
      if (idx !== undefined) for (const k of Object.keys(next)) if (next[k] === idx) next[k] = undefined;
      next[key] = idx;
      return next;
    });
  }

  downloadTemplate() {
    const s = this.spec();
    if (!s) return;
    download(`plantilla-${s.entity}.xlsx`, buildXlsx(templateSheets(s, this.bulk.context(s, true).lists)));
  }

  downloadResult() {
    const s = this.spec(), sh = this.sheet();
    if (!s || !sh) return;
    const header = (sh.rows[this.headerIdx()] ?? []) as Cell[];
    download(`resultado-${s.entity}.xlsx`, buildXlsx(resultSheets(header, this.rows())));
  }

  onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) void this.load(f);
    input.value = '';
  }

  onDrop(ev: DragEvent) {
    ev.preventDefault();
    this.dragging.set(false);
    const f = ev.dataTransfer?.files?.[0];
    if (f) void this.load(f);
  }

  private async load(file: File) {
    this.error.set('');
    this.importError.set('');
    this.done.set(null);
    this.loading.set(true);
    try {
      const name = file.name.toLowerCase();
      let sheets: LoadedSheet[];
      if (name.endsWith('.xls')) {
        throw new Error('El formato .xls (Excel 97-2003) no se puede leer. Ábrelo en Excel y guárdalo como .xlsx o .csv.');
      } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
        const buf = await file.arrayBuffer();
        const utf8 = new TextDecoder('utf-8').decode(buf);
        sheets = [{ name: file.name, rows: parseCsv(utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8) }];
      } else if (name.endsWith('.xlsx')) {
        const { default: readXlsxFile } = await import('read-excel-file/browser');
        const all = await readXlsxFile(file);
        sheets = all.map(s => ({ name: s.sheet, rows: s.data as unknown as SheetRows }));
      } else {
        throw new Error('Formato no admitido. Usa un archivo .xlsx o .csv.');
      }
      // Las hojas de ayuda de la plantilla no traen datos.
      sheets = sheets.filter(s => !/^(instrucciones|listas)$/i.test(s.name) || sheets.length === 1);
      if (!sheets.some(s => s.rows.length)) throw new Error('El archivo no tiene datos.');
      this.sheets.set(sheets);
      this.fileName.set(file.name);
      this.detect();
    } catch (err) {
      this.sheets.set([]);
      this.fileName.set('');
      this.error.set((err as Error).message || 'No se pudo leer el archivo.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Elige la hoja y el encabezado con más columnas reconocidas. */
  private detect() {
    const s = this.spec();
    if (!s) return;
    let best = { sheet: 0, header: 0, score: -1 };
    this.sheets().forEach((sh, i) => {
      const h = findBulkHeader(s, sh.rows);
      const score = h >= 0 ? Object.keys(guessBulkColumns(s, sh.rows[h])).length : -1;
      if (score > best.score) best = { sheet: i, header: Math.max(0, h), score };
    });
    this.sheetIdx.set(best.sheet);
    this.headerIdx.set(best.header);
    this.map.set(guessBulkColumns(s, this.sheets()[best.sheet]?.rows[best.header] ?? []));
    if (best.score < 0) this.error.set(`No se reconoció el encabezado. Revisa que el archivo tenga columnas como: ${s.fields.filter(f => f.required || f.requiredOnCreate).map(f => f.label).join(', ')}.`);
    this.filter.set('all');
  }

  selectSheet(i: number) {
    const s = this.spec();
    this.sheetIdx.set(i);
    if (!s) return;
    const rows = this.sheets()[i]?.rows ?? [];
    const h = Math.max(0, findBulkHeader(s, rows));
    this.headerIdx.set(h);
    this.map.set(guessBulkColumns(s, rows[h] ?? []));
  }

  async import() {
    const s = this.spec();
    if (!s || !this.toSave() || this.importing()) return;
    if (!this.rs.requirePermission(s.permissions, `la carga masiva de ${s.label.toLowerCase()}`)) return;
    this.importing.set(true);
    this.importError.set('');
    try {
      const file = this.fileName();
      const r = await this.bulk.apply(s, this.rows(), file);
      this.done.set({ ...r, file });
      this.notify.emit(`Carga masiva de ${s.label.toLowerCase()}: ${r.created} nuevos, ${r.updated} actualizados.`);
      this.sheets.set([]);
      this.fileName.set('');
      this.version.update(v => v + 1);
    } catch (err) {
      this.importError.set((err as Error).message);
    } finally {
      this.importing.set(false);
    }
  }

  reset() {
    this.done.set(null);
    this.sheets.set([]);
    this.fileName.set('');
    this.error.set('');
  }
}
