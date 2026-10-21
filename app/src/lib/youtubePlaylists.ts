import type { SQLiteDatabase } from 'expo-sqlite';
import {
  addPlaylist,
  getPlaylist,
  getSavedMatch,
  getSetting,
  saveMatch,
  setSetting,
  updatePlaylist,
  type PlaylistSong,
  type SavedPlaylist,
} from './db';
import { refreshGoogleSignIn, type GoogleAccount } from './googleSignIn';
import {
  addToPlaylist,
  COST,
  createPlaylist,
  DAILY_UNITS,
  pickMatch,
  renamePlaylist,
  quotaDay,
  searchQuery,
  searchVideos,
  songKey,
  YouTubeError,
  type Match,
  type Privacy,
  type Song,
} from './youtube';

/**
 * Making a YouTube playlist from your records: each song searched for once (and remembered), within Google's daily
 * allowance, and the playlist saved here as it's made, so one that runs out of allowance carries on the next day.
 */

const SETTING_QUOTA = 'youtube.quota';

const DESCRIPTION = 'Made from my record collection with BlackCatBone Pocket.';

/** Units used today (as the app counts them: Google's own count is in its console). */
export async function unitsUsedToday(db: SQLiteDatabase): Promise<number> {
  try {
    const saved = JSON.parse((await getSetting(db, SETTING_QUOTA)) ?? '{}') as { day?: string; used?: number };
    return saved.day === quotaDay() ? (saved.used ?? 0) : 0;
  } catch {
    return 0;
  }
}

async function spendUnits(db: SQLiteDatabase, units: number): Promise<void> {
  const used = Math.min(DAILY_UNITS, (await unitsUsedToday(db)) + units);
  await setSetting(db, SETTING_QUOTA, JSON.stringify({ day: quotaDay(), used }));
}

/** Google says today's allowance is gone (whatever the app counted). */
async function allowanceGone(db: SQLiteDatabase): Promise<void> {
  await setSetting(db, SETTING_QUOTA, JSON.stringify({ day: quotaDay(), used: DAILY_UNITS }));
}

export async function unitsLeftToday(db: SQLiteDatabase): Promise<number> {
  return Math.max(0, DAILY_UNITS - (await unitsUsedToday(db)));
}

/** Which of these songs have been searched for before (and cost nothing now). */
export async function countUnsearched(db: SQLiteDatabase, songs: Song[]): Promise<number> {
  let count = 0;
  for (const song of songs) {
    if (!(await getSavedMatch(db, songKey(song)))) {
      count++;
    }
  }
  return count;
}

/** A YouTube call with the sign-in, signing in again once if it's run out. */
async function withAccount<T>(account: GoogleAccount, run: (token: string) => Promise<T>): Promise<T> {
  try {
    return await run(account.accessToken);
  } catch (error) {
    if (error instanceof YouTubeError && error.signInNeeded) {
      const fresh = await refreshGoogleSignIn(account.accessToken);
      if (fresh) {
        account.accessToken = fresh.accessToken;
        return run(fresh.accessToken);
      }
    }
    throw error;
  }
}

export interface FoundSong {
  song: Song;
  match: Match;
}

export interface FindResult {
  found: FoundSong[];
  /** Songs not searched for yet because today's allowance ran out. */
  waiting: Song[];
}

/**
 * Finds each song on YouTube: a search made before is reused; a new one costs 100 units, so it stops (and says how
 * many are waiting) when today's allowance runs out, leaving what's needed to make the playlist.
 */
export async function findOnYouTube(
  db: SQLiteDatabase,
  account: GoogleAccount,
  songs: Song[],
  progress: (done: number, song: Song) => void,
  stopped: () => boolean
): Promise<FindResult> {
  const found: FoundSong[] = [];
  const waiting: Song[] = [];
  for (const [n, song] of songs.entries()) {
    if (stopped()) {
      waiting.push(...songs.slice(n));
      break;
    }
    progress(n, song);
    const key = songKey(song);
    const saved = await getSavedMatch(db, key);
    if (saved) {
      found.push({ song, match: { verdict: saved.verdict, chosen: saved.candidates[0] ?? null, candidates: saved.candidates } });
      continue;
    }
    // Keep enough for the playlist and the songs found so far.
    const reserve = COST.insert * (found.length + 2);
    if ((await unitsLeftToday(db)) < COST.search + reserve) {
      waiting.push(...songs.slice(n));
      break;
    }
    try {
      const results = await withAccount(account, (token) => searchVideos(token, searchQuery(song)));
      await spendUnits(db, COST.search);
      const match = pickMatch(song, results);
      await saveMatch(db, key, { verdict: match.verdict, candidates: match.candidates });
      found.push({ song, match });
    } catch (error) {
      if (error instanceof YouTubeError && error.outOfQuota) {
        await allowanceGone(db);
        waiting.push(...songs.slice(n));
        break;
      }
      throw error;
    }
  }
  return { found, waiting };
}

