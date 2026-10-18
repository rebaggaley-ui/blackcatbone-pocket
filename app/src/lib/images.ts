import { Directory, File, Paths } from 'expo-file-system';

/**
 * Pictures live in the app's own folder: artwork/ for what's fetched, photos/ for yours. The database keeps only
 * "artwork/d705435-1-discogs.jpg"-style names, since the folder's full path can change when the app is updated.
 */
type Folder = 'artwork' | 'photos';

function folder(name: Folder): Directory {
  const dir = new Directory(Paths.document, name);
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** Where a picture is, for showing it. */
export function imageUri(file: string): string {
  return new File(Paths.document, file).uri;
}

/** A file-safe name from an item's key. */
function safe(key: string): string {
  return key.replace(/[^A-Za-z0-9-]/g, '_');
}

/** Fetches a picture from the web into artwork/; returns its stored name. */
export async function downloadArtwork(url: string, itemKey: string, source: 'discogs' | 'standin', headers: Record<string, string>): Promise<string> {
  const name = `${safe(itemKey)}-${source}.jpg`;
  const target = new File(folder('artwork'), name);
  await File.downloadFileAsync(url, target, { headers, idempotent: true });
  return `artwork/${name}`;
}

/** Keeps a photo you took or chose (copied, so it stays even if you delete it from your camera roll); returns its stored name. */
export async function keepPhoto(fromUri: string, itemKey: string): Promise<string> {
  const name = `${safe(itemKey)}-${Date.now()}.jpg`;
  const target = new File(folder('photos'), name);
  await new File(fromUri).copy(target, { overwrite: true });
  return `photos/${name}`;
}

export function deleteImageFile(file: string): void {
  try {
    const target = new File(Paths.document, file);
    if (target.exists) {
      target.delete();
    }
  } catch {
    // Already gone: nothing to do.
  }
}

/** Empties artwork/ (not your photos), when the lookups are run again from scratch. */
export function clearFetchedArtwork(): void {
  const dir = new Directory(Paths.document, 'artwork');
  if (dir.exists) {
    dir.delete();
  }
}
