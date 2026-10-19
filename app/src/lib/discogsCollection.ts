import { assignKeys, type DiscogsRow } from './csv';
import { discogsHeaders, discogsPace, politeFetch, setDiscogsPace } from './http';

/**
 * Your collection straight from Discogs (no export file needed: the mobile site can't make one), turned into the
 * same rows the CSV import makes, so either way your records, photos and tags line up. With your token it includes
 * your folders, notes and conditions; without one, only what your public collection shows.
 */

// Reading Discogs' answers (no network here, so it can be tested) ------------------------------------------------

interface CollectionReleaseJson {
  id?: number;
  date_added?: string;
  rating?: number;
  folder_id?: number;
  notes?: { field_id?: number; value?: string }[];
  basic_information?: {
    title?: string;
    year?: number;
    artists?: { name?: string; anv?: string; join?: string }[];
    labels?: { name?: string; catno?: string }[];
    formats?: { name?: string; qty?: string; descriptions?: string[]; text?: string }[];
  };
}

/** Artists as on the sleeve: "Soul II Soul Featuring Caron Wheeler", "Eric B. & Rakim", "A, B". */
export function joinArtists(artists: { name?: string; anv?: string; join?: string }[]): string {
  let text = '';
  artists.forEach((artist, index) => {
    text += artist.name ?? '';
    const join = (artist.join ?? '').trim();
    if (index < artists.length - 1) {
      text += join === ',' ? ', ' : join ? ` ${join} ` : ', ';
    }
  });
  return text.trim();
}

/** Format names the export shortens ("Cassette" is "Cass"); any other is written as it is. */
const SHORT_NAMES: Record<string, string> = {
  Cassette: 'Cass',
  'Box Set': 'Box',
  'Flexi-disc': 'Flexi',
  'Lathe Cut': 'Lathe',
  'Reel-To-Reel': 'Reel',
  '8-Track Cartridge': '8-Trk',
  'Floppy Disk': 'Floppy',
};

/** Descriptions the export shortens ("Compilation" is "Comp"); any other is written as it is. */
const SHORT_DESCRIPTIONS: Record<string, string> = {
  Compilation: 'Comp',
  'Limited Edition': 'Ltd',
  Reissue: 'RE',
  Remastered: 'RM',
  Repress: 'RP',
  'Single Sided': 'S/Sided',
  'White Label': 'W/Lbl',
  'Test Pressing': 'TP',
  Numbered: 'Num',
  'Picture Disc': 'Pic',
  'Unofficial Release': 'Unofficial',
  'Special Edition': 'S/Edition',
  'Deluxe Edition': 'Dlx',
  'Club Edition': 'Club',
  Enhanced: 'Enh',
  'Mini-Album': 'MiniAlbum',
  'Maxi-Single': 'Maxi',
  'Partially Mixed': 'P/Mixed',
  Sampler: 'Smplr',
  Etched: 'Etch',
  Quadraphonic: 'Quad',
  'Copy Protected': 'Copy Prot.',
  'Record Store Day': 'RSD',
};

/** A record's size: '7"', '12"', '6½"'. */
const isSize = (description: string) => /^\d+(?:[½¼¾]|\.\d+)?"$/.test(description);

/**
 * Formats as the export writes them: '7"', 'LP, Album', '2x7", Single, RE', several joined with " + ". Sizes come
 * first and a vinyl's size stands for "Vinyl" (and for "LP"); no speeds or "Stereo"; Discogs' short forms; free text
 * cut to three letters ("Boxed Decca" is "Box"); 50 characters at most.
 */
export function formatText(formats: { name?: string; qty?: string; descriptions?: string[]; text?: string }[]): string {
  const text = formats
    .map((format) => {
      const qty = Number.parseInt(format.qty ?? '1', 10);
      const all = (format.descriptions ?? []).filter((d) => !/\bRPM\b/i.test(d) && d !== 'Stereo');
      const sizes = all.filter(isSize);
      let descriptions = all.filter((d) => !isSize(d));
      if (sizes.length > 0) {
        descriptions = descriptions.filter((d) => d !== 'LP');
      }
      descriptions = descriptions.map((d) => SHORT_DESCRIPTIONS[d] ?? d);
      const name = format.name ?? '';
      let parts: string[];
      if (name === 'Vinyl' && (sizes.length > 0 || descriptions[0] === 'LP')) {
        // '7"' or 'LP' stands for "Vinyl".
        const head = sizes.length > 0 ? sizes.shift() ?? '' : descriptions.shift() ?? '';
        parts = [`${qty > 1 ? `${qty}x` : ''}${head}`, ...sizes, ...descriptions];
      } else {
        parts = [`${qty > 1 ? `${qty}x` : ''}${SHORT_NAMES[name] ?? name}`, ...sizes, ...descriptions];
      }
      const free = (format.text ?? '').trim().slice(0, 3);
      if (free) {
        parts.push(free);
      }
      return parts.filter(Boolean).join(', ');
    })
    .filter(Boolean)
    .join(' + ');
  return text.slice(0, 50);
}

