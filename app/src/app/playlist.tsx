import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { getItems, getTracklists, listItems, listPlaylists, type Item, type PlaylistSong, type SavedPlaylist } from '@/lib/db';
import { cleanArtist } from '@/lib/format';
import { googleSignInProblem, signInToGoogle, type GoogleAccount } from '@/lib/googleSignIn';
import { tell } from '@/lib/notify';
import { colours, space } from '@/lib/theme';
import { COST, estimateUnits, playlistUrl, songListText, songsFor, videoUrl, withoutRepeats, type Privacy, type SideChoice, type Song } from '@/lib/youtube';
import {
  carryOnPlaylist,
  countUnsearched,
  findOnYouTube,
  makeYouTubePlaylist,
  rememberChoice,
  unitsLeftToday,
  type FoundSong,
  type MakeResult,
} from '@/lib/youtubePlaylists';

type Stage = 'pick' | 'finding' | 'review' | 'making' | 'done';

const VERDICT_LABEL = { found: 'Found', check: 'Check', 'not-there': 'Not there' } as const;

/**
 * A YouTube playlist from your records: tick them, the app finds each song on YouTube (showing how sure each match
 * is before anything's made), then makes the playlist in your YouTube account.
 */
export default function Playlist() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ keys?: string }>();
  const [stage, setStage] = useState<Stage>('pick');
  const [items, setItems] = useState<Item[] | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(params.keys ? params.keys.split(',') : []));
  const [sides, setSides] = useState<SideChoice>('a-sides');
  const [name, setName] = useState('From my records');
  const [privacy, setPrivacy] = useState<Privacy>('private');
  const [saved, setSaved] = useState<SavedPlaylist[]>([]);
  const [progress, setProgress] = useState('');
  const [found, setFound] = useState<FoundSong[]>([]);
  /** Each song's video (by song id), or null when it's left out. */
  const [chosen, setChosen] = useState<Map<string, string | null>>(new Map());
  const [open, setOpen] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [made, setMade] = useState<MakeResult | null>(null);
  const [revision, setRevision] = useState(0);
  const account = useRef<GoogleAccount | null>(null);
  const stopRequested = useRef(false);
  const problem = useMemo(() => googleSignInProblem(), []);

  useEffect(() => {
    let current = true;
    (async () => {
      const [shown, playlists] = await Promise.all([listItems(db, { search }), listPlaylists(db)]);
      if (current) {
        setItems(shown.filter((item) => !item.gone));
        setSaved(playlists);
      }
    })();
    return () => {
      current = false;
    };
  }, [db, search, revision]);

  const toggle = useCallback((key: string) => {
    setPicked((now) => {
      const next = new Set(now);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }, []);

  /** The songs the ticked records give, each once. */
  const pickedSongs = useCallback(async (): Promise<Song[]> => {
    const keys = [...picked];
    const [records, tracklists] = await Promise.all([getItems(db, keys), getTracklists(db, keys)]);
    return withoutRepeats(records.flatMap((record) => songsFor(record, tracklists.get(record.key) ?? [], sides)));
  }, [db, picked, sides]);

  const signIn = useCallback(async (): Promise<GoogleAccount | null> => {
    account.current = (await signInToGoogle(false)) ?? (await signInToGoogle(true));
    return account.current;
  }, []);

  const find = useCallback(async () => {
    try {
      const songs = await pickedSongs();
      if (songs.length === 0) {
        tell('No songs there', 'Those records have no songs to look for yet.');
        return;
      }
      if (!(await signIn())) {
        return; // cancelled
      }
      stopRequested.current = false;
      setStage('finding');
      const toSearch = await countUnsearched(db, songs);
      const left = await unitsLeftToday(db);
      setProgress(`${songs.length} songs, ${toSearch} to search for. About ${Math.floor(left / (COST.search + COST.insert))} new songs left in today's allowance.`);
      const result = await findOnYouTube(
        db,
        account.current as GoogleAccount,
        songs,
        (done, song) => setProgress(`Looking for ${done + 1} of ${songs.length}: ${song.artist}, ${song.title}`),
        () => stopRequested.current
      );
      setFound(result.found);
      setWaiting(result.waiting.length);
      // Confident matches go in; near misses wait for you to choose; ones not there are left out.
      setChosen(new Map(result.found.map((f) => [f.song.id, f.match.verdict === 'found' ? (f.match.chosen?.videoId ?? null) : null])));
      setStage('review');
    } catch (error) {
      setStage('pick');
      tell('Couldn’t look on YouTube', error instanceof Error ? error.message : String(error));
    }
  }, [db, pickedSongs, signIn]);

  const shareList = useCallback(async () => {
    const songs = await pickedSongs();
    if (songs.length > 0) {
      await Share.share({ message: songListText(name, songs) });
    }
  }, [name, pickedSongs]);

  const choose = useCallback(
    async (f: FoundSong, videoId: string) => {
      setChosen((now) => new Map(now).set(f.song.id, videoId));
      setOpen(null);
      await rememberChoice(db, f, videoId);
    },
    [db]
  );

  const make = useCallback(async () => {
    const songs: PlaylistSong[] = found.flatMap((f) => {
      const videoId = chosen.get(f.song.id);
      const video = f.match.candidates.find((c) => c.videoId === videoId);
      return video
        ? [{ id: f.song.id, itemKey: f.song.itemKey, artist: f.song.artist, title: f.song.title, wholeRecord: f.song.wholeRecord, videoId: video.videoId, videoTitle: video.title, added: false }]
        : [];
    });
    if (songs.length === 0 || !account.current) {
      return;
    }
    setStage('making');
    try {
      const result = await makeYouTubePlaylist(db, account.current, { name: name.trim() || 'From my records', privacy, songs }, (added, total) =>
        setProgress(`Adding ${added + 1} of ${total}...`)
      );
      setMade(result);
      setStage('done');
      setRevision((n) => n + 1);
    } catch (error) {
      setStage('review');
      setRevision((n) => n + 1);
      tell('Couldn’t make the playlist', `${error instanceof Error ? error.message : String(error)}\n\nWhat was made is saved: “Carry on” finishes it.`);
    }
  }, [chosen, db, found, name, privacy]);

  const carryOn = useCallback(
    async (playlist: SavedPlaylist) => {
      try {
        if (!(await signIn())) {
          return;
        }
        setStage('making');
        const result = await carryOnPlaylist(db, account.current as GoogleAccount, playlist.id, (added, total) => setProgress(`Adding ${added + 1} of ${total}...`));
        setMade(result);
        setStage('done');
      } catch (error) {
        setStage('pick');
        tell('Couldn’t carry on', error instanceof Error ? error.message : String(error));
      } finally {
        setRevision((n) => n + 1);
      }
    },
    [db, signIn]
  );

  const startAgain = useCallback(() => {
    setStage('pick');
    setFound([]);
    setMade(null);
    setPicked(new Set());
  }, []);

  if (stage === 'finding' || stage === 'making') {
    return (
      <View style={styles.centre}>
        <Stack.Screen options={{ title: 'YouTube playlist' }} />
        <ActivityIndicator color={colours.text} />
        <Text style={styles.note}>{progress}</Text>
        {stage === 'finding' ? <Button label="Stop here" onPress={() => (stopRequested.current = true)} /> : null}
      </View>
    );
  }

  if (stage === 'done' && made) {
    const url = made.playlist.remoteId ? playlistUrl(made.playlist.remoteId) : '';
    return (
      <View style={styles.centre}>
        <Stack.Screen options={{ title: 'YouTube playlist' }} />
        <Text style={styles.big}>{made.left === 0 ? 'Your playlist is made' : 'Made, but not finished'}</Text>
        <Text style={styles.note}>
          {`“${made.playlist.name}”: ${made.playlist.songs.length - made.left} of ${made.playlist.songs.length} songs on it, in your YouTube account (${made.playlist.privacy === 'unlisted' ? 'anyone with the link can watch' : 'only you can see it'}).`}
          {made.left > 0 ? ` Today's YouTube allowance ran out: tomorrow, open this screen and tap “Carry on” to add the other ${made.left}.` : ''}
        </Text>
        {url ? (
          <View style={styles.buttons}>
            <Button label="Open in YouTube" onPress={() => Linking.openURL(url)} primary />
            <Button label="Share the link" onPress={() => Share.share({ message: `${made.playlist.name}: ${url}` })} />
          </View>
        ) : null}
        <Button label="Make another" onPress={startAgain} />
      </View>
    );
  }

  if (stage === 'review') {
    const included = found.filter((f) => chosen.get(f.song.id)).length;
    const counts = { found: 0, check: 0, 'not-there': 0 };
    for (const f of found) {
      counts[f.match.verdict]++;
    }
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: 'Check the songs' }} />
        <FlatList
          data={found}
          keyExtractor={(f) => f.song.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.gap}>
              <Text style={styles.note}>
                {`${counts.found} found, ${counts.check} to check, ${counts['not-there']} not on YouTube.`}
                {waiting > 0 ? ` ${waiting} more weren't looked for: today's allowance is used up, so look again tomorrow (what's found now is remembered).` : ''}
              </Text>
              <Text style={styles.note}>
                “Check” means a near miss (a live take, a cover, another channel): tap “Other results” to choose, or leave it out. Nothing goes on the
                playlist that you haven’t seen here.
              </Text>
              <View style={styles.buttons}>
                <Button label={`Make the playlist (${included} songs)`} onPress={make} primary disabled={included === 0} />
                <Button label="Back" onPress={() => setStage('pick')} />
              </View>
              <Text style={styles.small}>{`Making it uses about ${estimateUnits(0, included, true).toLocaleString()} of Google's 10,000 units a day.`}</Text>
            </View>
          }
          renderItem={({ item: f }) => {
            const videoId = chosen.get(f.song.id);
            const video = f.match.candidates.find((c) => c.videoId === (videoId ?? f.match.chosen?.videoId));
            return (
              <View style={[styles.songRow, !videoId && styles.leftOut]}>
                <View style={styles.songHead}>
                  <Text style={[styles.tag, styles[f.match.verdict]]}>{VERDICT_LABEL[f.match.verdict]}</Text>
                  <Text style={styles.value} numberOfLines={2}>
                    {`${f.song.artist}, ${f.song.title}${f.song.wholeRecord ? ' (the album)' : ''}`}
                  </Text>
                </View>
                {video ? <Text style={styles.small} numberOfLines={2}>{`${video.title} · ${video.channel}`}</Text> : null}
                <View style={styles.buttons}>
                  {video ? (
                    videoId ? (
                      <Button label="Leave out" onPress={() => setChosen((now) => new Map(now).set(f.song.id, null))} />
                    ) : (
                      <Button label="Use it" onPress={() => choose(f, video.videoId)} />
                    )
                  ) : null}
                  {f.match.candidates.length > 1 ? <Button label="Other results" onPress={() => setOpen(open === f.song.id ? null : f.song.id)} /> : null}
                  {video ? <Button label="Watch" onPress={() => Linking.openURL(videoUrl(video.videoId))} /> : null}
                </View>
                {open === f.song.id
                  ? f.match.candidates.map((c) => (
                      <Pressable key={c.videoId} onPress={() => choose(f, c.videoId)} style={styles.candidate}>
                        <Text style={styles.value} numberOfLines={2}>{c.title}</Text>
                        <Text style={styles.small}>{c.channel}</Text>
                      </Pressable>
                    ))
                  : null}
              </View>
            );
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'YouTube playlist' }} />
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        ListHeaderComponent={
          <View style={styles.gap}>
            <Text style={styles.note}>
              Tick records, and the app finds their songs on YouTube, shows you each match, then makes a playlist in your YouTube account. Albums
              give every track (once their tracklist has come with the artwork); singles their A side, or both sides.
            </Text>
            {problem ? <Text style={styles.warning}>{problem}</Text> : null}
            <View style={styles.card}>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="The playlist's name" placeholderTextColor={colours.faded} />
              <View style={styles.buttons}>
                <Chip label="Singles: A sides" on={sides === 'a-sides'} onPress={() => setSides('a-sides')} />
                <Chip label="Both sides" on={sides === 'both-sides'} onPress={() => setSides('both-sides')} />
              </View>
              <View style={styles.switchRow}>
                <Text style={[styles.note, styles.flex]}>Anyone with the link can watch it (otherwise only you can)</Text>
                <Switch
                  value={privacy === 'unlisted'}
                  onValueChange={(on) => setPrivacy(on ? 'unlisted' : 'private')}
                  trackColor={{ true: colours.accent, false: colours.border }}
                />
              </View>
              <View style={styles.buttons}>
                <Button label={`Find on YouTube (${picked.size} records)`} onPress={find} primary disabled={picked.size === 0 || Boolean(problem)} />
                <Button label="Share as a list" onPress={shareList} disabled={picked.size === 0} />
              </View>
              <Text style={styles.small}>
                Google allows each app about {Math.floor(10_000 / (COST.search + COST.insert))} new songs a day (searching is what costs). A song found
                once is remembered, so it’s free after that.
              </Text>
            </View>
            {saved.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Your playlists</Text>
                {saved.map((playlist) => {
                  const added = playlist.songs.filter((song) => song.added).length;
                  return (
                    <View key={playlist.id} style={styles.saved}>
                      <Text style={[styles.value, styles.flex]} numberOfLines={1}>{`${playlist.name} (${added} of ${playlist.songs.length})`}</Text>
                      {playlist.remoteId ? <Button label="Open" onPress={() => Linking.openURL(playlistUrl(playlist.remoteId))} /> : null}
                      {added < playlist.songs.length ? <Button label="Carry on" onPress={() => carryOn(playlist)} disabled={Boolean(problem)} /> : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Search artist, title, label, cat. no."
              placeholderTextColor={colours.faded}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <View style={styles.buttons}>
              <Button
                label={`Tick all ${(items?.length ?? 0).toLocaleString()} shown`}
                onPress={() => setPicked((now) => new Set([...now, ...(items ?? []).map((item) => item.key)]))}
                disabled={!items?.length}
              />
              <Button label={`Untick all (${picked.size})`} onPress={() => setPicked(new Set())} disabled={picked.size === 0} />
            </View>
          </View>
        }
        ListEmptyComponent={items === null ? <ActivityIndicator color={colours.text} /> : <Text style={styles.note}>{`Nothing matches “${search}”.`}</Text>}
        renderItem={({ item }) => {
          const on = picked.has(item.key);
          return (
            <Pressable onPress={() => toggle(item.key)} style={styles.recordRow}>
              <Text style={[styles.tick, on && styles.tickOn]}>{on ? '✓' : ''}</Text>
              <View style={styles.flex}>
                <Text style={styles.value} numberOfLines={1}>{cleanArtist(item.artist)}</Text>
                <Text style={styles.small} numberOfLines={1}>{`${item.title} · ${item.kind}`}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function Button({ label, onPress, primary, disabled }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, primary && styles.buttonPrimary, disabled && styles.buttonDisabled]}>
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
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
  list: { padding: space.l, gap: space.s },
  gap: { gap: space.m, paddingBottom: space.s },
  flex: { flex: 1 },
  big: { color: colours.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  note: { color: colours.faded, fontSize: 13, lineHeight: 18 },
  small: { color: colours.faded, fontSize: 12 },
  warning: { color: colours.warning, fontSize: 13, lineHeight: 18 },
  value: { color: colours.text, fontSize: 15 },
  card: { backgroundColor: colours.surface, borderRadius: 8, padding: space.m, gap: space.s },
  cardTitle: { color: colours.text, fontSize: 16, fontWeight: '700' },
  input: {
    backgroundColor: colours.background,
    color: colours.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colours.border,
    paddingHorizontal: space.m,
    paddingVertical: 10,
    fontSize: 15,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  saved: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  button: { borderRadius: 8, borderWidth: 1, borderColor: colours.border, paddingHorizontal: space.m, paddingVertical: space.s },
  buttonPrimary: { backgroundColor: colours.accent, borderColor: colours.accent },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colours.text, fontSize: 14, fontWeight: '600' },
  buttonTextPrimary: { color: colours.accentText },
  chip: { borderRadius: 14, borderWidth: 1, borderColor: colours.border, paddingHorizontal: space.m, paddingVertical: 6 },
  chipOn: { backgroundColor: colours.text, borderColor: colours.text },
  chipText: { color: colours.text, fontSize: 13 },
  chipTextOn: { color: colours.background, fontWeight: '700' },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: colours.surface, borderRadius: 8, padding: space.m },
  tick: { width: 24, height: 24, borderRadius: 4, borderWidth: 1, borderColor: colours.border, color: colours.accentText, textAlign: 'center', fontWeight: '700' },
  tickOn: { backgroundColor: colours.accent, borderColor: colours.accent },
  songRow: { backgroundColor: colours.surface, borderRadius: 8, padding: space.m, gap: space.s },
  leftOut: { opacity: 0.6 },
  songHead: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  tag: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  found: { backgroundColor: '#2f6b3a', color: '#ffffff' },
  check: { backgroundColor: colours.warning, color: '#1a1408' },
  'not-there': { backgroundColor: colours.raised, color: colours.faded },
  candidate: { borderTopWidth: 1, borderTopColor: colours.border, paddingTop: space.s, gap: 2 },
});
