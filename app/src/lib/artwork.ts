/**
 * Reading what Discogs and MusicBrainz send back, and choosing the right picture. No network or phone code here
 * (that's lookups.ts), so it can be tested on its own.
 */

export interface DiscogsRelease {
  /** The release's own photos, the main one first. */
  images: string[];
  tracklist: { position: string; title: string; duration: string }[];
  barcodes: string[];
  genres: string[];
}

interface DiscogsReleaseJson {
  images?: { type?: string; uri?: string; uri150?: string }[];
  tracklist?: { position?: string; title?: string; duration?: string; type_?: string }[];
  identifiers?: { type?: string; value?: string }[];
  genres?: string[];
  styles?: string[];
}

/** A Discogs release (GET /releases/{id}): its photos (primary first), tracks, barcodes and genres. */
export function parseDiscogsRelease(json: unknown): DiscogsRelease {
  const release = (json ?? {}) as DiscogsReleaseJson;
  const images = [...(release.images ?? [])]
    .filter((image) => image.uri)
    .sort((a, b) => (a.type === 'primary' ? 0 : 1) - (b.type === 'primary' ? 0 : 1))
    .map((image) => image.uri as string);
  const tracklist = (release.tracklist ?? [])
    .filter((track) => (track.type_ ?? 'track') === 'track' && track.title)
    .map((track) => ({ position: track.position ?? '', title: track.title ?? '', duration: track.duration ?? '' }));
  // Barcodes as they're printed, and digits only (what a scanner reads), without repeats.
  const barcodes = new Set<string>();
  for (const id of release.identifiers ?? []) {
    if (id.type === 'Barcode' && id.value) {
      const digits = id.value.replace(/\D/g, '');
      if (digits.length >= 8) {
        barcodes.add(digits);
      }
    }
  }
  return { images, tracklist, barcodes: [...barcodes], genres: [...(release.genres ?? []), ...(release.styles ?? [])] };
}

/** For comparing names: lower case, no accents, "&"/"and" and punctuation evened out, no "The". */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s\(\d+\)/g, '') // Discogs' "(2)" for artists sharing a name
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^the /, '')
    .trim();
}

/** A title without what a single's label adds: "Back To Life (Club Mix)" -> "Back To Life"; "A / B" -> "A". */
export function mainTitle(title: string): string {
  const first = title.split(' / ')[0];
  const plain = first.replace(/\s*[([].*?[)\]]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  return plain || first.trim();
}

/** The artist a record's filed under: "Soul II Soul Featuring Caron Wheeler" -> "Soul II Soul" (credits differ in how they add guests). */
export function mainArtist(artist: string): string {
  const name = artist.replace(/\s\(\d+\)/g, '').trim();
  const main = name.split(/\s+(?:featuring|feat\.?|ft\.?|with|vs\.?|versus)\s+/i)[0].trim();
  return main || name;
}

/** The MusicBrainz search for a record's release group (album or single), by its main artist and main title. */
export function musicBrainzQuery(artist: string, title: string): string {
  const quote = (value: string) => `"${value.replace(/(["\\])/g, '\\$1')}"`;
  const name = mainArtist(artist);
  const parts = [`releasegroup:${quote(mainTitle(title))}`];
  if (name && normalise(name) !== 'various') {
    parts.push(`artist:${quote(name)}`);
  }
  return parts.join(' AND ');
}

interface MusicBrainzSearchJson {
  'release-groups'?: {
    id?: string;
    score?: number;
    title?: string;
    'artist-credit'?: { name?: string; artist?: { name?: string } }[];
  }[];
}

/**
 * The release groups from a search that really are this record (same title, same artist, a high score), best
 * first. Their covers are stand-ins: another pressing's artwork, not a picture of your copy.
 */
export function pickReleaseGroups(json: unknown, artist: string, title: string): string[] {
  const groups = ((json ?? {}) as MusicBrainzSearchJson)['release-groups'] ?? [];
  const wantTitle = normalise(mainTitle(title));
  const wantArtist = normalise(mainArtist(artist));
  const various = wantArtist === 'various';
  return groups
    .filter((group) => {
      if (!group.id || (group.score ?? 0) < 90) {
        return false;
      }
      if (normalise(mainTitle(group.title ?? '')) !== wantTitle) {
        return false;
      }
      if (various) {
        return true;
      }
      const credited = normalise((group['artist-credit'] ?? []).map((credit) => credit.name ?? credit.artist?.name ?? '').join(' '));
      return credited === wantArtist || credited.includes(wantArtist) || wantArtist.includes(credited);
    })
    .map((group) => group.id as string);
}

/** Cover Art Archive's front cover of a release group (it redirects to the image; 404 when there's none). */
export function coverArtUrl(releaseGroupId: string, size: 250 | 500 | 1200 = 500): string {
  return `https://coverartarchive.org/release-group/${releaseGroupId}/front-${size}`;
}
