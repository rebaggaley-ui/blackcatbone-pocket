/**
 * Playlists on YouTube from your records: which songs a record gives, finding each one on YouTube (and how sure the
 * match is), and the YouTube Data API calls that make the playlist. No phone code here (the sign-in is
 * googleSignIn.ts, the saving youtubePlaylists.ts), so it can be tested on its own.
 */
import { mainArtist, mainTitle, normalise } from './artwork';
import type { Track } from './db';
import type { MediaKind } from './format';
import { cleanArtist } from './format';

// Songs from records --------------------------------------------------------------------------------------------

/** For singles and EPs: only the A side, or both sides. */
export type SideChoice = 'a-sides' | 'both-sides';

export interface Song {
  /** The same song from the same record is the same id (for leaving one out, and for not adding it twice). */
  id: string;
  itemKey: string;
  artist: string;
  title: string;
  /** "A", "B2"... from the tracklist; '' when it came from the record's title. */
  position: string;
  /** An album with no tracklist yet: searched for as the whole album. */
  wholeRecord: boolean;
}

export interface SongSource {
  key: string;
  artist: string;
  title: string;
  kind: MediaKind;
}

/** 7", 10" and 12" records are mostly singles and EPs: they have sides to choose from. */
const SIDED: MediaKind[] = ['7"', '10"', '12"'];

/**
 * The songs a record gives: an album's whole tracklist; a single's A side (or both sides). With no tracklist yet, a
 * single's title ("A / B") gives its sides, and an album is looked for whole.
 */
export function songsFor(record: SongSource, tracklist: Track[], sides: SideChoice): Song[] {
  const artist = cleanArtist(record.artist);
  const sided = SIDED.includes(record.kind);
  const song = (title: string, position: string, wholeRecord = false): Song => ({
    id: `${record.key}#${position || normalise(title)}`,
    itemKey: record.key,
    artist,
    title,
    position,
    wholeRecord,
  });
  if (tracklist.length > 0) {
    if (!sided || sides === 'both-sides') {
      return tracklist.map((track) => song(track.title, track.position));
    }
    // The A side: tracks at A, A1, A2... (or the first track when the positions are just numbers).
    const aSide = tracklist.filter((track) => /^A\d*$/i.test(track.position.trim()));
    return (aSide.length > 0 ? aSide : tracklist.slice(0, 1)).map((track) => song(track.title, track.position));
  }
  if (sided) {
    const titles = record.title.split(' / ').map((part) => mainTitle(part)).filter(Boolean);
    return (sides === 'both-sides' ? titles : titles.slice(0, 1)).map((title, n) => song(title, n === 0 ? 'A' : 'B'));
  }
  return [song(mainTitle(record.title), '', true)];
}

