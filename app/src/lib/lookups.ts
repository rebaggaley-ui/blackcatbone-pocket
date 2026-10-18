import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { coverArtUrl, musicBrainzQuery, parseDiscogsRelease, pickReleaseGroups } from './artwork';
import { addImage, getLookup, getSetting, nextToLookUp, saveLookup, setSetting, type Lookup, type LookupTarget } from './db';
import { discogsHeaders, discogsPace, musicBrainzPace, politeFetch, setDiscogsPace, USER_AGENT } from './http';
import { downloadArtwork } from './images';

/**
 * Online lookups for artwork (all off until you switch them on in Settings):
 * 1. Discogs, by the release number in your export: that release's own photos, its tracklist and barcodes.
 * 2. If Discogs has no picture: MusicBrainz and the Cover Art Archive, by artist and title. That cover is a stand-in
 *    (another pressing's artwork) and is always shown as "Not your copy".
 * They run one record at a time, within each service's limits, while the app is open.
 */

const TOKEN_KEY = 'discogs.token';

export const SETTING_DISCOGS = 'lookups.discogs';
export const SETTING_STANDINS = 'lookups.standins';

// Your Discogs token --------------------------------------------------------------------------------------------

/** Kept in the phone's secure storage (Keychain / Keystore), never in the database. Not available in a web browser. */
export async function getDiscogsToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setDiscogsToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Your token can only be kept on a phone.');
  }
  const clean = token?.trim() ?? '';
  if (clean) {
    await SecureStore.setItemAsync(TOKEN_KEY, clean);
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

/** A token (pasted, or the text of a file) cleaned up: a "token=" or "Discogs token=" in front is fine. */
export function cleanToken(text: string): string {
  return text.trim().replace(/^(discogs\s+)?token\s*[=:]\s*/i, '').split(/\s+/)[0] ?? '';
}

/** Asks Discogs whose token it is: the username, or throws with what went wrong. */
export async function checkDiscogsToken(token: string): Promise<string> {
  const response = await fetch('https://api.discogs.com/oauth/identity', {
    headers: { 'User-Agent': USER_AGENT, Authorization: `Discogs token=${token}` },
  });
  if (response.status === 401) {
    throw new Error('Discogs doesn’t recognise that token. Make a new one at discogs.com > Settings > Developers.');
  }
  if (!response.ok) {
    throw new Error(`Discogs didn’t answer (${response.status}). Try again in a minute.`);
  }
  const identity = (await response.json()) as { username?: string };
  return identity.username ?? '?';
}

// Looking up one item -------------------------------------------------------------------------------------------

export interface LookupOptions {
  discogs: boolean;
  standIns: boolean;
  token: string | null;
}

export async function getLookupOptions(db: SQLiteDatabase): Promise<LookupOptions> {
  const [discogs, standIns, token] = await Promise.all([getSetting(db, SETTING_DISCOGS), getSetting(db, SETTING_STANDINS), getDiscogsToken()]);
  return { discogs: discogs === '1', standIns: standIns === '1', token };
}

/** What happened, for the progress line. */
export type LookupResult = 'this-release' | 'stand-in' | 'none' | 'failed';

/**
 * Finds artwork for one item and keeps what it finds (pictures in artwork/, the tracklist and barcodes in the
 * database). A failure (no connection, a busy service) is kept as "failed", so it's tried again later.
 */
export async function lookUpItem(db: SQLiteDatabase, item: LookupTarget, options: LookupOptions): Promise<LookupResult> {
  const lookup: Lookup = (await getLookup(db, item.key)) ?? { discogs: '', standin: '', tracklist: [], barcodes: [], genres: [] };
  setDiscogsPace(Boolean(options.token));
  let result: LookupResult = 'none';

  // 1. Discogs: this release's own photos.
  if (!options.discogs || !item.releaseId) {
    lookup.discogs = 'skipped';
  } else if (lookup.discogs !== 'found' && lookup.discogs !== 'none') {
    try {
      const response = await politeFetch(discogsPace, `https://api.discogs.com/releases/${item.releaseId}`, discogsHeaders(options.token));
      if (response.status === 404) {
        lookup.discogs = 'none';
      } else if (!response.ok) {
        throw new Error(`Discogs ${response.status}`);
      } else {
        const release = parseDiscogsRelease(await response.json());
        lookup.tracklist = release.tracklist;
        lookup.barcodes = release.barcodes;
        lookup.genres = release.genres;
        if (release.images.length > 0) {
          const file = await downloadArtwork(release.images[0], item.key, 'discogs', { 'User-Agent': USER_AGENT });
          await addImage(db, { itemKey: item.key, kind: 'this-release', file, source: 'Discogs', sourceUrl: `https://www.discogs.com/release/${item.releaseId}` });
          lookup.discogs = 'found';
          result = 'this-release';
        } else {
          lookup.discogs = 'none';
        }
      }
    } catch {
      lookup.discogs = 'failed';
      result = 'failed';
    }
  } else if (lookup.discogs === 'found') {
    result = 'this-release';
  }

  // 2. A stand-in, only when Discogs has no picture of this release.
  if (lookup.discogs === 'found') {
    lookup.standin = '';
  } else if (!options.standIns) {
    lookup.standin = 'skipped';
  } else if (lookup.standin !== 'found' && lookup.standin !== 'none') {
    try {
      const query = musicBrainzQuery(item.artist, item.title);
      const response = await politeFetch(musicBrainzPace, `https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=5&query=${encodeURIComponent(query)}`, {
        'User-Agent': USER_AGENT,
      });
      if (!response.ok) {
        throw new Error(`MusicBrainz ${response.status}`);
      }
      lookup.standin = 'none';
      // The first match whose cover exists (a release group can have none).
      for (const group of pickReleaseGroups(await response.json(), item.artist, item.title).slice(0, 3)) {
        try {
          const url = coverArtUrl(group);
          const file = await downloadArtwork(url, item.key, 'standin', { 'User-Agent': USER_AGENT });
          await addImage(db, { itemKey: item.key, kind: 'stand-in', file, source: 'MusicBrainz / Cover Art Archive', sourceUrl: `https://musicbrainz.org/release-group/${group}` });
          lookup.standin = 'found';
          result = result === 'failed' ? 'failed' : 'stand-in';
          break;
        } catch {
          // No cover for that one (404) or the archive's busy: the next match.
        }
      }
    } catch {
      lookup.standin = 'failed';
      result = 'failed';
    }
  }

  await saveLookup(db, item.key, lookup);
  return result;
}

// The queue -----------------------------------------------------------------------------------------------------

export interface QueueState {
  running: boolean;
  /** What it's doing now ("Pixies - Planet Of Sound"), or why it stopped. */
  status: string;
  done: number;
  found: number;
  standIns: number;
  failed: number;
}

type Listener = (state: QueueState) => void;

/**
 * Works through the collection, one item at a time, while it's switched on and the app is open. Screens listen to
 * show progress and new covers.
 */
class ArtworkQueue {
  private state: QueueState = { running: false, status: '', done: 0, found: 0, standIns: 0, failed: 0 };
  private listeners = new Set<Listener>();
  private stopRequested = false;

  getState(): QueueState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(change: Partial<QueueState>) {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  stop() {
    this.stopRequested = true;
  }

  /** Starts working through what's left (does nothing if it's already going, or nothing's switched on). */
  async start(db: SQLiteDatabase): Promise<void> {
    if (this.state.running) {
      return;
    }
    const options = await getLookupOptions(db);
    if (!options.discogs && !options.standIns) {
      this.update({ status: 'Artwork lookups are off (Settings).' });
      return;
    }
    this.stopRequested = false;
    this.update({ running: true, status: 'Starting...', done: 0, found: 0, standIns: 0, failed: 0 });
    // Failures are tried again on the next start, not straight away (they're often a dropped connection).
    const triedThisRun = new Set<string>();
    try {
      while (!this.stopRequested) {
        const batch = (await nextToLookUp(db, 20, { discogs: options.discogs, standIns: options.standIns })).filter((item) => !triedThisRun.has(item.key));
        if (batch.length === 0) {
          break;
        }
        for (const item of batch) {
          if (this.stopRequested) {
            break;
          }
          triedThisRun.add(item.key);
          this.update({ status: `${item.artist} - ${item.title}` });
          const result = await lookUpItem(db, item, options);
          this.update({
            done: this.state.done + 1,
            found: this.state.found + (result === 'this-release' ? 1 : 0),
            standIns: this.state.standIns + (result === 'stand-in' ? 1 : 0),
            failed: this.state.failed + (result === 'failed' ? 1 : 0),
          });
        }
      }
      this.update({ status: this.stopRequested ? 'Paused.' : 'All looked up.' });
    } catch (error) {
      this.update({ status: `Stopped: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      this.update({ running: false });
    }
  }
}

export const artworkQueue = new ArtworkQueue();

/** Switches a lookup on or off; turning one on starts the queue. */
export async function setLookup(db: SQLiteDatabase, setting: typeof SETTING_DISCOGS | typeof SETTING_STANDINS, on: boolean): Promise<void> {
  await setSetting(db, setting, on ? '1' : '0');
  if (on) {
    artworkQueue.start(db);
  }
}
