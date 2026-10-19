import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export type ExportColumn<T> = { header: string; value: (row: T) => string | number };

export interface DetailedExportSection {
  title: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null | undefined>>;
}

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportToCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const lines = [
    columns.map(c => csvCell(c.header)).join(','),
    ...rows.map(r => columns.map(c => csvCell(c.value(r))).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportToExcel<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const data = rows.map(r => Object.fromEntries(columns.map(c => [c.header, c.value(r)])));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = columns.map(c => ({ wch: Math.max(12, c.header.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToPdf<T>(filename: string, title: string, columns: ExportColumn<T>[], rows: T[]) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(title, 14, 15);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()} · ${rows.length} records`, 14, 21);
  autoTable(doc, {
    startY: 26,
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => String(c.value(r)))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [46, 92, 63] },
  });
  doc.save(`${filename}.pdf`);
}

function downloadBlob(filename: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Export a complete report as a workbook with one worksheet per section. */
export function exportDetailedExcel(filename: string, sections: DetailedExportSection[]) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const section of sections) {
    const data = section.rows.map(row => Object.fromEntries(section.columns.map(column => [column, row[column] ?? ''])));
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [Object.fromEntries(section.columns.map(column => [column, '']))]);
    ws['!cols'] = section.columns.map(column => ({
      wch: Math.min(45, Math.max(column.length + 3, ...data.slice(0, 200).map(row => String(row[column] ?? '').length + 2))),
    }));
    let base = section.title.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Report';
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) name = `${base.slice(0, 27)} ${suffix++}`;
    usedNames.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/** Export a multi-section report, automatically creating pages as needed. */
export function exportDetailedPdf(
  filename: string,
  title: string,
  sections: DetailedExportSection[],
  filterSummary = 'All available records',
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 18;

  const addHeader = (continued = false) => {
    doc.setFillColor(31, 91, 62);
    doc.rect(0, 0, pageWidth, 10, 'F');
    doc.setTextColor(22, 47, 35);
    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.text(continued ? `${title} (continued)` : title, 14, 19);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(91, 107, 98);
    doc.text(`${filterSummary}  •  Generated ${new Date().toLocaleString()}`, 14, 25);
    y = 32;
  };

  addHeader();
  for (const section of sections) {
    if (y > pageHeight - 30) {
      doc.addPage();
      addHeader(true);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(28, 54, 41);
    doc.text(`${section.title} (${section.rows.length})`, 14, y);
    y += 3;

    const body = section.rows.length
      ? section.rows.map(row => section.columns.map(column => String(row[column] ?? '')))
      : [section.columns.map((_column, index) => index === 0 ? 'No matching records' : '')];

    autoTable(doc, {
      startY: y,
      head: [section.columns],
      body,
      theme: 'grid',
      margin: { left: 14, right: 14 },
      styles: { fontSize: 6.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [31, 91, 62], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 247, 243] },
      didDrawPage: () => {
        doc.setFontSize(7);
        doc.setTextColor(120, 125, 122);
        doc.text(`PoultryPro • Page ${doc.getNumberOfPages()}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
      },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 12) + 9;
  }
  doc.save(`${filename}.pdf`);
}

/** CSV uses a long format so sections with different columns fit one portable file. */
export function exportDetailedCsv(filename: string, sections: DetailedExportSection[]) {
  const lines: string[] = ['Section,Record,Field,Value'];
  for (const section of sections) {
    section.rows.forEach((row, index) => {
      for (const column of section.columns) {
        lines.push([section.title, index + 1, column, row[column] ?? ''].map(value => csvCell(String(value))).join(','));
      }
    });
  }
  downloadBlob(`${filename}.csv`, '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

export function exportDetailedJson(filename: string, title: string, sections: DetailedExportSection[], filterSummary: string) {
  const payload = {
    title,
    generatedAt: new Date().toISOString(),
    filters: filterSummary,
    sections: sections.map(section => ({
      title: section.title,
      recordCount: section.rows.length,
      records: section.rows,
    })),
  };
  downloadBlob(`${filename}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
}
