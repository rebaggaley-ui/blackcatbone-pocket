import type { SQLiteDatabase } from 'expo-sqlite';
import type { DiscogsRow } from './csv';
import { getMediaKind, type MediaKind } from './format';

/** One item in your collection: from your Discogs export, or (later) added by hand ("not on Discogs"). */
export interface Item {
  key: string;
  source: 'discogs' | 'own';
  releaseId: number | null;
  catalog: string;
  artist: string;
  title: string;
  label: string;
  format: string;
  kind: MediaKind;
  rating: number;
  released: string;
  folder: string;
  dateAdded: string;
  mediaCondition: string;
  sleeveCondition: string;
  notes: string;
  /** In an earlier export but not the latest: kept (with its photos and tags), shown as gone from Discogs. */
  gone: boolean;
  /** Its sleeve: your photo first, then Discogs' of this release, then a stand-in; null until there's one. */
  cover: Cover | null;
}

/** Where a picture is from: shown on it, so a stand-in never passes for your copy. */
export type ImageKind = 'your-photo' | 'this-release' | 'stand-in';

export interface Cover {
  /** In the app's own folder (see images.ts). */
  file: string;
  kind: ImageKind;
}

/** Your photos first, then this release's, then stand-ins; newest first within each. */
const BEST_IMAGE = "ORDER BY CASE kind WHEN 'your-photo' THEN 0 WHEN 'this-release' THEN 1 ELSE 2 END, id DESC LIMIT 1";
const WITH_COVER = `items.*,
  (SELECT file FROM images WHERE images.item_key = items.key ${BEST_IMAGE}) AS cover_file,
  (SELECT kind FROM images WHERE images.item_key = items.key ${BEST_IMAGE}) AS cover_kind`;

interface ItemRow {
  key: string;
  source: string;
  release_id: number | null;
  catalog: string;
  artist: string;
  title: string;
  label: string;
  format: string;
  kind: string;
  rating: number;
  released: string;
  folder: string;
  date_added: string;
  media_condition: string;
  sleeve_condition: string;
  notes: string;
  gone: number;
  cover_file: string | null;
  cover_kind: string | null;
}

const DATABASE_VERSION = 2;

/** Runs before anything reads the database (SQLiteProvider onInit): makes it, or brings an older one up to date. */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = result?.user_version ?? 0;
  if (version >= DATABASE_VERSION) {
    return;
  }
  if (version === 0) {
    await db.execAsync(`
PRAGMA journal_mode = 'wal';
CREATE TABLE IF NOT EXISTS items (
  key TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL,
  release_id INTEGER,
  catalog TEXT NOT NULL DEFAULT '',
  artist TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  format TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'Other',
  rating INTEGER NOT NULL DEFAULT 0,
  released TEXT NOT NULL DEFAULT '',
  folder TEXT NOT NULL DEFAULT '',
  date_added TEXT NOT NULL DEFAULT '',
  media_condition TEXT NOT NULL DEFAULT '',
  sleeve_condition TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  gone INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS items_artist ON items (artist COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS items_release ON items (release_id);
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  file_name TEXT NOT NULL,
  added INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  gone INTEGER NOT NULL
);
`);
    version = 1;
  }
  if (version === 1) {
    // Artwork: pictures of each item (Discogs' of this release, stand-ins from elsewhere, your own photos), what
    // the lookups found (and when), and settings such as which online lookups you've switched on.
    await db.execAsync(`
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  file TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  added TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_item ON images (item_key);
CREATE TABLE IF NOT EXISTS lookups (
  item_key TEXT PRIMARY KEY NOT NULL,
  discogs TEXT NOT NULL DEFAULT '',
  standin TEXT NOT NULL DEFAULT '',
  tracklist TEXT NOT NULL DEFAULT '',
  barcodes TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`);
    version = 2;
  }
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

function toItem(row: ItemRow): Item {
  return {
    key: row.key,
    source: row.source === 'own' ? 'own' : 'discogs',
    releaseId: row.release_id,
    catalog: row.catalog,
    artist: row.artist,
    title: row.title,
    label: row.label,
    format: row.format,
    kind: row.kind as MediaKind,
    rating: row.rating,
    released: row.released,
    folder: row.folder,
    dateAdded: row.date_added,
    mediaCondition: row.media_condition,
    sleeveCondition: row.sleeve_condition,
    notes: row.notes,
    gone: row.gone !== 0,
    cover: row.cover_file ? { file: row.cover_file, kind: (row.cover_kind ?? 'stand-in') as ImageKind } : null,
  };
}