/** Puts back what you chose for a song (another of the search's videos), so it's the first choice next time. */
export async function rememberChoice(db: SQLiteDatabase, found: FoundSong, videoId: string): Promise<void> {
  const chosen = found.match.candidates.find((c) => c.videoId === videoId);
  if (!chosen) {
    return;
  }
  await saveMatch(db, songKey(found.song), {
    verdict: 'found',
    candidates: [chosen, ...found.match.candidates.filter((c) => c.videoId !== videoId)],
  });
}

export interface MakeResult {
  playlist: SavedPlaylist;
  added: number;
  /** Songs not added yet because today's allowance ran out ("Carry on" adds them). */
  left: number;
}

/** Saves the playlist here, then makes it on YouTube and adds its songs. */
export async function makeYouTubePlaylist(
  db: SQLiteDatabase,
  account: GoogleAccount,
  playlist: { name: string; privacy: Privacy; songs: PlaylistSong[] },
  progress: (added: number, total: number) => void
): Promise<MakeResult> {
  const id = await addPlaylist(db, playlist);
  return carryOnPlaylist(db, account, id, progress);
}

/** Makes the playlist on YouTube if it isn't there yet, then adds the songs it hasn't got. */
export async function carryOnPlaylist(db: SQLiteDatabase, account: GoogleAccount, id: number, progress: (added: number, total: number) => void): Promise<MakeResult> {
  const playlist = await getPlaylist(db, id);
  if (!playlist) {
    throw new Error('That playlist isn’t saved on this phone any more.');
  }
  const songs = playlist.songs.map((song) => ({ ...song }));
  let added = 0;
  const result = async (): Promise<MakeResult> => {
    const saved = (await getPlaylist(db, id)) ?? playlist;
    return { playlist: saved, added, left: saved.songs.filter((song) => !song.added).length };
  };
  try {
    let remoteId = playlist.remoteId;
    if (!remoteId) {
      remoteId = await withAccount(account, (token) =>
        createPlaylist(token, { name: playlist.name, description: DESCRIPTION, privacy: playlist.privacy })
      );
      await spendUnits(db, COST.insert);
      await updatePlaylist(db, id, { remoteId });
    }
    for (const song of songs) {
      if (song.added) {
        continue;
      }
      progress(songs.filter((s) => s.added).length, songs.length);
      await withAccount(account, (token) => addToPlaylist(token, remoteId, song.videoId));
      await spendUnits(db, COST.insert);
      song.added = true;
      added++;
      await updatePlaylist(db, id, { songs });
    }
  } catch (error) {
    if (error instanceof YouTubeError && error.outOfQuota) {
      await allowanceGone(db);
      return result();
    }
    throw error;
  }
  return result();
}

/** A new name for a saved playlist, here and on YouTube (if it's been made there yet). */
export async function renameYouTubePlaylist(db: SQLiteDatabase, account: GoogleAccount, id: number, name: string): Promise<void> {
  const playlist = await getPlaylist(db, id);
  const clean = name.trim();
  if (!playlist || !clean || clean === playlist.name) {
    return;
  }
  if (playlist.remoteId) {
    try {
      await withAccount(account, (token) => renamePlaylist(token, playlist.remoteId, { name: clean, description: DESCRIPTION }));
    } catch (error) {
      if (error instanceof YouTubeError && error.outOfQuota) {
        await allowanceGone(db);
      }
      throw error;
    }
    await spendUnits(db, COST.insert);
  }
  await updatePlaylist(db, id, { name: clean });
}
