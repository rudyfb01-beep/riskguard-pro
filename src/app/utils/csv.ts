/**
 * Genera y descarga un CSV compatible con Excel en español: separador ";",
 * BOM UTF-8 para acentos y números con coma decimal.
 */
export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000).replace('.', ',') : '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, rows: (string | number | boolean | null | undefined)[][]): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
