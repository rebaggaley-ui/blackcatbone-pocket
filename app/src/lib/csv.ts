/**
 * Reading the collection export Discogs gives you (Dashboard > Export > Collection): a CSV with these columns,
 * in this order, quoted where a value has commas or quotes in it (7" formats always do).
 */
export const DISCOGS_COLUMNS = [
  'Catalog#',
  'Artist',
  'Title',
  'Label',
  'Format',
  'Rating',
  'Released',
  'release_id',
  'CollectionFolder',
  'Date Added',
  'Collection Media Condition',
  'Collection Sleeve Condition',
  'Collection Notes',
] as const;

/** One record (or tape, or CD) from the export. */
export interface DiscogsRow {
  /** Stable for this copy: its release, and which copy of that release it is (you can own one twice). */
  key: string;
  releaseId: number;
  catalog: string;
  artist: string;
  title: string;
  label: string;
  format: string;
  rating: number;
  released: string;
  folder: string;
  dateAdded: string;
  mediaCondition: string;
  sleeveCondition: string;
  notes: string;
}

export interface DiscogsImport {
  rows: DiscogsRow[];
  /** Lines that couldn't be read (with why), for the import summary. */
  skipped: string[];
}

/** Splits CSV text into rows of fields: commas, double quotes ("" inside quotes is a quote), CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // A byte-order mark at the start isn't part of the first column's name.
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Blank lines (a trailing newline, mostly) aren't records.
  return rows.filter((r) => r.length > 1 || r[0].trim() !== '');
}

/** Reads a Discogs collection export. Throws (with a message to show) if it isn't one. */
export function parseDiscogsCollection(text: string): DiscogsImport {
  const table = parseCsv(text);
  if (table.length === 0) {
    throw new Error('That file is empty.');
  }
  const header = table[0].map((h) => h.trim());
  const at = new Map(header.map((name, index) => [name, index]));
  const missing = ['Artist', 'Title', 'Format', 'release_id'].filter((name) => !at.has(name));
  if (missing.length > 0) {
    throw new Error(
      `That doesn't look like a Discogs collection export (it has no ${missing.join(', ')} column). ` +
        'On discogs.com: Dashboard > Export > Collection, then open the CSV from the email or download.'
    );
  }
  const get = (fields: string[], name: string) => (fields[at.get(name) ?? -1] ?? '').trim();

  const rows: DiscogsRow[] = [];
  const skipped: string[] = [];
  for (let line = 1; line < table.length; line++) {
    const fields = table[line];
    const releaseId = Number.parseInt(get(fields, 'release_id'), 10);
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      skipped.push(`Line ${line + 1}: no release number`);
      continue;
    }
    rows.push({
      key: '',
      releaseId,
      catalog: get(fields, 'Catalog#'),
      artist: get(fields, 'Artist'),
      title: get(fields, 'Title'),
      label: get(fields, 'Label'),
      format: get(fields, 'Format'),
      rating: Number.parseInt(get(fields, 'Rating'), 10) || 0,
      released: get(fields, 'Released'),
      folder: get(fields, 'CollectionFolder'),
      dateAdded: get(fields, 'Date Added'),
      mediaCondition: get(fields, 'Collection Media Condition'),
      sleeveCondition: get(fields, 'Collection Sleeve Condition'),
      notes: get(fields, 'Collection Notes'),
    });
  }
  assignKeys(rows);
  return { rows, skipped };
}

/**
 * Gives each copy its key: "d<release>-<n>", the nth copy of that release you added. The same whether your
 * collection came from the file or straight from Discogs (their orders differ), so photos and tags stay put.
 */
export function assignKeys(rows: DiscogsRow[]): void {
  const order = rows.map((row, index) => ({ row, index }));
  order.sort((a, b) => a.row.releaseId - b.row.releaseId || a.row.dateAdded.localeCompare(b.row.dateAdded) || a.index - b.index);
  let copy = 0;
  for (let i = 0; i < order.length; i++) {
    copy = i > 0 && order[i - 1].row.releaseId === order[i].row.releaseId ? copy + 1 : 1;
    order[i].row.key = `d${order[i].row.releaseId}-${copy}`;
  }
}

/** A value for a CSV field: quoted when it has a comma, quote or line break in it (quotes doubled), as Discogs does. */
function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Your collection as a Discogs export (the same columns, in the same order), so the game's Librarian, or anything
 * else that reads Discogs exports, takes it as it is. Only records from Discogs: ones you added by hand aren't on it.
 */
export function toDiscogsCsv(rows: Omit<DiscogsRow, 'key'>[]): string {
  const lines = [DISCOGS_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.catalog,
        row.artist,
        row.title,
        row.label,
        row.format,
        row.rating > 0 ? row.rating : '',
        row.released,
        row.releaseId,
        row.folder,
        row.dateAdded,
        row.mediaCondition,
        row.sleeveCondition,
        row.notes,
      ]
        .map(csvField)
        .join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}
