import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/Badge';
import type { Item } from '@/lib/db';
import { cleanArtist, sleeveColour } from '@/lib/format';
import { imageUri } from '@/lib/images';
import { colours } from '@/lib/theme';

interface Props {
  item: Item;
  size: number;
  /** Bigger lettering, for the record's own page. */
  large?: boolean;
}

/**
 * A record's sleeve: your photo, else Discogs' photo of this release, else a stand-in (marked "Not your copy"), else
 * a plain sleeve in a colour of its own with the artist and title on it, so it's never mistaken for a real picture.
 */
export function Sleeve({ item, size, large }: Props) {
  if (item.cover) {
    return (
      <View style={[styles.sleeve, styles.pictured, { width: size, height: size }]}>
        <Image source={{ uri: imageUri(item.cover.file) }} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.key} transition={150} />
        {item.cover.kind === 'stand-in' || large ? (
          <View style={styles.badgeCorner}>
            <Badge kind={item.cover.kind} small={!large} />
          </View>
        ) : null}
        {item.gone ? <Text style={styles.gone}>GONE FROM DISCOGS</Text> : null}
      </View>
    );
  }
  const isRecord = item.kind === '7"' || item.kind === '10"' || item.kind === '12"' || item.kind === 'LP';
  return (
    <View style={[styles.sleeve, { width: size, height: size, backgroundColor: sleeveColour(item.artist + item.title) }]}>
      {isRecord ? <View style={[styles.hole, { width: size * 0.16, height: size * 0.16, borderRadius: size * 0.08, left: size * 0.42, top: size * 0.42 }]} /> : null}
      <Text style={[styles.kind, large && styles.kindLarge]}>{item.kind}</Text>
      <View style={styles.words}>
        <Text style={[styles.artist, large && styles.artistLarge]} numberOfLines={large ? 3 : 2}>
          {cleanArtist(item.artist)}
        </Text>
        <Text style={[styles.title, large && styles.titleLarge]} numberOfLines={large ? 3 : 2}>
          {item.title}
        </Text>
      </View>
      {item.gone ? <Text style={styles.gone}>GONE FROM DISCOGS</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sleeve: {
    borderRadius: 3,
    padding: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  pictured: { backgroundColor: colours.surface, justifyContent: 'flex-end' },
  badgeCorner: { position: 'absolute', left: 4, bottom: 4 },
  hole: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  kind: {
    alignSelf: 'flex-start',
    color: colours.text,
    backgroundColor: 'rgba(0,0,0,0.35)',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  kindLarge: { fontSize: 13 },
  words: { gap: 2 },
  artist: { color: colours.text, fontSize: 11, fontWeight: '700' },
  artistLarge: { fontSize: 20 },
  title: { color: colours.text, fontSize: 11, opacity: 0.85 },
  titleLarge: { fontSize: 17 },
  gone: {
    position: 'absolute',
    top: 8,
    right: 8,
    color: colours.warning,
    fontSize: 8,
    fontWeight: '700',
  },
});
