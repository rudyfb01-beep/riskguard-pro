import { describe, expect, it } from 'vitest';
import { EvidenceFile } from '../models/evidence.model';
import { canAttachEvidence, canRemoveEvidence, checkEvidenceFile, evidenceFor, safeFileName } from './evidence';

const enc = (s: string) => new TextEncoder().encode(s);
const MB = 1024 * 1024;

describe('validación de archivos de evidencia', () => {
  it('acepta el contenido que corresponde a la extensión', () => {
    expect(checkEvidenceFile('acta.pdf', enc('%PDF-1.7\n...'), MB)).toEqual({ mime: 'application/pdf' });
    expect(checkEvidenceFile('muestra.CSV', enc('a,b\n1,2\n'), MB)).toEqual({ mime: 'text/csv' });
    expect(checkEvidenceFile('informe.docx', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]), MB)).toMatchObject({ mime: expect.stringContaining('wordprocessingml') });
    expect(checkEvidenceFile('captura.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), MB)).toEqual({ mime: 'image/png' });
  });

  it('rechaza tipos no permitidos, contenido disfrazado, HTML, vacíos y tamaño excesivo', () => {
    expect(checkEvidenceFile('setup.exe', enc('MZ'), MB)).toHaveProperty('error');
    expect(checkEvidenceFile('pagina.html', enc('<html>'), MB)).toHaveProperty('error');
    expect(checkEvidenceFile('logo.svg', enc('<svg/>'), MB)).toHaveProperty('error');
    expect(checkEvidenceFile('informe.pdf', enc('MZ\x90\x00 ejecutable'), MB)).toEqual({ error: expect.stringContaining('no corresponde') });
    expect(checkEvidenceFile('notas.txt', enc('<!DOCTYPE html><script>x</script>'), MB)).toHaveProperty('error');
    expect(checkEvidenceFile('datos.csv', new Uint8Array([0x61, 0x00, 0x62]), MB)).toHaveProperty('error');
    expect(checkEvidenceFile('vacio.pdf', new Uint8Array(), MB)).toEqual({ error: 'El archivo está vacío.' });
    expect(checkEvidenceFile('grande.txt', new Uint8Array(MB + 1).fill(0x61), MB)).toEqual({ error: expect.stringContaining('1 MB') });
  });

  it('limpia el nombre del archivo', () => {
    expect(safeFileName('C:\\fakepath\\..\\acta "final".pdf')).toBe('acta _final_.pdf');
    expect(safeFileName('../../etc/passwd')).toBe('passwd');
    expect(safeFileName('a'.repeat(300) + '.xlsx')).toMatch(/^a{170}\.xlsx$/);
  });
});

describe('permisos sobre evidencias', () => {
  const owner = { name: 'Ing. Carlos Mendoza', roleId: 'role-ops', permissions: {} };
  const manager = { name: 'Dra. Elena Vasconcelos', roleId: 'role-riesgo-op', permissions: { canManageActionPlans: true, canEvaluateControls: true } };
  const plan = { owner: 'Carlos Mendoza', status: 'En curso' };

  it('el responsable adjunta en su plan abierto; no en uno cerrado ni ajeno', () => {
    expect(canAttachEvidence('action-plans', owner, plan)).toBe(true);
    expect(canAttachEvidence('action-plans', owner, { ...plan, status: 'Cerrado' })).toBe(false);
    expect(canAttachEvidence('action-plans', owner, { ...plan, owner: 'Otra Persona' })).toBe(false);
    expect(canAttachEvidence('action-plans', manager, { ...plan, status: 'Cerrado' })).toBe(true);
    expect(canAttachEvidence('controls', owner, {})).toBe(false);
    expect(canAttachEvidence('controls', manager, {})).toBe(true);
  });

  it('quien responde adjunta en su autoevaluación abierta', () => {
    const resp = { respondent: 'Carlos Mendoza', status: 'En progreso' };
    expect(canAttachEvidence('survey-responses', owner, resp)).toBe(true);
    expect(canAttachEvidence('survey-responses', owner, { ...resp, status: 'Enviada' })).toBe(false);
  });

  it('la baja: quien cargó (si aún puede) o quien administra el módulo', () => {
    const f: EvidenceFile = {
      id: 'e1', entityType: 'action-plans', entityId: 'p1', fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10, sha256: 'x',
      uploadedBy: 'Carlos Mendoza', uploadedAt: '2026-11-05T00:00:00Z',
    };
    expect(canRemoveEvidence(f, owner, plan)).toBe(true);
    expect(canRemoveEvidence(f, owner, { ...plan, status: 'Por verificar' })).toBe(false);
    expect(canRemoveEvidence(f, manager, plan)).toBe(true);
    expect(canRemoveEvidence({ ...f, deletedAt: 'x' }, manager, plan)).toBe(false);
  });

  it('lista solo las vigentes del registro y la parte pedida', () => {
    const base = { entityType: 'audits' as const, entityId: 'a1', fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 1, sha256: 's', uploadedBy: 'u' };
    const list: EvidenceFile[] = [
      { ...base, id: '1', context: 'informe', uploadedAt: '2026-01-01' },
      { ...base, id: '2', context: 'h1', uploadedAt: '2026-01-02' },
      { ...base, id: '3', context: 'informe', uploadedAt: '2026-01-03', deletedAt: 'x' },
    ];
    expect(evidenceFor(list, 'audits', 'a1', 'informe').map(f => f.id)).toEqual(['1']);
    expect(evidenceFor(list, 'audits', 'a1').map(f => f.id)).toEqual(['2', '1']);
  });
});
