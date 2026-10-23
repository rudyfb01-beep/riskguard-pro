import { Injectable, computed, signal } from '@angular/core';
import {
  BusinessProcess, DEFAULT_GENERAL_PARAMETERS, GeneralParameters, OrgArea, normalizeGeneralParameters,
} from '../models/catalog.model';
import { DEFAULT_AREAS } from '../data/base-seed';
import { DEMO_PROCESSES } from '../data/demo-seed';

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

  readonly params = computed<GeneralParameters>(() => normalizeGeneralParameters(this.generalParameters()));
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
