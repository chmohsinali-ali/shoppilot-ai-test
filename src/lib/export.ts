/**
 * Export utilities — CSV, Excel (xlsx), and PDF (print) generation.
 */
import * as XLSX from 'xlsx';

export function toCSV(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  if (rows.length === 0) return '';
  const keys = headers ?? Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = val == null ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const headerLine = keys.join(',');
  const dataLines = rows.map((r) => keys.map((k) => escape(r[k])).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function exportRows(filename: string, rows: Array<Record<string, unknown>>, headers?: string[]) {
  const csv = toCSV(rows, headers);
  downloadCSV(filename, csv);
}

export function exportExcel(filename: string, rows: Array<Record<string, unknown>>, headers?: string[]) {
  if (rows.length === 0) return;
  const keys = headers ?? Object.keys(rows[0]);
  const data = rows.map((r) => {
    const obj: Record<string, unknown> = {};
    for (const k of keys) obj[k] = r[k];
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: keys });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportPDF(title: string) {
  // Print-to-PDF approach: opens the browser print dialog with a clean stylesheet.
  // The caller should ensure the report content is visible on the page.
  // We set document.title temporarily so the PDF filename is correct.
  const origTitle = document.title;
  document.title = title;
  window.print();
  setTimeout(() => { document.title = origTitle; }, 500);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
