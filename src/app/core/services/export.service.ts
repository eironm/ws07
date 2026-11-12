import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import { categoryById } from '../categories';
import { TransactionService } from './transaction.service';

/** Exports all transactions (including coordinates) as a CSV spreadsheet. */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private txService = inject(TransactionService);

  buildCsv(): string {
    const header = ['Date', 'Type', 'Category', 'Amount', 'Method', 'Note', 'Place', 'Address', 'Latitude', 'Longitude', 'Accuracy (m)'];
    const rows = this.txService.transactions().map((t) => [
      new Date(t.date).toLocaleString(),
      t.type,
      categoryById(t.categoryId).name,
      t.amount.toFixed(2),
      t.method,
      t.note,
      t.location?.placeName ?? '',
      t.location?.address ?? '',
      t.location?.lat.toFixed(6) ?? '',
      t.location?.lng.toFixed(6) ?? '',
      t.location?.accuracy ?? '',
    ]);
    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  async exportCsv(): Promise<void> {
    const csv = this.buildCsv();
    const fileName = `finance-tracker-${new Date().toISOString().slice(0, 10)}.csv`;

    if (!Capacitor.isNativePlatform()) {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const written = await Filesystem.writeFile({
      path: fileName,
      data: '\uFEFF' + csv, // BOM so Excel detects UTF-8 (₱ sign)
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: 'Finance; Tracker export', files: [written.uri], dialogTitle: 'Share your transactions' });
  }
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

