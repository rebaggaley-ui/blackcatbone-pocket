import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addToPlaylist,
  createPlaylist,
  decodeEntities,
  estimateUnits,
  judge,
  pickMatch,
  quotaDay,
  searchQuery,
  searchVideos,
  songKey,
  songListText,
  songsFor,
  withoutRepeats,
  YouTubeError,
  type Candidate,
} from './youtube.ts';

const single = { key: 'd1-1', artist: 'Gene Chandler', title: 'Get Down / I Did It, I Did It', kind: '7"' as const };
const album = { key: 'd2-1', artist: 'Pixies', title: 'Trompe Le Monde', kind: 'LP' as const };
const tracks = (...list: [string, string][]) => list.map(([position, title]) => ({ position, title, duration: '' }));

test("a single's A side, or both sides, from its tracklist", () => {
  const list = tracks(['A', 'Get Down'], ['B', 'I Did It, I Did It']);
  assert.deepEqual(songsFor(single, list, 'a-sides').map((s) => s.title), ['Get Down']);
  assert.deepEqual(songsFor(single, list, 'both-sides').map((s) => s.title), ['Get Down', 'I Did It, I Did It']);
  // An EP's A side has two tracks; numbered positions give the first track.
  const ep = tracks(['A1', 'One'], ['A2', 'Two'], ['B1', 'Three']);
  assert.deepEqual(songsFor(single, ep, 'a-sides').map((s) => s.title), ['One', 'Two']);
  assert.deepEqual(songsFor(single, tracks(['1', 'First'], ['2', 'Second']), 'a-sides').map((s) => s.title), ['First']);
});

test("with no tracklist: a single's title gives its sides, an album is looked for whole", () => {
  assert.deepEqual(songsFor(single, [], 'a-sides').map((s) => [s.title, s.position]), [['Get Down', 'A']]);
  assert.deepEqual(songsFor(single, [], 'both-sides').map((s) => s.title), ['Get Down', 'I Did It, I Did It']);
  const whole = songsFor(album, [], 'a-sides');
  assert.equal(whole.length, 1);
  assert.equal(whole[0].wholeRecord, true);
  assert.equal(searchQuery(whole[0]), 'Pixies Trompe Le Monde full album');
});

test("an album gives every track whichever sides are chosen; Discogs' (2) comes off the artist", () => {
  const songs = songsFor({ ...album, artist: 'Wings (2)' }, tracks(['A1', 'Jet'], ['A2', 'Bluebird']), 'a-sides');
  assert.deepEqual(songs.map((s) => [s.artist, s.title]), [['Wings', 'Jet'], ['Wings', 'Bluebird']]);
});

test('the same song from two records comes once', () => {
  const a = songsFor(single, [], 'a-sides');
  const b = songsFor({ ...single, key: 'd9-1', artist: 'Gene Chandler (2)' }, [], 'a-sides');
  assert.equal(songKey(a[0]), songKey(b[0]));
  assert.equal(withoutRepeats([...a, ...b]).length, 1);
});

test('the search: artist and song; a compilation by the song alone', () => {
  assert.equal(searchQuery({ artist: 'Soul II Soul Featuring Caron Wheeler', title: 'Back To Life', wholeRecord: false }), 'Soul II Soul Back To Life');
  assert.equal(searchQuery({ artist: 'Various', title: 'Tainted Love', wholeRecord: false }), 'Tainted Love');
});

const song = { artist: 'Pixies', title: 'Planet Of Sound', wholeRecord: false };
const video = (videoId: string, title: string, channel: string): Candidate => ({ videoId, title, channel });

test('how sure a match is', () => {
  assert.equal(judge(song, video('a', 'Pixies - Planet of Sound (Official Video)', 'PixiesVEVO')), 'found');
  assert.equal(judge(song, video('b', 'Planet of Sound', 'Pixies - Topic')), 'found');
  assert.equal(judge(song, video('c', 'Pixies - Planet of Sound (Live at Brixton)', 'Pixies')), 'check');
  assert.equal(judge(song, video('d', 'Planet of Sound', 'Someone Else')), 'check');
  assert.equal(judge(song, video('e', 'Pixies - Velouria', 'Pixies')), null);
  // A song that's itself a live recording isn't marked down for saying so.
  assert.equal(judge({ ...song, title: 'Planet Of Sound (Live)' }, video('f', 'Pixies - Planet of Sound (Live)', 'Pixies')), 'found');
});

