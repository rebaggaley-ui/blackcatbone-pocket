import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { parseDiscogsCollection } from './csv';
import { importDiscogs, type ImportSummary } from './db';

/**
 * Asks for your Discogs export (from Files, Downloads, Drive, an email attachment...) and brings it in.
 * Null if you didn't choose one; throws with a message to show if it can't be read.
 */
export async function pickAndImportCsv(db: SQLiteDatabase): Promise<ImportSummary | null> {
  // Any type: phones label CSVs in different ways (text/csv, text/comma-separated-values, octet-stream...); the
  // header says whether it's the right file.
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets?.length) {
    return null;
  }
  const asset = picked.assets[0];
  // In a web browser (previewing on the PC) the picked file comes as the browser's own; on a phone, as a path.
  const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
  const { rows, skipped } = parseDiscogsCollection(text);
  if (rows.length === 0) {
    throw new Error('That export has no records in it.');
  }
  return importDiscogs(db, rows, asset.name, skipped);
}

/** "Added 1,212 records" / "12 new, 1,200 updated, 3 gone from Discogs". */
export function describeImport(summary: ImportSummary): string {
  const n = (value: number) => value.toLocaleString();
  const parts =
    summary.updated === 0
      ? [`Added ${n(summary.added)} ${summary.added === 1 ? 'item' : 'items'}`]
      : [`${n(summary.added)} new`, `${n(summary.updated)} updated`];
  if (summary.gone > 0) {
    parts.push(`${n(summary.gone)} no longer in your Discogs collection (kept, marked "gone")`);
  }
  if (summary.skipped.length > 0) {
    parts.push(`${n(summary.skipped.length)} lines skipped`);
  }
  return parts.join(', ') + '.';
}
