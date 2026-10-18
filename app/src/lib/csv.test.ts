import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parseCsv, parseDiscogsCollection } from './csv.ts';
import { getMediaKind, shortCondition, cleanArtist } from './format.ts';

const HEADER = 'Catalog#,Artist,Title,Label,Format,Rating,Released,release_id,CollectionFolder,Date Added,Collection Media Condition,Collection Sleeve Condition,Collection Notes';

test('quoted fields, doubled quotes, CRLF and a byte-order mark', () => {
  const rows = parseCsv('﻿a,"b, c","say ""hi"""\r\n1,2,3\r\n');
  assert.deepEqual(rows, [['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
});

test('a line break inside quotes stays in the field', () => {
  assert.deepEqual(parseCsv('a,"two\nlines"\nb,c'), [['a', 'two\nlines'], ['b', 'c']]);
});

test('reads a Discogs export, numbering second copies of a release', () => {
  const text = `${HEADER}\nTEN 385,System 7,Miracle,10 Records,"7"", S/Sided, Promo, W/Lbl",,1991,852086,Uncategorized,2022-04-13 16:51:19,Very Good (VG),Good (G),\nTEN 385,System 7,Miracle,10 Records,"7"", S/Sided, Promo, W/Lbl",,1991,852086,Uncategorized,2022-04-14 10:00:00,Mint (M),,spare`;
  const { rows, skipped } = parseDiscogsCollection(text);
  assert.equal(rows.length, 2);
  assert.equal(skipped.length, 0);
  assert.equal(rows[0].format, '7", S/Sided, Promo, W/Lbl');
  assert.equal(rows[0].key, 'd852086-1');
  assert.equal(rows[1].key, 'd852086-2');
  assert.equal(rows[1].notes, 'spare');
});

test("says so when the file isn't a Discogs export", () => {
  assert.throws(() => parseDiscogsCollection('name,email\nx,y'), /Discogs collection export/);
});

test('media kinds and conditions', () => {
  assert.equal(getMediaKind('7", Single'), '7"');
  assert.equal(getMediaKind('12", Single, RE'), '12"');
  assert.equal(getMediaKind('LP, Album'), 'LP');
  assert.equal(getMediaKind('Cass, Album'), 'Cassette');
  assert.equal(getMediaKind('CD, Album, RE'), 'CD');
  assert.equal(getMediaKind('Box Set, Comp + 4xLP'), 'Box set');
  assert.equal(getMediaKind('6x7", Single, RE, RM + Box, Comp, Ltd'), 'Box set');
  assert.equal(getMediaKind('7", Single, Box'), '7"'); // "Boxed Decca" cut short by the export
  assert.equal(getMediaKind('Box Set, Comp'), 'Box set');
  assert.equal(getMediaKind('5x7", Album, Jukebox'), '7"');
  assert.equal(shortCondition('Very Good Plus (VG+)'), 'VG+');
  assert.equal(cleanArtist('Madonna (2)'), 'Madonna');
});

// A real export, when there's one in the project's test-data folder (outside the app, so it's never in its git).
const testData = '../test-data';
const found = existsSync(testData) ? readdirSync(testData).find((name) => name.toLowerCase().endsWith('.csv')) : undefined;
const real = found ? `${testData}/${found}` : '';
test('your export reads in full', { skip: !real }, () => {
  const { rows, skipped } = parseDiscogsCollection(readFileSync(real, 'utf8'));
  const kinds = new Map<string, number>();
  for (const row of rows) {
    kinds.set(getMediaKind(row.format), (kinds.get(getMediaKind(row.format)) ?? 0) + 1);
  }
  console.log(`  ${rows.length} items, ${skipped.length} skipped; ${[...kinds].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  assert.ok(rows.length > 1000);
  assert.equal(skipped.length, 0);
  assert.equal(new Set(rows.map((r) => r.key)).size, rows.length);
});

test('saving as an export reads back the same', async () => {
  const { toDiscogsCsv } = await import('./csv.ts');
  const text = `${HEADER}\nTEN 385,System 7,Miracle,10 Records,"7"", S/Sided, Promo, W/Lbl",,1991,852086,Uncategorized,2022-04-13 16:51:19,Very Good (VG),Good (G),"Notes, with ""quotes"""`;
  const first = parseDiscogsCollection(text).rows;
  const again = parseDiscogsCollection(toDiscogsCsv(first)).rows;
  assert.deepEqual(again, first);
});

test('your whole export survives being saved and read again', { skip: !real }, async () => {
  const { toDiscogsCsv } = await import('./csv.ts');
  const first = parseDiscogsCollection(readFileSync(real, 'utf8')).rows;
  assert.deepEqual(parseDiscogsCollection(toDiscogsCsv(first)).rows, first);
});
