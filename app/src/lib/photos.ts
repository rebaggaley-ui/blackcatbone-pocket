import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';
import { addImage, deleteImage, type ItemImage } from './db';
import { deleteImageFile, keepPhoto } from './images';

/**
 * Photographing your own copy (or choosing a photo you've taken): it becomes that item's sleeve, marked "Your copy".
 * Returns how many were added (0 if you cancelled); throws with a message if the phone said no.
 */
export async function addYourPhoto(db: SQLiteDatabase, itemKey: string, from: 'camera' | 'library'): Promise<number> {
  if (from === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('The camera isn’t allowed for this app. You can allow it in your phone’s Settings.');
    }
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.8 };
  const result =
    from === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: true, selectionLimit: 10 });
  if (result.canceled || !result.assets) {
    return 0;
  }
  for (const asset of result.assets) {
    const file = await keepPhoto(asset.uri, itemKey);
    await addImage(db, { itemKey, kind: 'your-photo', file, source: from === 'camera' ? 'Camera' : 'Photo library', sourceUrl: '' });
  }
  return result.assets.length;
}

/** Takes away one of your photos (the file too). Fetched artwork is managed by the lookups. */
export async function removeYourPhoto(db: SQLiteDatabase, image: ItemImage): Promise<void> {
  await deleteImage(db, image.id);
  deleteImageFile(image.file);
}
