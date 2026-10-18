/** What kind of thing a Discogs format string describes ("7\", S/Sided, Promo, W/Lbl" is a 7"). */
export type MediaKind = '7"' | '10"' | '12"' | 'LP' | 'Box set' | 'Cassette' | 'CD' | 'Other';

export const MEDIA_KINDS: MediaKind[] = ['7"', '10"', '12"', 'LP', 'Box set', 'Cassette', 'CD', 'Other'];

export function getMediaKind(format: string): MediaKind {
  const f = format.toLowerCase();
  // A box set starts one of the format's parts: "Box Set, Comp", or "6x7\", ... + Box, Comp" in an export. (A "Box"
  // later in a part is the export cutting free text short: "Boxed Decca" labels become "Box".)
  if (f.split(' + ').some((part) => part.trim().startsWith('box'))) return 'Box set';
  if (f.includes('cass')) return 'Cassette';
  if (/\bcd\b|cdr|cd-r|sacd|\bdvd\b/.test(f)) return 'CD';
  if (f.includes('7"')) return '7"';
  if (f.includes('10"')) return '10"';
  if (/\blp\b/.test(f)) return 'LP';
  if (f.includes('12"')) return '12"';
  if (f.includes('vinyl')) return 'LP';
  return 'Other';
}

/** "Very Good Plus (VG+)" -> "VG+"; empty stays empty. */
export function shortCondition(condition: string): string {
  const match = condition.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : condition;
}

/** A colour of its own for a sleeve with no picture yet, the same every time (from its artist and title). */
export function sleeveColour(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue}, 32%, 30%)`;
}

/** Discogs adds " (2)" to artists who share a name; it isn't part of the name on the record. */
export function cleanArtist(artist: string): string {
  return artist.replace(/\s\(\d+\)$/, '').replace(/\s\(\d+\)(?=,|\s&)/g, '');
}
