import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportDate, formatText, joinArtists, toRow } from './discogsCollection.ts';

test('artists as on the sleeve', () => {
  assert.equal(joinArtists([{ name: 'Soul II Soul', join: 'Featuring' }, { name: 'Caron Wheeler', join: '' }]), 'Soul II Soul Featuring Caron Wheeler');
  assert.equal(joinArtists([{ name: 'Eric B.', join: '&' }, { name: 'Rakim' }]), 'Eric B. & Rakim');
  assert.equal(joinArtists([{ name: 'A', join: ',' }, { name: 'B' }]), 'A, B');
});

test('formats as the export writes them', () => {
  assert.equal(formatText([{ name: 'Vinyl', qty: '1', descriptions: ['7"', '45 RPM'] }]), '7"');
  assert.equal(formatText([{ name: 'Vinyl', qty: '2', descriptions: ['7"', 'Single'] }]), '2x7", Single');
  assert.equal(formatText([{ name: 'CD', qty: '1', descriptions: ['Album'] }]), 'CD, Album');
  assert.equal(formatText([{ name: 'Vinyl', qty: '6', descriptions: ['7"'] }, { name: 'Box Set', qty: '1', descriptions: ['Compilation'] }]), '6x7" + Box, Comp');
});

test('formats: sizes first, LP dropped with a size, no speeds or Stereo', () => {
  assert.equal(formatText([{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album', 'Stereo'] }]), 'LP, Album');
  assert.equal(formatText([{ name: 'Vinyl', qty: '2', descriptions: ['LP', 'Compilation', 'Reissue'] }]), '2xLP, Comp, RE');
  assert.equal(formatText([{ name: 'Vinyl', qty: '1', descriptions: ['LP', '12"', '33 ⅓ RPM', 'Album'] }]), '12", Album');
  assert.equal(formatText([{ name: 'Vinyl', qty: '1', descriptions: ['Single', '12"', '45 RPM', 'Reissue'] }]), '12", Single, RE');
  assert.equal(formatText([{ name: 'Vinyl', qty: '1', descriptions: ['Album'] }]), 'Vinyl, Album');
  assert.equal(formatText([{ name: 'Cassette', qty: '1', descriptions: ['Album', 'Stereo'] }]), 'Cass, Album');
});

test('formats: Discogs short forms, free text cut to 3 letters, 50 characters at most', () => {
  assert.equal(
    formatText([{ name: 'Vinyl', qty: '1', descriptions: ['7"', '45 RPM', 'Single Sided', 'Promo', 'White Label'] }]),
    '7", S/Sided, Promo, W/Lbl'
  );
  assert.equal(formatText([{ name: 'Vinyl', qty: '1', descriptions: ['7"', 'Single'], text: 'Boxed Decca' }]), '7", Single, Box');
  assert.equal(formatText([{ name: 'Vinyl', qty: '6', descriptions: ['7"', 'Single', 'Reissue', 'Remastered'] }, { name: 'Box Set', qty: '1', descriptions: ['Compilation', 'Limited Edition'] }]), '6x7", Single, RE, RM + Box, Comp, Ltd');
  const long = formatText([
    { name: 'Vinyl', qty: '4', descriptions: ['LP', 'Compilation', 'Limited Edition', 'Numbered', 'Reissue', 'Remastered'] },
    { name: 'Box Set', qty: '1', descriptions: ['Compilation', 'Deluxe Edition', 'Numbered', 'Promo'] },
  ]);
  assert.equal(long.length, 50);
  assert.ok(long.startsWith('4xLP, Comp, Ltd, Num, RE, RM + Box'));
});

test('dates as the export writes them', () => {
  assert.equal(exportDate('2022-04-11T13:39:54-07:00'), '2022-04-11 13:39:54');
});

test('one release from the collection, with your fields and folder', () => {
  const row = toRow(
    {
      id: 2154424,
      date_added: '2022-04-11T13:39:54-07:00',
      rating: 4,
      folder_id: 7,
      notes: [
        { field_id: 1, value: 'Very Good Plus (VG+)' },
        { field_id: 2, value: 'Good (G)' },
        { field_id: 3, value: 'Worn sleeve' },
      ],
      basic_information: {
        title: 'Crime / Improve Yourself',
        year: 1980,
        artists: [{ name: 'DeBow', join: '' }],
        labels: [{ name: 'Not On Label', catno: '41015' }, { name: 'Other', catno: '41015' }],
        formats: [{ name: 'Vinyl', qty: '1', descriptions: ['7"', '45 RPM'] }],
      },
    },
    { folders: new Map([[7, 'Northern Soul']]), fields: new Map([[1, 'Media Condition'], [2, 'Sleeve Condition'], [3, 'Notes']]) }
  );
  assert.ok(row);
  assert.equal(row.catalog, '41015');
  assert.equal(row.label, 'Not On Label, Other');
  assert.equal(row.format, '7"');
  assert.equal(row.released, '1980');
  assert.equal(row.folder, 'Northern Soul');
  assert.equal(row.dateAdded, '2022-04-11 13:39:54');
  assert.equal(row.mediaCondition, 'Very Good Plus (VG+)');
  assert.equal(row.sleeveCondition, 'Good (G)');
  assert.equal(row.notes, 'Worn sleeve');
});

test('without your token: no fields, folder 1 is Uncategorized', () => {
  const row = toRow({ id: 1, folder_id: 1, basic_information: { title: 'T', year: 0 } }, { folders: new Map([[1, 'Uncategorized']]), fields: new Map() });
  assert.equal(row?.folder, 'Uncategorized');
  assert.equal(row?.released, '');
  assert.equal(row?.notes, '');
});
