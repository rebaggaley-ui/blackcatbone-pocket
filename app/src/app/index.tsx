import { Link, router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Sleeve } from '@/components/Sleeve';
import { countByKind, listItems, type Item, type SortRule } from '@/lib/db';
import { MEDIA_KINDS, type MediaKind } from '@/lib/format';
import { getDiscogsUsername } from '@/lib/collectionSources';
import { artworkQueue, getDiscogsToken } from '@/lib/lookups';
import { useCollectionActions } from '@/lib/useCollectionActions';
import { colours, space } from '@/lib/theme';

const SORTS: { rule: SortRule; label: string }[] = [
  { rule: 'artist', label: 'A-Z' },
  { rule: 'added', label: 'Newest' },
  { rule: 'year', label: 'Year' },
  { rule: 'label', label: 'Label' },
];

const COLUMNS = 3;

/** Your collection: every record, tape and CD from your Discogs export, as sleeves, with search and filters. */
export default function Collection() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Partial<Record<MediaKind, number>>>({});
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<MediaKind | null>(null);
  const [sort, setSort] = useState<SortRule>('artist');
  /** Whether there's a Discogs account to bring the collection in from (a token, or a username for a public one). */
  const [hasAccount, setHasAccount] = useState(false);
  /** Bumped after an import, to read the collection again. */
  const [revision, setRevision] = useState(0);
  const queue = useSyncExternalStore(
    (listener) => artworkQueue.subscribe(listener),
    () => artworkQueue.getState()
  );

  // New covers show up as they're found: the grid's read again every few seconds while the lookups run.
  useEffect(() => {
    if (queue.done === 0) {
      return;
    }
    const timer = setTimeout(() => setRevision((n) => n + 1), queue.running ? 3000 : 0);
    return () => clearTimeout(timer);
  }, [queue.done, queue.running]);

  useEffect(() => {
    let current = true;
    (async () => {
      const [found, byKind] = await Promise.all([listItems(db, { search, kind, sort }), countByKind(db)]);
      // A newer search may have started while this one ran: only the latest is shown.
      if (current) {
        setItems(found);
        setCounts(byKind);
      }
    })();
    return () => {
      current = false;
    };
  }, [db, search, kind, sort, revision]);

  useEffect(() => {
    let current = true;
    (async () => {
      const [token, username] = await Promise.all([getDiscogsToken(), getDiscogsUsername(db)]);
      if (current) {
        setHasAccount(Boolean(token || username));
      }
    })();
    return () => {
      current = false;
    };
  }, [db, revision]);

  const reload = useCallback(() => setRevision((n) => n + 1), []);
  const { busy, fromDiscogs, fromCsv, saveCsv } = useCollectionActions(reload);

  /** Update: from Discogs (if there's an account), from a file, or save it as a CSV. */
  const update = useCallback(() => {
    if (Platform.OS === 'web') {
      fromCsv();
      return;
    }
    Alert.alert('Your collection', 'Bring in what’s new, or save it as a CSV (for the game, or anywhere else).', [
      hasAccount ? { text: 'Update from Discogs', onPress: fromDiscogs } : { text: 'Connect to Discogs...', onPress: () => router.push('/settings') },
      { text: 'Import a CSV file', onPress: fromCsv },
      { text: 'Save as a CSV file', onPress: saveCsv },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [fromCsv, fromDiscogs, hasAccount, saveCsv]);

  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const tile = (width - space.m * (COLUMNS + 1)) / COLUMNS;
  const kinds = MEDIA_KINDS.filter((k) => (counts[k] ?? 0) > 0);

  const header = (
    <Stack.Screen
      options={{
        headerRight: () => (
          <View style={styles.headerButtons}>
            {total > 0 ? (
              <Pressable onPress={update} disabled={Boolean(busy)} hitSlop={12}>
                <Text style={styles.headerButton}>{busy ? 'Working...' : 'Update'}</Text>
              </Pressable>
            ) : null}
            {total > 0 ? (
              <Pressable onPress={() => router.push('/playlist')} hitSlop={12}>
                <Text style={styles.headerButton}>Playlist</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => router.push('/settings')} hitSlop={12}>
              <Text style={styles.headerButton}>Settings</Text>
            </Pressable>
          </View>
        ),
      }}
    />
  );

  if (items === null) {
    return (
      <View style={styles.centre}>
        {header}
        <ActivityIndicator color={colours.text} />
      </View>
    );
  }

  if (total === 0) {
    return (
      <View style={styles.centre}>
        {header}
        <Text style={styles.emptyTitle}>Bring your records in</Text>
        <Text style={styles.emptyText}>
          {hasAccount
            ? 'Straight from your Discogs collection, or from an export file if you have one.'
            : 'Connect to Discogs (it takes a minute: the app shows you where to get your token), or choose an export file if you have one.'}
        </Text>
        <Pressable
          style={[styles.button, Boolean(busy) && styles.buttonBusy]}
          onPress={hasAccount ? fromDiscogs : () => router.push('/settings')}
          disabled={Boolean(busy)}
        >
          <Text style={styles.buttonText}>{hasAccount ? 'Bring in from Discogs' : 'Connect to Discogs'}</Text>
        </Pressable>
        <Pressable onPress={fromCsv} disabled={Boolean(busy)} hitSlop={8}>
          <Text style={styles.secondary}>Choose an export file (CSV) instead</Text>
        </Pressable>
        {busy ? <Text style={styles.small}>{busy}</Text> : null}
        <Text style={styles.small}>Your collection stays on your phone.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <View style={styles.tools}>
        <TextInput
          style={styles.search}
          placeholder="Search artist, title, label, cat. no."
          placeholderTextColor={colours.faded}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={`All ${total.toLocaleString()}`} on={kind === null} onPress={() => setKind(null)} />
          {kinds.map((k) => (
            <Chip key={k} label={`${k} ${(counts[k] ?? 0).toLocaleString()}`} on={kind === k} onPress={() => setKind(kind === k ? null : k)} />
          ))}
          <View style={styles.divider} />
          {SORTS.map((s) => (
            <Chip key={s.rule} label={s.label} on={sort === s.rule} onPress={() => setSort(s.rule)} />
          ))}
        </ScrollView>
        {busy ? <Text style={styles.progress}>{busy}</Text> : null}
        {queue.running ? (
          <Pressable onPress={() => router.push('/settings')}>
            <Text style={styles.progress} numberOfLines={1}>
              {`Finding artwork: ${queue.done.toLocaleString()} looked up (${queue.found} Discogs, ${queue.standIns} stand-ins). Now: ${queue.status}`}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        initialNumToRender={18}
        windowSize={7}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<Text style={styles.noMatch}>{`Nothing matches “${search}”.`}</Text>}
        renderItem={({ item }) => (
          <Link href={{ pathname: '/record/[key]', params: { key: item.key } }} asChild>
            <Pressable style={{ width: tile }}>
              <Sleeve item={item} size={tile} />
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background },
  centre: { flex: 1, backgroundColor: colours.background, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.l },
  headerButton: { color: colours.text, fontSize: 16, fontWeight: '600' },
  headerButtons: { flexDirection: 'row', gap: space.l },
  progress: { color: colours.faded, fontSize: 12, paddingBottom: space.xs },
  emptyTitle: { color: colours.text, fontSize: 22, fontWeight: '700' },
  emptyText: { color: colours.faded, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  small: { color: colours.faded, fontSize: 12, textAlign: 'center' },
  secondary: { color: colours.text, fontSize: 15, textDecorationLine: 'underline' },
  button: { backgroundColor: colours.accent, borderRadius: 8, paddingVertical: space.m, paddingHorizontal: space.xl },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: colours.accentText, fontSize: 16, fontWeight: '700' },
  tools: { paddingHorizontal: space.m, paddingTop: space.s, gap: space.s },
  search: {
    backgroundColor: colours.surface,
    color: colours.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colours.border,
    paddingHorizontal: space.m,
    paddingVertical: 10,
    fontSize: 15,
  },
  chips: { gap: space.s, paddingBottom: space.s, alignItems: 'center' },
  chip: { borderRadius: 14, borderWidth: 1, borderColor: colours.border, paddingHorizontal: space.m, paddingVertical: 6 },
  chipOn: { backgroundColor: colours.text, borderColor: colours.text },
  chipText: { color: colours.text, fontSize: 13 },
  chipTextOn: { color: colours.background, fontWeight: '700' },
  divider: { width: 1, height: 20, backgroundColor: colours.border, marginHorizontal: space.xs },
  grid: { padding: space.m, gap: space.m },
  row: { gap: space.m },
  noMatch: { color: colours.faded, textAlign: 'center', marginTop: space.xl },
});