/** Each song once, the first time it comes (two pressings of a single give it once). */
export function withoutRepeats(songs: Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const key = songKey(song);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** Who and what, for remembering a search: the same song from any record is looked up once. */
export function songKey(song: Pick<Song, 'artist' | 'title' | 'wholeRecord'>): string {
  return `${normalise(mainArtist(song.artist))}|${normalise(song.title)}${song.wholeRecord ? '|album' : ''}`;
}

const isVarious = (artist: string) => normalise(mainArtist(artist)) === 'various';

/** What's typed into YouTube's search: the artist and the song (or "full album"). */
export function searchQuery(song: Pick<Song, 'artist' | 'title' | 'wholeRecord'>): string {
  const parts = isVarious(song.artist) ? [song.title] : [mainArtist(song.artist), song.title];
  if (song.wholeRecord) {
    parts.push('full album');
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** A plain list of the songs, for sharing as text. */
export function songListText(name: string, songs: Pick<Song, 'artist' | 'title' | 'wholeRecord'>[]): string {
  const lines = songs.map((song, n) => `${n + 1}. ${song.artist}, ${song.title}${song.wholeRecord ? ' (the album)' : ''}`);
  return [name, '', ...lines].join('\n');
}

// Matching ------------------------------------------------------------------------------------------------------

/** A video from YouTube's search. */
export interface Candidate {
  videoId: string;
  title: string;
  channel: string;
}

/**
 * found: a confident match. check: a near miss (another artist's channel, a live take, a cover...): you choose.
 * not-there: nothing that's this song. A song is never quietly swapped for another version.
 */
export type Verdict = 'found' | 'check' | 'not-there';

export interface Match {
  verdict: Verdict;
  /** The video it would use; null when it's not there. */
  chosen: Candidate | null;
  /** Everything the search turned up that has the song's title in it, best first: to swap for another. */
  candidates: Candidate[];
}

/** Words that mean a different version, unless the song's own title has them. */
const OTHER_VERSIONS = [
  'live',
  'cover',
  'karaoke',
  'remix',
  'instrumental',
  'reaction',
  'tutorial',
  'lesson',
  'acoustic',
  'demo',
  'slowed',
  'reverb',
  'sped up',
  'nightcore',
  '8d',
  'piano',
  'guitar',
  'drum',
  'bass',
  'medley',
  'rehearsal',
  'tribute',
];

/** How well one video matches a song: 'found', 'check', or null when it isn't the song at all. */
export function judge(song: Pick<Song, 'artist' | 'title' | 'wholeRecord'>, candidate: Candidate): 'found' | 'check' | null {
  const title = ` ${normalise(candidate.title)} `;
  const want = normalise(mainTitle(song.title));
  if (!want || !title.includes(` ${want} `)) {
    return null;
  }
  const own = ` ${normalise(song.title)} `;
  if (OTHER_VERSIONS.some((word) => title.includes(` ${word} `) && !own.includes(` ${word} `))) {
    return 'check';
  }
  if (isVarious(song.artist)) {
    return 'check';
  }
  const artist = normalise(mainArtist(song.artist));
  const channel = ` ${normalise(candidate.channel)} `;
  return title.includes(` ${artist} `) || channel.includes(` ${artist} `) ? 'found' : 'check';
}

/** YouTube Music's own uploads come from "Artist - Topic" channels: the record as released. */
const isTopicChannel = (candidate: Candidate) => / - Topic$/.test(candidate.channel);

/** The best of a search's videos for a song (YouTube's order, a "Topic" upload first among confident ones). */
export function pickMatch(song: Pick<Song, 'artist' | 'title' | 'wholeRecord'>, results: Candidate[]): Match {
  const judged = results.map((candidate) => ({ candidate, verdict: judge(song, candidate) })).filter((j) => j.verdict !== null);
  const found = judged.filter((j) => j.verdict === 'found');
  const best = found.find((j) => isTopicChannel(j.candidate)) ?? found[0] ?? judged[0];
  if (!best) {
    return { verdict: 'not-there', chosen: null, candidates: [] };
  }
  const candidates = [best.candidate, ...judged.map((j) => j.candidate).filter((c) => c.videoId !== best.candidate.videoId)];
  return { verdict: best.verdict === 'found' ? 'found' : 'check', chosen: best.candidate, candidates };
}

// Google's daily allowance --------------------------------------------------------------------------------------

/**
 * Each Google project gets 10,000 units a day for the YouTube Data API. A search costs 100; making a playlist or
 * adding a song to one costs 50. So about 66 songs a day when each has to be searched for (searches are
 * remembered, so a song is only searched for once).
 */
export const DAILY_UNITS = 10_000;
export const COST = { search: 100, insert: 50 } as const;

/** The allowance starts again at midnight in California (Pacific time; taken as UTC-8 all year: an hour out in summer). */
export function quotaDay(now: Date = new Date()): string {
  return new Date(now.getTime() - 8 * 3600_000).toISOString().slice(0, 10);
}

/** Roughly what a playlist will cost: searches for the songs not looked up yet, the playlist, and each song added. */
export function estimateUnits(toSearch: number, toAdd: number, newPlaylist: boolean): number {
  return toSearch * COST.search + toAdd * COST.insert + (newPlaylist ? COST.insert : 0);
}

// The YouTube Data API ------------------------------------------------------------------------------------------

const API = 'https://www.googleapis.com/youtube/v3';

/** Only asks to make and change your playlists (and search), nothing else in your account. */
export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';

export class YouTubeError extends Error {
  status: number;
  /** Google's reason: 'quotaExceeded', 'authError', 'playlistNotFound'... */
  reason: string;
  constructor(status: number, reason: string, message: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
  /** Today's allowance is used up: it carries on tomorrow. */
  get outOfQuota(): boolean {
    return this.reason === 'quotaExceeded' || this.reason === 'dailyLimitExceeded';
  }
  /** The sign-in's run out (or was taken back): sign in again. */
  get signInNeeded(): boolean {
    return this.status === 401;
  }
}

interface ApiErrorJson {
  error?: { message?: string; errors?: { reason?: string; message?: string }[] };
}

async function call<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${API}/${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) {
    let json: ApiErrorJson = {};
    try {
      json = (await response.json()) as ApiErrorJson;
    } catch {
      // Not JSON: the status says enough.
    }
    const reason = json.error?.errors?.[0]?.reason ?? '';
    throw new YouTubeError(response.status, reason, describeError(response.status, reason, json.error?.message));
  }
  return (await response.json()) as T;
}

function describeError(status: number, reason: string, message = ''): string {
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
    return 'Today’s YouTube allowance is used up. It starts again tomorrow, and the app carries on from where it stopped.';
  }
  if (status === 401) {
    return 'The Google sign-in has run out. Sign in again.';
  }
  if (reason === 'youtubeSignupRequired') {
    return 'That Google account has no YouTube channel yet. Make one on youtube.com, then try again.';
  }
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') {
    return 'The YouTube Data API isn’t switched on in the app’s Google project yet (see YOUTUBE-SETUP.md).';
  }
  return `YouTube said no (${status}${reason ? `, ${reason}` : ''})${message ? `: ${message}` : '.'}`;
}

/** YouTube's search sends titles with HTML's escapes: "Don&#39;t" is "Don't". */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return named[code.toLowerCase()] ?? whole;
  });
}