export interface ImportSummary {
  added: number;
  updated: number;
  /** In the collection before but not in this export. */
  gone: number;
  total: number;
  skipped: string[];
}

/**
 * Brings in an export: new records are added, ones already here get the latest details, and ones no longer in it
 * are marked gone from Discogs (never deleted: their photos and tags will hang off them).
 */
export async function importDiscogs(
  db: SQLiteDatabase,
  rows: DiscogsRow[],
  fileName: string,
  skipped: string[],
  /** From Discogs without your token: it hides folders, conditions and notes, so the ones already here are kept. */
  keepPrivate = false
): Promise<ImportSummary> {
  const before = new Set((await db.getAllAsync<{ key: string }>("SELECT key FROM items WHERE source = 'discogs'")).map((r) => r.key));
  let added = 0;
  let updated = 0;
  await db.withTransactionAsync(async () => {
    const upsert = await db.prepareAsync(`
INSERT INTO items (key, source, release_id, catalog, artist, title, label, format, kind, rating, released, folder, date_added, media_condition, sleeve_condition, notes, gone)
VALUES ($key, 'discogs', $release, $catalog, $artist, $title, $label, $format, $kind, $rating, $released, $folder, $added, $media, $sleeve, $notes, 0)
ON CONFLICT (key) DO UPDATE SET
  release_id = excluded.release_id, catalog = excluded.catalog, artist = excluded.artist, title = excluded.title, label = excluded.label,
  format = excluded.format, kind = excluded.kind, rating = excluded.rating, released = excluded.released,
  folder = CASE WHEN $keep = 1 THEN items.folder ELSE excluded.folder END,
  date_added = excluded.date_added,
  media_condition = CASE WHEN $keep = 1 THEN items.media_condition ELSE excluded.media_condition END,
  sleeve_condition = CASE WHEN $keep = 1 THEN items.sleeve_condition ELSE excluded.sleeve_condition END,
  notes = CASE WHEN $keep = 1 THEN items.notes ELSE excluded.notes END, gone = 0`);
    try {
      for (const row of rows) {
        await upsert.executeAsync({
          $key: row.key,
          $release: row.releaseId,
          $catalog: row.catalog,
          $artist: row.artist,
          $title: row.title,
          $label: row.label,
          $format: row.format,
          $kind: getMediaKind(row.format),
          $rating: row.rating,
          $released: row.released,
          $folder: row.folder,
          $added: row.dateAdded,
          $media: row.mediaCondition,
          $sleeve: row.sleeveCondition,
          $notes: row.notes,
          $keep: keepPrivate ? 1 : 0,
        });
        if (before.delete(row.key)) {
          updated++;
        } else {
          added++;
        }
      }
    } finally {
      await upsert.finalizeAsync();
    }
    // What's left in `before` wasn't in this export.
    for (const key of before) {
      await db.runAsync('UPDATE items SET gone = 1 WHERE key = ?', key);
    }
    await db.runAsync(
      'INSERT INTO imports (at, file_name, added, updated, gone) VALUES (?, ?, ?, ?, ?)',
      new Date().toISOString(),
      fileName,
      added,
      updated,
      before.size
    );
  });
  return { added, updated, gone: before.size, total: rows.length, skipped };
}

export type SortRule = 'artist' | 'added' | 'year' | 'label';

export interface ItemQuery {
  search?: string;
  kind?: MediaKind | null;
  sort?: SortRule;
}

const ORDER: Record<SortRule, string> = {
  // "The Beatles" files under B, as in a record shop.
  artist: "CASE WHEN artist LIKE 'The %' THEN substr(artist, 5) ELSE artist END COLLATE NOCASE, title COLLATE NOCASE",
  added: 'date_added DESC',
  year: "CASE WHEN released = '' THEN 9999 ELSE released END, artist COLLATE NOCASE",
  label: 'label COLLATE NOCASE, catalog COLLATE NOCASE',
};

