import { Button } from '@/components/ui/button';
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { exportToCsv, exportToExcel, exportToPdf, type ExportColumn } from '@/lib/export';
import { toast } from 'sonner';

interface Props<T> {
  filename: string;
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

export default function ExportButtons<T>({ filename, title, columns, rows }: Props<T>) {
  const guard = (fn: () => void) => {
    if (rows.length === 0) { toast.error('Nothing to export'); return; }
    fn();
    toast.success('Export started');
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => guard(() => exportToPdf(filename, title, columns, rows))}>
        <FileDown className="h-4 w-4 mr-1.5" />PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => guard(() => exportToExcel(filename, columns, rows))}>
        <FileSpreadsheet className="h-4 w-4 mr-1.5" />Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => guard(() => exportToCsv(filename, columns, rows))}>
        <FileText className="h-4 w-4 mr-1.5" />CSV
      </Button>
    </div>
  );
}
