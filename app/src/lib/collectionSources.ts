import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import { toDiscogsCsv } from './csv';
import { getSetting, importDiscogs, listDiscogsRows, setSetting, type ImportSummary } from './db';
import { downloadCollection, type CollectionProgress } from './discogsCollection';
import { checkDiscogsToken, getDiscogsToken } from './lookups';

/** Your Discogs username (from your token when it was saved, or typed in Settings for a public collection). */
export const SETTING_USERNAME = 'discogs.username';

export async function getDiscogsUsername(db: SQLiteDatabase): Promise<string> {
  return (await getSetting(db, SETTING_USERNAME))?.trim() ?? '';
}

export async function setDiscogsUsername(db: SQLiteDatabase, username: string): Promise<void> {
  await setSetting(db, SETTING_USERNAME, username.trim());
}

/**
 * Brings your collection in straight from Discogs (no export file needed). With your token: everything, including
 * your folders, conditions and notes. Without one: what your public collection shows (and what's already here of
 * the private details is kept). Throws with a message to show.
 */
export async function importFromDiscogs(db: SQLiteDatabase, onProgress?: (progress: CollectionProgress) => void): Promise<ImportSummary> {
  const token = await getDiscogsToken();
  let username = await getDiscogsUsername(db);
  if (token && !username) {
    username = await checkDiscogsToken(token);
    await setDiscogsUsername(db, username);
  }
  if (!username) {
    throw new Error('Add your Discogs token (or, for a public collection, your Discogs username) in Settings first.');
  }
  const rows = await downloadCollection(username, token, onProgress);
  if (rows.length === 0) {
    throw new Error(`${username}'s collection on Discogs is empty.`);
  }
  return importDiscogs(db, rows, `Discogs (${username})`, [], !token);
}

/**
 * Saves your collection as a Discogs export (the same columns), and opens the phone's share sheet to send it on: to
 * OneDrive or Drive, by email, or to the PC, where the game's Librarian imports it like a Discogs export.
 */
export async function shareCollectionCsv(db: SQLiteDatabase): Promise<number> {
  const rows = await listDiscogsRows(db);
  if (rows.length === 0) {
    throw new Error('There are no Discogs records here to save yet.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('This phone can’t share files from the app.');
  }
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const username = (await getDiscogsUsername(db)) || 'my';
  const file = new File(Paths.cache, `${username}-collection-${stamp}.csv`);
  if (file.exists) {
    file.delete();
  }
  file.create();
  await file.write(toDiscogsCsv(rows));
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Save your collection (CSV)' });
  return rows.length;
}
