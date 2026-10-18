import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { importFromDiscogs, shareCollectionCsv } from './collectionSources';
import { describeImport, pickAndImportCsv } from './importCsv';
import { artworkQueue } from './lookups';
import { tell } from './notify';

/**
 * Bringing your collection in (from Discogs, or from an export file) and saving it as a CSV, with what's happening
 * now for the screen to show. `onChanged` runs after an import, to show the collection afresh.
 */
export function useCollectionActions(onChanged: () => void) {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState('');

  const run = useCallback(
    async (what: string, failTitle: string, action: () => Promise<void>) => {
      setBusy(what);
      try {
        await action();
      } catch (error) {
        console.error(error);
        tell(failTitle, error instanceof Error ? error.message : String(error));
      } finally {
        setBusy('');
      }
    },
    []
  );

  const fromDiscogs = useCallback(
    () =>
      run('Bringing your collection in from Discogs...', 'Couldn’t bring it in from Discogs', async () => {
        const summary = await importFromDiscogs(db, (progress) =>
          setBusy(`Bringing your collection in from Discogs: page ${progress.page} of ${progress.pages} (${progress.items.toLocaleString()} records)`)
        );
        onChanged();
        tell('Collection brought in from Discogs', describeImport(summary));
        artworkQueue.start(db); // any new records' artwork, if that's on
      }),
    [db, onChanged, run]
  );

  const fromCsv = useCallback(
    () =>
      run('Importing...', 'Couldn’t import that file', async () => {
        const summary = await pickAndImportCsv(db);
        if (summary) {
          onChanged();
          tell('Collection imported', describeImport(summary));
          artworkQueue.start(db);
        }
      }),
    [db, onChanged, run]
  );

  const saveCsv = useCallback(
    () =>
      run('Saving your collection as a CSV...', 'Couldn’t save it', async () => {
        await shareCollectionCsv(db);
      }),
    [db, run]
  );

  return { busy, fromDiscogs, fromCsv, saveCsv };
}
