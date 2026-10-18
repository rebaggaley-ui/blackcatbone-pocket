import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverArtUrl, mainArtist, mainTitle, musicBrainzQuery, normalise, parseDiscogsRelease, pickReleaseGroups } from './artwork.ts';

test("a Discogs release: primary photo first, tracks only, barcodes as digits", () => {
  const release = parseDiscogsRelease({
    images: [
      { type: 'secondary', uri: 'https://i.discogs.com/back.jpg' },
      { type: 'primary', uri: 'https://i.discogs.com/front.jpg' },
      { type: 'secondary', uri: '' },
    ],
    tracklist: [
      { position: '', title: 'Side One', type_: 'heading' },
      { position: 'A', title: 'Planet Of Sound', duration: '2:05', type_: 'track' },
      { position: 'B', title: 'Build High', duration: '1:44', type_: 'track' },
    ],
    identifiers: [
      { type: 'Barcode', value: '5 014436 100871' },
      { type: 'Barcode', value: '5014436100871' },
      { type: 'Matrix / Runout', value: 'AD 1008 A' },
    ],
    genres: ['Rock'],
    styles: ['Indie Rock'],
  });
  assert.deepEqual(release.images, ['https://i.discogs.com/front.jpg', 'https://i.discogs.com/back.jpg']);
  assert.deepEqual(release.tracklist.map((t) => t.title), ['Planet Of Sound', 'Build High']);
  assert.deepEqual(release.barcodes, ['5014436100871']);
  assert.deepEqual(release.genres, ['Rock', 'Indie Rock']);
});

test('a release with nothing in it', () => {
  assert.deepEqual(parseDiscogsRelease({}), { images: [], tracklist: [], barcodes: [], genres: [] });
  assert.deepEqual(parseDiscogsRelease(null).images, []);
});

test('names and titles for matching', () => {
  assert.equal(normalise('The Beatles'), 'beatles');
  assert.equal(normalise('Eric B. & Rakim'), 'eric b and rakim');
  assert.equal(normalise('Wings (2)'), 'wings');
  assert.equal(normalise('Café Society'), 'cafe society');
  assert.equal(mainTitle('Back To Life (Club Mix)'), 'Back To Life');
  assert.equal(mainTitle('Hit The Road Jack / The Danger Zone'), 'Hit The Road Jack');
  assert.equal(mainArtist('Soul II Soul Featuring Caron Wheeler'), 'Soul II Soul');
  assert.equal(mainArtist('Wings (2)'), 'Wings');
});

test('the MusicBrainz search', () => {
  assert.equal(musicBrainzQuery('Pixies', 'Planet Of Sound'), 'releasegroup:"Planet Of Sound" AND artist:"Pixies"');
  assert.equal(musicBrainzQuery('Various', 'The Great British Psychedelic Box'), 'releasegroup:"The Great British Psychedelic Box"');
  assert.equal(musicBrainzQuery('A "B"', 'C'), 'releasegroup:"C" AND artist:"A \\"B\\""');
});

test('only release groups that really are the record become stand-ins', () => {
  const search = {
    'release-groups': [
      { id: 'right', score: 100, title: 'Planet of Sound', 'artist-credit': [{ name: 'Pixies' }] },
      { id: 'cover-version', score: 95, title: 'Planet of Sound', 'artist-credit': [{ name: 'Someone Else' }] },
      { id: 'other-title', score: 92, title: 'Planet of Sound (live)', 'artist-credit': [{ name: 'Pixies' }] },
      { id: 'low-score', score: 60, title: 'Planet of Sound', 'artist-credit': [{ name: 'Pixies' }] },
    ],
  };
  assert.deepEqual(pickReleaseGroups(search, 'Pixies', 'Planet Of Sound'), ['right', 'other-title']);
  assert.deepEqual(pickReleaseGroups({}, 'Pixies', 'Planet Of Sound'), []);
});

test('the Cover Art Archive address', () => {
  assert.equal(coverArtUrl('abc'), 'https://coverartarchive.org/release-group/abc/front-500');
});