interface SearchJson {
  items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string } }[];
}

/** YouTube's search for videos, music first (costs 100 units). */
export async function searchVideos(token: string, query: string): Promise<Candidate[]> {
  const params = new URLSearchParams({ part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '5', q: query });
  const json = await call<SearchJson>(token, `search?${params.toString()}`);
  return (json.items ?? [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      videoId: item.id?.videoId as string,
      title: decodeEntities(item.snippet?.title ?? ''),
      channel: decodeEntities(item.snippet?.channelTitle ?? ''),
    }));
}

export type Privacy = 'private' | 'unlisted';

/** A new playlist in your YouTube account (costs 50 units): its id. */
export async function createPlaylist(token: string, playlist: { name: string; description: string; privacy: Privacy }): Promise<string> {
  const json = await call<{ id?: string }>(token, 'playlists?part=snippet,status', {
    method: 'POST',
    body: { snippet: { title: playlist.name.slice(0, 150), description: playlist.description.slice(0, 5000) }, status: { privacyStatus: playlist.privacy } },
  });
  if (!json.id) {
    throw new YouTubeError(500, '', 'YouTube made the playlist but didn’t say where it is.');
  }
  return json.id;
}

/** A new name for a playlist (costs 50 units). YouTube replaces the whole description too, so it's sent again. */
export async function renamePlaylist(token: string, playlistId: string, playlist: { name: string; description: string }): Promise<void> {
  await call(token, 'playlists?part=snippet', {
    method: 'PUT',
    body: { id: playlistId, snippet: { title: playlist.name.slice(0, 150), description: playlist.description.slice(0, 5000) } },
  });
}

/** One video on the end of a playlist (costs 50 units). */
export async function addToPlaylist(token: string, playlistId: string, videoId: string): Promise<void> {
  await call(token, 'playlistItems?part=snippet', {
    method: 'POST',
    body: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } },
  });
}

export function playlistUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`;
}

export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}
