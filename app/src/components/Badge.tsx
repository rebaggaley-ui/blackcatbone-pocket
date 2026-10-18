import { StyleSheet, Text } from 'react-native';
import type { ImageKind } from '@/lib/db';

const LABELS: Record<ImageKind, string> = {
  'your-photo': 'Your copy',
  'this-release': 'This release',
  'stand-in': 'Not your copy',
};

/** Where a picture's from, on the picture: a stand-in is never mistaken for your copy. */
export function Badge({ kind, small }: { kind: ImageKind; small?: boolean }) {
  return <Text style={[styles.badge, styles[kind], small && styles.small]}>{LABELS[kind]}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  small: { fontSize: 9, paddingHorizontal: 4, paddingVertical: 1 },
  'your-photo': { backgroundColor: '#2f6b3a', color: '#ffffff' },
  'this-release': { backgroundColor: 'rgba(0,0,0,0.6)', color: '#ede6d3' },
  'stand-in': { backgroundColor: '#d9a441', color: '#1a1408' },
});
