import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Badge } from '@/components/Badge';
import { Sleeve } from '@/components/Sleeve';
import { getItem, getLookup, listImages, type Item, type ItemImage, type Lookup } from '@/lib/db';
import { cleanArtist, shortCondition } from '@/lib/format';
import { imageUri } from '@/lib/images';
import { getLookupOptions, lookUpItem } from '@/lib/lookups';
import { tell } from '@/lib/notify';
import { addYourPhoto, removeYourPhoto } from '@/lib/photos';
import { colours, space } from '@/lib/theme';

/** One record (or tape, or CD): its pictures, everything your export says about your copy, and its tracks. */
export default function Record() {
  const db = useSQLiteContext();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { width } = useWindowDimensions();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [images, setImages] = useState<ItemImage[]>([]);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let current = true;
    (async () => {
      const [found, pictures, looked] = await Promise.all([getItem(db, key), listImages(db, key), getLookup(db, key)]);
      if (current) {
        setItem(found);
        setImages(pictures);
        setLookup(looked);
      }
    })();
    return () => {
      current = false;
    };
  }, [db, key, revision]);

  const reload = () => setRevision((n) => n + 1);
  const size = Math.min(width - space.xl * 2, 420);

  const addPhoto = useCallback(
    async (from: 'camera' | 'library') => {
      setBusy(from === 'camera' ? 'Taking a photo...' : 'Adding photos...');
      try {
        if ((await addYourPhoto(db, key, from)) > 0) {
          setPage(0); // your photo is the sleeve now, first in the row
          reload();
        }
      } catch (error) {
        tell('Couldn’t add that photo', error instanceof Error ? error.message : String(error));
      } finally {
        setBusy('');
      }
    },
    [db, key]
  );

  const findArtwork = useCallback(async () => {
    if (!item) {
      return;
    }
    const options = await getLookupOptions(db);
    if (!options.discogs && !options.standIns) {
      tell('Artwork lookups are off', 'Switch them on in Settings first (they ask Discogs and MusicBrainz about your records).');
      return;
    }
    setBusy('Looking for artwork...');
    try {
      const result = await lookUpItem(db, item, options);
      reload();
      if (result === 'none') {
        tell('No artwork found', 'Neither Discogs nor MusicBrainz has a picture of this one. You could photograph your copy.');
      } else if (result === 'failed') {
        tell('Couldn’t reach the services', 'Check your connection; it’s tried again later.');
      }
    } finally {
      setBusy('');
    }
  }, [db, item]);

  const confirmRemove = useCallback(
    (image: ItemImage) => {
      const remove = async () => {
        await removeYourPhoto(db, image);
        setPage(0);
        reload();
      };
      if (Platform.OS === 'web') {
        remove();
        return;
      }
      Alert.alert('Remove this photo?', 'It’s taken off this record (and out of the app). Photos in your camera roll aren’t touched.', [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: remove },
      ]);
    },
    [db]
  );

  if (item === undefined) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={colours.text} />
      </View>
    );
  }
  if (item === null) {
    return (
      <View style={styles.centre}>
        <Text style={styles.faded}>{'That record isn’t in your collection any more.'}</Text>
      </View>
    );
  }

  const details: [string, string][] = [
    ['Format', item.format],
    ['Label', item.label],
    ['Catalogue no.', item.catalog],
    ['Released', item.released],
    ['Record', shortCondition(item.mediaCondition) || item.mediaCondition],
    ['Sleeve', shortCondition(item.sleeveCondition) || item.sleeveCondition],
    ['Folder', item.folder],
    ['Added', item.dateAdded.slice(0, 10)],
    ['Rating', item.rating > 0 ? '★'.repeat(item.rating) + '☆'.repeat(Math.max(0, 5 - item.rating)) : ''],
    ['Barcode', lookup?.barcodes.join(', ') ?? ''],
    ['Genres', lookup?.genres.join(', ') ?? ''],
  ];
  const shown = images[Math.min(page, images.length - 1)];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: item.title }} />

      <View style={styles.sleeveWrap}>
        {images.length > 0 ? (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{ width: size, height: size }}
              onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / size))}
            >
              {images.map((image) => (
                <View key={image.id} style={{ width: size, height: size }}>
                  <Image source={{ uri: imageUri(image.file) }} style={[styles.picture, { width: size, height: size }]} contentFit="cover" transition={150} />
                  <View style={styles.badgeCorner}>
                    <Badge kind={image.kind} />
                  </View>
                </View>
              ))}
            </ScrollView>
            {shown ? (
              <Text style={styles.artNote}>
                {shown.kind === 'stand-in'
                  ? `Not your copy: artwork of another pressing, from ${shown.source}.`
                  : shown.kind === 'this-release'
                    ? `This release's photo, from ${shown.source}.`
                    : `Your photo (${shown.source.toLowerCase()}).`}
                {images.length > 1 ? `  ${page + 1} of ${images.length}: swipe for more.` : ''}
              </Text>
            ) : null}
            {shown?.kind === 'your-photo' ? (
              <Pressable onPress={() => confirmRemove(shown)} hitSlop={8}>
                <Text style={styles.remove}>Remove this photo</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Sleeve item={item} size={size} large />
            <Text style={styles.artNote}>
              {lookup && (lookup.discogs === 'none' || lookup.discogs === 'skipped') && lookup.standin !== 'found'
                ? 'No artwork found for this one yet. You could photograph your copy.'
                : 'No artwork yet: a plain sleeve until it’s fetched or you photograph your copy.'}
            </Text>
          </>
        )}
      </View>

      <View style={styles.buttons}>
        <Action label="Take a photo" onPress={() => addPhoto('camera')} disabled={Boolean(busy)} primary />
        <Action label="Choose photos" onPress={() => addPhoto('library')} disabled={Boolean(busy)} />
        {!images.some((image) => image.kind !== 'your-photo') ? <Action label="Find artwork now" onPress={findArtwork} disabled={Boolean(busy)} /> : null}
      </View>
      {busy ? <Text style={styles.faded}>{busy}</Text> : null}

      <Text style={styles.artist}>{cleanArtist(item.artist)}</Text>
      <Text style={styles.title}>{item.title}</Text>
      {item.gone ? <Text style={styles.gone}>{'No longer in your Discogs collection (kept here, with anything you’ve added to it).'}</Text> : null}

      <View style={styles.table}>
        {details
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <View key={label} style={styles.line}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
      </View>

      {lookup && lookup.tracklist.length > 0 ? (
        <View style={styles.table}>
          {lookup.tracklist.map((track, index) => (
            <View key={`${track.position}-${index}`} style={styles.line}>
              <Text style={styles.position}>{track.position}</Text>
              <Text style={styles.value}>{track.title}</Text>
              {track.duration ? <Text style={styles.faded}>{track.duration}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {item.notes ? (
        <View style={styles.notes}>
          <Text style={styles.label}>Your notes</Text>
          <Text style={styles.value}>{item.notes}</Text>
        </View>
      ) : null}

      {item.releaseId ? (
        <Pressable style={styles.link} onPress={() => Linking.openURL(`https://www.discogs.com/release/${item.releaseId}`)}>
          <Text style={styles.linkText}>See this release on Discogs</Text>
          <Text style={styles.faded}>Release {item.releaseId} (opens your browser)</Text>
        </Pressable>
      ) : (
        <Text style={styles.faded}>Not on Discogs: added by you.</Text>
      )}
      <Pressable onPress={() => router.push('/settings')}>
        <Text style={styles.faded}>Artwork settings</Text>
      </Pressable>
    </ScrollView>
  );
}

function Action({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.action, primary && styles.actionPrimary, disabled && styles.actionDisabled]}>
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background },
  content: { padding: space.xl, gap: space.m },
  centre: { flex: 1, backgroundColor: colours.background, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  sleeveWrap: { alignItems: 'center', gap: space.s },
  picture: { borderRadius: 3, backgroundColor: colours.surface },
  badgeCorner: { position: 'absolute', left: space.s, bottom: space.s },
  artNote: { color: colours.faded, fontSize: 12, textAlign: 'center' },
  remove: { color: colours.accent, fontSize: 13, fontWeight: '600' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s, justifyContent: 'center' },
  action: { borderRadius: 8, borderWidth: 1, borderColor: colours.border, paddingHorizontal: space.m, paddingVertical: space.s },
  actionPrimary: { backgroundColor: colours.accent, borderColor: colours.accent },
  actionDisabled: { opacity: 0.4 },
  actionText: { color: colours.text, fontSize: 14, fontWeight: '600' },
  actionTextPrimary: { color: colours.accentText },
  artist: { color: colours.text, fontSize: 22, fontWeight: '700' },
  title: { color: colours.text, fontSize: 18, marginTop: -space.s },
  gone: { color: colours.warning, fontSize: 14 },
  table: { backgroundColor: colours.surface, borderRadius: 8, borderWidth: 1, borderColor: colours.border, paddingVertical: space.xs },
  line: { flexDirection: 'row', paddingHorizontal: space.m, paddingVertical: space.s, gap: space.m },
  label: { color: colours.faded, fontSize: 14, width: 108 },
  position: { color: colours.faded, fontSize: 14, width: 32 },
  value: { color: colours.text, fontSize: 14, flex: 1 },
  notes: { gap: space.xs },
  link: { backgroundColor: colours.raised, borderRadius: 8, padding: space.m, gap: 2 },
  linkText: { color: colours.text, fontSize: 15, fontWeight: '600' },
  faded: { color: colours.faded, fontSize: 13 },
});