export async function listItems(db: SQLiteDatabase, query: ItemQuery = {}): Promise<Item[]> {
  const where: string[] = [];
  const params: Record<string, string> = {};
  const search = query.search?.trim();
  if (search) {
    // % and _ in what you type are themselves, not wildcards.
    const like = "LIKE $q ESCAPE '\\'";
    where.push(`(artist ${like} OR title ${like} OR label ${like} OR catalog ${like})`);
    params.$q = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }
  if (query.kind) {
    where.push('kind = $kind');
    params.$kind = query.kind;
  }
  const sql = `SELECT ${WITH_COVER} FROM items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY gone, ${ORDER[query.sort ?? 'artist']}`;
  const rows = await db.getAllAsync<ItemRow>(sql, params);
  return rows.map(toItem);
}

export async function getItem(db: SQLiteDatabase, key: string): Promise<Item | null> {
  const row = await db.getFirstAsync<ItemRow>(`SELECT ${WITH_COVER} FROM items WHERE key = ?`, key);
  return row ? toItem(row) : null;
}

export async function countByKind(db: SQLiteDatabase): Promise<Partial<Record<MediaKind, number>>> {
  const rows = await db.getAllAsync<{ kind: MediaKind; n: number }>('SELECT kind, COUNT(*) AS n FROM items GROUP BY kind');
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
}

export async function getLastImport(db: SQLiteDatabase): Promise<{ at: string; fileName: string } | null> {
  const row = await db.getFirstAsync<{ at: string; file_name: string }>('SELECT at, file_name FROM imports ORDER BY id DESC LIMIT 1');
  return row ? { at: row.at, fileName: row.file_name } : null;
}

// Settings ------------------------------------------------------------------------------------------------------

export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
}

// Pictures ------------------------------------------------------------------------------------------------------

export interface ItemImage {
  id: number;
  itemKey: string;
  kind: ImageKind;
  file: string;
  /** "Discogs", "MusicBrainz / Cover Art Archive", "Camera", "Photo library". */
  source: string;
  sourceUrl: string;
  added: string;
}

/** An item's pictures, best first (as its sleeve is chosen). */
export async function listImages(db: SQLiteDatabase, itemKey: string): Promise<ItemImage[]> {
  const rows = await db.getAllAsync<{ id: number; item_key: string; kind: string; file: string; source: string; source_url: string; added: string }>(
    `SELECT * FROM images WHERE item_key = ? ORDER BY CASE kind WHEN 'your-photo' THEN 0 WHEN 'this-release' THEN 1 ELSE 2 END, id DESC`,
    itemKey
  );
  return rows.map((r) => ({ id: r.id, itemKey: r.item_key, kind: r.kind as ImageKind, file: r.file, source: r.source, sourceUrl: r.source_url, added: r.added }));
}

export async function addImage(db: SQLiteDatabase, image: Omit<ItemImage, 'id' | 'added'>): Promise<void> {
  await db.runAsync(
    'INSERT INTO images (item_key, kind, file, source, source_url, added) VALUES (?, ?, ?, ?, ?, ?)',
    image.itemKey,
    image.kind,
    image.file,
    image.source,
    image.sourceUrl,
    new Date().toISOString()
  );
}

export async function deleteImage(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM images WHERE id = ?', id);
}

// Lookups -------------------------------------------------------------------------------------------------------

/** What's been looked up for an item: '' not yet, 'found', 'none' (asked; nothing there), 'failed' (try again later). */
export type LookupState = '' | 'found' | 'none' | 'failed' | 'skipped';

export interface Track {
  position: string;
  title: string;
  duration: string;
}

export interface Lookup {
  discogs: LookupState;
  standin: LookupState;
  tracklist: Track[];
  barcodes: string[];
  genres: string[];
}

export async function getLookup(db: SQLiteDatabase, itemKey: string): Promise<Lookup | null> {
  const row = await db.getFirstAsync<{ discogs: string; standin: string; tracklist: string; barcodes: string; genres: string }>(
    'SELECT * FROM lookups WHERE item_key = ?',
    itemKey
  );
  if (!row) {
    return null;
  }
  const json = <T,>(text: string, empty: T): T => {
    try {
      return text ? (JSON.parse(text) as T) : empty;
    } catch {
      return empty;
    }
  };
  return {
    discogs: row.discogs as LookupState,
    standin: row.standin as LookupState,
    tracklist: json<Track[]>(row.tracklist, []),
    barcodes: json<string[]>(row.barcodes, []),
    genres: json<string[]>(row.genres, []),
  };
}

