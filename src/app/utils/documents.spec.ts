import { describe, expect, it } from 'vitest';
import { ControlledDocument } from '../models/document.model';
import { ApprovalRequest, DEFAULT_APPROVAL_MATRIX } from '../models/approval.model';
import {
  ackStats, addMonths, approveVersion, checkDocumentChange, displayStatus, nextDocumentCode, suggestVersion,
} from './documents';
import { applyApprovalEffect, approvalRoleIds, targetPrecondition } from './approvals';

const manager = { name: 'Dra. Sofía Valenzuela', roleId: 'role-cumplimiento', permissions: { canManageDocuments: true } };
const carlos = { name: 'Ing. Carlos Mendoza', roleId: 'role-ops', permissions: {} };

const doc = (over: Partial<ControlledDocument> = {}): ControlledDocument => ({
  id: 'd1', code: 'POL-001', title: 'Política de Riesgo', type: 'Política', description: '', owner: 'Elena', classification: 'Interna', reviewMonths: 12,
  audienceRoleIds: [], requirementIds: [], processes: [], acknowledgments: [], status: 'Activo', createdBy: 'x', createdAt: '2026-01-01',
  versions: [
    { id: 'v1', version: '1.0', changeSummary: '', status: 'Vigente', createdBy: 'x', createdAt: '2025-01-01', fileId: 'f1', approvedBy: 'Consejo', approvedAt: '2025-02-01', effectiveDate: '2025-02-01', approvalCode: 'SA-1' },
    { id: 'v2', version: '2.0', changeSummary: 'Cambios', status: 'Borrador', createdBy: 'x', createdAt: '2026-10-01', fileId: 'f2' },
  ],
  currentVersionId: 'v1', nextReviewDate: '2026-02-01', ...over,
});

describe('gestión documental', () => {
  it('códigos por tipo, versiones sugeridas y fechas', () => {
    expect(nextDocumentCode([{ code: 'POL-002' }, { code: 'PRO-009' }], 'Política')).toBe('POL-003');
    expect(nextDocumentCode([], 'Procedimiento')).toBe('PRO-001');
    expect(suggestVersion(doc(), true)).toBe('3.0');
    expect(suggestVersion(doc({ versions: [] }))).toBe('1.0');
    expect(suggestVersion(doc(), false)).toBe('2.1');
    expect(addMonths('2026-01-31', 12)).toBe('2027-01-31');
  });

  it('estado: vencido, en aprobación, borrador y obsoleto', () => {
    expect(displayStatus(doc(), '2026-11-05')).toBe('Revisión vencida');
    expect(displayStatus(doc({ nextReviewDate: '2027-01-01' }), '2026-11-05')).toBe('Vigente');
    expect(displayStatus(doc(), '2026-11-05', true)).toBe('En aprobación');
    expect(displayStatus(doc({ currentVersionId: undefined, versions: [] }), '2026-11-05')).toBe('Borrador');
    expect(displayStatus(doc({ status: 'Obsoleto' }), '2026-11-05')).toBe('Obsoleto');
  });

  it('la aprobación pone la versión vigente, reemplaza la anterior y fija la próxima revisión', () => {
    const d = approveVersion(doc(), 'v2', 'Gerente / Consejo', '2026-11-05', 'SA-9')!;
    expect(d.currentVersionId).toBe('v2');
    expect(d.versions.map(v => v.status)).toEqual(['Reemplazada', 'Vigente']);
    expect(d.nextReviewDate).toBe('2027-11-05');
    expect(approveVersion(doc({ versions: [{ ...doc().versions[1], fileId: undefined }] }), 'v2', 'x', '2026-11-05', 'x')).toBeNull();
    // Por el flujo de aprobación (tipo "documento")
    const req = { kind: 'documento', status: 'Aprobada', closedAt: '2026-11-05T12:00:00Z', code: 'SA-9', payload: { versionId: 'v2' }, steps: [{ decidedBy: 'Gerente' }] } as unknown as ApprovalRequest;
    expect(applyApprovalEffect(req, doc()).currentVersionId).toBe('v2');
  });

  it('las políticas suman al Consejo; se exige borrador con archivo', () => {
    expect(approvalRoleIds('documento', DEFAULT_APPROVAL_MATRIX, undefined, 'Política')).toEqual(['role-gerencia-general', 'role-consejo']);
    expect(approvalRoleIds('documento', DEFAULT_APPROVAL_MATRIX, undefined, 'Procedimiento')).toEqual(['role-gerencia-general']);
    expect(targetPrecondition('documento', doc(), { versionId: 'v2' })).toBeNull();
    expect(targetPrecondition('documento', doc(), { versionId: 'v1' })).toContain('borrador');
    expect(targetPrecondition('documento', doc({ versions: [{ ...doc().versions[1], fileId: undefined }] }), { versionId: 'v2' })).toContain('archivo');
  });

  it('quien administra no puede aprobar a mano; los demás solo confirman su lectura', () => {
    const prev = doc();
    const forged = { ...prev, currentVersionId: 'v2', versions: prev.versions.map(v => ({ ...v, status: v.id === 'v2' ? 'Vigente' as const : 'Reemplazada' as const })) };
    expect(checkDocumentChange(prev, forged, manager)).toContain('flujo de aprobación');
    expect(checkDocumentChange(prev, { ...prev, title: 'Nuevo título' }, manager)).toBeNull();
    expect(checkDocumentChange(prev, { ...prev, versions: [...prev.versions, { ...prev.versions[1], id: 'v3' }] }, manager)).toContain('un borrador');
    const ack = { userName: 'Carlos Mendoza', versionId: 'v1', at: 'x' };
    expect(checkDocumentChange(prev, { ...prev, acknowledgments: [ack] }, carlos)).toBeNull();
    expect(checkDocumentChange(prev, { ...prev, acknowledgments: [{ ...ack, userName: 'Otra' }] }, carlos)).toContain('propia');
    expect(checkDocumentChange(prev, { ...prev, acknowledgments: [{ ...ack, versionId: 'v2' }] }, carlos)).toContain('vigente');
    expect(checkDocumentChange(prev, { ...prev, title: 'x', acknowledgments: [ack] }, carlos)).toContain('Solo puedes confirmar');
    expect(checkDocumentChange({ ...prev, acknowledgments: [ack] }, prev, manager)).toContain('No se pueden borrar');
  });

  it('avance de lectura sobre el público objetivo activo', () => {
    const users = [
      { name: 'Ing. Carlos Mendoza', roleId: 'role-ops' }, { name: 'Ana', roleId: 'role-ciso' }, { name: 'Ex', roleId: 'role-ops', active: false },
    ];
    const d = doc({ audienceRoleIds: ['role-ops'], acknowledgments: [{ userName: 'Carlos Mendoza', versionId: 'v1', at: 'x' }] });
    expect(ackStats(d, users)).toMatchObject({ total: 1, done: 1, pct: 100 });
    expect(ackStats({ ...d, audienceRoleIds: [] }, users)).toMatchObject({ total: 2, done: 1, pct: 50 });
  });
});