test('the best match: confident first, a Topic upload before others, never a different song', () => {
  const results = [
    video('live', 'Pixies - Planet of Sound live', 'fan'),
    video('vevo', 'Pixies - Planet Of Sound', 'PixiesVEVO'),
    video('topic', 'Planet of Sound', 'Pixies - Topic'),
    video('other', 'Pixies - Velouria', 'PixiesVEVO'),
  ];
  const match = pickMatch(song, results);
  assert.equal(match.verdict, 'found');
  assert.equal(match.chosen?.videoId, 'topic');
  assert.deepEqual(match.candidates.map((c) => c.videoId), ['topic', 'live', 'vevo']);
  assert.equal(pickMatch(song, [results[0]]).verdict, 'check');
  assert.deepEqual(pickMatch(song, [results[3]]), { verdict: 'not-there', chosen: null, candidates: [] });
});

test("YouTube's escaped titles", () => {
  assert.equal(decodeEntities('Don&#39;t Stop &amp; Go &quot;Now&quot; &#x2014;'), 'Don\'t Stop & Go "Now" —');
});

test("the day's allowance", () => {
  // 07:59 UTC is still the day before in California.
  assert.equal(quotaDay(new Date('2026-10-19T07:59:00Z')), '2026-10-18');
  assert.equal(quotaDay(new Date('2026-10-19T08:00:00Z')), '2026-10-19');
  assert.equal(estimateUnits(10, 12, true), 10 * 100 + 12 * 50 + 50);
});

test('a list to share', () => {
  assert.equal(songListText('Northern Soul', [{ artist: 'Gene Chandler', title: 'Get Down', wholeRecord: false }]), 'Northern Soul\n\n1. Gene Chandler, Get Down');
});

/** Stands in for YouTube: answers each request with the next reply, and keeps what was asked. */
function fakeFetch(replies: { status: number; json: unknown }[]) {
  const asked: { url: string; method: string; body: unknown; auth: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    asked.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null, auth: String((init.headers as Record<string, string>).Authorization) });
    const reply = replies.shift() ?? { status: 500, json: {} };
    return new Response(JSON.stringify(reply.json), { status: reply.status });
  }) as typeof fetch;
  return asked;
}

test('searching, making a playlist and adding to it', async () => {
  const asked = fakeFetch([
    { status: 200, json: { items: [{ id: { videoId: 'v1' }, snippet: { title: 'Don&#39;t', channelTitle: 'A - Topic' } }, { id: {}, snippet: {} }] } },
    { status: 200, json: { id: 'PL123' } },
    { status: 200, json: {} },
  ]);
  assert.deepEqual(await searchVideos('tok', 'Pixies Planet Of Sound'), [{ videoId: 'v1', title: "Don't", channel: 'A - Topic' }]);
  assert.match(asked[0].url, /search\?part=snippet&type=video&videoCategoryId=10&maxResults=5&q=Pixies\+Planet\+Of\+Sound$/);
  assert.equal(asked[0].auth, 'Bearer tok');
  assert.equal(await createPlaylist('tok', { name: 'Mine', description: 'From my records', privacy: 'unlisted' }), 'PL123');
  assert.deepEqual(asked[1].body, { snippet: { title: 'Mine', description: 'From my records' }, status: { privacyStatus: 'unlisted' } });
  await addToPlaylist('tok', 'PL123', 'v1');
  assert.deepEqual(asked[2].body, { snippet: { playlistId: 'PL123', resourceId: { kind: 'youtube#video', videoId: 'v1' } } });
});

test("YouTube's refusals: out of allowance, signed out", async () => {
  fakeFetch([
    { status: 403, json: { error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } } },
    { status: 401, json: { error: { errors: [{ reason: 'authError' }] } } },
  ]);
  await assert.rejects(searchVideos('tok', 'x'), (error: unknown) => error instanceof YouTubeError && error.outOfQuota && !error.signInNeeded);
  await assert.rejects(addToPlaylist('tok', 'p', 'v'), (error: unknown) => error instanceof YouTubeError && error.signInNeeded);
});