export async function saveLookup(db: SQLiteDatabase, itemKey: string, lookup: Lookup): Promise<void> {
  await db.runAsync(
    `INSERT INTO lookups (item_key, discogs, standin, tracklist, barcodes, genres, at) VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (item_key) DO UPDATE SET discogs = excluded.discogs, standin = excluded.standin, tracklist = excluded.tracklist,
  barcodes = excluded.barcodes, genres = excluded.genres, at = excluded.at`,
    itemKey,
    lookup.discogs,
    lookup.standin,
    JSON.stringify(lookup.tracklist),
    JSON.stringify(lookup.barcodes),
    JSON.stringify(lookup.genres),
    new Date().toISOString()
  );
}

export interface LookupTarget {
  key: string;
  releaseId: number | null;
  artist: string;
  title: string;
}

/**
 * Items still to look up, in the order they're shown (A-Z): never looked up, or one whose last try failed, or one
 * skipped because that lookup was off then and is on now.
 */
export async function nextToLookUp(db: SQLiteDatabase, limit: number, on: { discogs: boolean; standIns: boolean }): Promise<LookupTarget[]> {
  const rows = await db.getAllAsync<{ key: string; release_id: number | null; artist: string; title: string }>(
    `SELECT items.key, items.release_id, items.artist, items.title FROM items
LEFT JOIN lookups ON lookups.item_key = items.key
WHERE items.gone = 0 AND (lookups.item_key IS NULL OR lookups.discogs = 'failed' OR lookups.standin = 'failed'
  ${on.discogs ? "OR (lookups.discogs = 'skipped' AND items.release_id IS NOT NULL)" : ''}
  ${on.standIns ? "OR (lookups.standin = 'skipped' AND lookups.discogs <> 'found')" : ''})
ORDER BY ${ORDER.artist}
LIMIT ?`,
    limit
  );
  return rows.map((r) => ({ key: r.key, releaseId: r.release_id, artist: r.artist, title: r.title }));
}

export interface ArtworkCounts {
  items: number;
  lookedUp: number;
  thisRelease: number;
  standIns: number;
  yourPhotos: number;
}

export async function getArtworkCounts(db: SQLiteDatabase): Promise<ArtworkCounts> {
  const row = await db.getFirstAsync<{ items: number; looked: number; release: number; standin: number; photos: number }>(`SELECT
  (SELECT COUNT(*) FROM items WHERE gone = 0) AS items,
  (SELECT COUNT(*) FROM lookups WHERE discogs NOT IN ('', 'failed') AND standin <> 'failed') AS looked,
  (SELECT COUNT(DISTINCT item_key) FROM images WHERE kind = 'this-release') AS release,
  (SELECT COUNT(DISTINCT item_key) FROM images WHERE kind = 'stand-in') AS standin,
  (SELECT COUNT(DISTINCT item_key) FROM images WHERE kind = 'your-photo') AS photos`);
  return {
    items: row?.items ?? 0,
    lookedUp: row?.looked ?? 0,
    thisRelease: row?.release ?? 0,
    standIns: row?.standin ?? 0,
    yourPhotos: row?.photos ?? 0,
  };
}

/** Forget what the lookups found (not your photos), so they run again. */
export async function resetLookups(db: SQLiteDatabase): Promise<void> {
  await db.execAsync("DELETE FROM lookups; DELETE FROM images WHERE kind <> 'your-photo';");
}

/** Your Discogs records as export rows (for saving as a CSV), in the export's order: by label, then catalogue number. */
export async function listDiscogsRows(db: SQLiteDatabase): Promise<Omit<DiscogsRow, 'key'>[]> {
  const rows = await db.getAllAsync<ItemRow>("SELECT * FROM items WHERE source = 'discogs' AND gone = 0 ORDER BY label COLLATE NOCASE, catalog COLLATE NOCASE");
  return rows.map((row) => ({
    releaseId: row.release_id ?? 0,
    catalog: row.catalog,
    artist: row.artist,
    title: row.title,
    label: row.label,
    format: row.format,
    rating: row.rating,
    released: row.released,
    folder: row.folder,
    dateAdded: row.date_added,
    mediaCondition: row.media_condition,
    sleeveCondition: row.sleeve_condition,
    notes: row.notes,
  }));
}