/** "2022-04-11T13:39:54-07:00" -> "2022-04-11 13:39:54": as the export writes it (the same clock, Discogs'). */
export function exportDate(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : iso;
}

export interface CollectionNames {
  /** Folder names by id (0 All, 1 Uncategorized). */
  folders: Map<number, string>;
  /** Your collection's own fields by id: "Media Condition", "Sleeve Condition", "Notes", and any you've added. */
  fields: Map<number, string>;
}

/** One release in your collection, as an export row (its key is given once the whole collection's in: assignKeys). */
export function toRow(json: CollectionReleaseJson, names: CollectionNames): DiscogsRow | null {
  const info = json.basic_information ?? {};
  if (!json.id) {
    return null;
  }
  const field = (name: string) => {
    for (const note of json.notes ?? []) {
      if (names.fields.get(note.field_id ?? -1) === name) {
        return (note.value ?? '').trim();
      }
    }
    return '';
  };
  const labels = info.labels ?? [];
  return {
    key: '',
    releaseId: json.id,
    // Each catalogue number once (two labels often share one), as the export does; labels as they are.
    catalog: [...new Set(labels.map((l) => (l.catno ?? '').trim()).filter(Boolean))].join(', '),
    artist: joinArtists(info.artists ?? []),
    title: info.title ?? '',
    label: labels.map((l) => l.name ?? '').filter(Boolean).join(', '),
    format: formatText(info.formats ?? []),
    rating: json.rating ?? 0,
    released: info.year ? String(info.year) : '',
    folder: names.folders.get(json.folder_id ?? 1) ?? (json.folder_id === 1 || json.folder_id === undefined ? 'Uncategorized' : ''),
    dateAdded: exportDate(json.date_added ?? ''),
    mediaCondition: field('Media Condition'),
    sleeveCondition: field('Sleeve Condition'),
    notes: field('Notes'),
  };
}

// Asking Discogs ----------------------------------------------------------------------------------------------

export interface CollectionProgress {
  page: number;
  pages: number;
  items: number;
}

/**
 * Downloads your whole collection (100 a page, within Discogs' limits). `username` is yours (your token says whose
 * it is, see checkDiscogsToken). Throws with a message to show if Discogs says no.
 */
export async function downloadCollection(username: string, token: string | null, onProgress?: (progress: CollectionProgress) => void): Promise<DiscogsRow[]> {
  setDiscogsPace(Boolean(token));
  const headers = discogsHeaders(token);
  const user = encodeURIComponent(username);
  const get = async (path: string) => {
    const response = await politeFetch(discogsPace, `https://api.discogs.com${path}`, headers);
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        token
          ? 'Discogs wouldn’t show that collection with your token.'
          : 'That collection is private. Add your Discogs token in Settings to bring it in.'
      );
    }
    if (response.status === 404) {
      throw new Error(`Discogs has no user called “${username}”.`);
    }
    if (!response.ok) {
      throw new Error(`Discogs didn’t answer (${response.status}). Try again in a minute.`);
    }
    return response.json();
  };

  // Folder and field names: only with your token (Discogs keeps them private); "Uncategorized" otherwise.
  const names: CollectionNames = { folders: new Map([[1, 'Uncategorized']]), fields: new Map() };
  if (token) {
    const folders = (await get(`/users/${user}/collection/folders`)) as { folders?: { id: number; name: string }[] };
    for (const folder of folders.folders ?? []) {
      names.folders.set(folder.id, folder.name);
    }
    const fields = (await get(`/users/${user}/collection/fields`)) as { fields?: { id: number; name: string }[] };
    for (const field of fields.fields ?? []) {
      names.fields.set(field.id, field.name);
    }
  }

  const rows: DiscogsRow[] = [];
  for (let page = 1, pages = 1; page <= pages; page++) {
    const json = (await get(`/users/${user}/collection/folders/0/releases?per_page=100&page=${page}&sort=added&sort_order=asc`)) as {
      pagination?: { pages?: number; items?: number };
      releases?: CollectionReleaseJson[];
    };
    pages = json.pagination?.pages ?? 1;
    for (const release of json.releases ?? []) {
      const row = toRow(release, names);
      if (row) {
        rows.push(row);
      }
    }
    onProgress?.({ page, pages, items: json.pagination?.items ?? rows.length });
  }
  assignKeys(rows);
  return rows;
}
