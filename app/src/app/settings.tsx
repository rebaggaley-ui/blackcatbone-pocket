import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { getDiscogsUsername, setDiscogsUsername } from '@/lib/collectionSources';
import { getArtworkCounts, resetLookups, type ArtworkCounts } from '@/lib/db';
import { currentGoogleAccount, googleSignInProblem, signInToGoogle, signOutOfGoogle } from '@/lib/googleSignIn';
import { clearFetchedArtwork } from '@/lib/images';
import {
  artworkQueue,
  checkDiscogsToken,
  cleanToken,
  getLookupOptions,
  setDiscogsToken,
  setLookup,
  SETTING_DISCOGS,
  SETTING_STANDINS,
} from '@/lib/lookups';
import { tell } from '@/lib/notify';
import { colours, space } from '@/lib/theme';
import { useCollectionActions } from '@/lib/useCollectionActions';

/** Settings: your Discogs account, bringing your collection in (or saving it as a CSV), and the artwork lookups (off until you switch them on). */
export default function Settings() {
  const db = useSQLiteContext();
  const queue = useSyncExternalStore(
    (listener) => artworkQueue.subscribe(listener),
    () => artworkQueue.getState()
  );
  const [discogs, setDiscogs] = useState(false);
  const [standIns, setStandIns] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [tokenText, setTokenText] = useState('');
  const [tokenNote, setTokenNote] = useState('');
  const [counts, setCounts] = useState<ArtworkCounts | null>(null);
  const [revision, setRevision] = useState(0);
  const [username, setUsername] = useState('');
  const [usernameText, setUsernameText] = useState('');
  const [google, setGoogle] = useState<string | null>(null);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  const collection = useCollectionActions(refresh);
  const googleProblem = googleSignInProblem();

  useEffect(() => {
    let current = true;
    currentGoogleAccount().then((email) => current && setGoogle(email));
    return () => {
      current = false;
    };
  }, [revision]);

  const googleSignIn = useCallback(async () => {
    try {
      await signInToGoogle(true);
    } catch (error) {
      tell('Couldn’t sign in to Google', error instanceof Error ? error.message : String(error));
    }
    refresh();
  }, [refresh]);

  const googleSignOut = useCallback(async () => {
    try {
      await signOutOfGoogle();
    } catch (error) {
      tell('Couldn’t sign out', error instanceof Error ? error.message : String(error));
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    let current = true;
    (async () => {
      const [options, totals, name] = await Promise.all([getLookupOptions(db), getArtworkCounts(db), getDiscogsUsername(db)]);
      if (current) {
        setUsername(name);
        setDiscogs(options.discogs);
        setStandIns(options.standIns);
        setHasToken(Boolean(options.token));
        setCounts(totals);
      }
    })();
    return () => {
      current = false;
    };
  }, [db, revision, queue.done, queue.running]);

  const saveToken = useCallback(
    async (raw: string) => {
      const token = cleanToken(raw);
      if (!token) {
        tell('No token there', 'Paste your Discogs personal access token (discogs.com > Settings > Developers > Generate token).');
        return;
      }
      setTokenNote('Checking with Discogs...');
      try {
        const owner = await checkDiscogsToken(token);
        await setDiscogsToken(token);
        await setDiscogsUsername(db, owner);
        setTokenText('');
        setTokenNote(`Saved: it's ${owner}'s token.`);
        refresh();
        if (discogs) {
          artworkQueue.start(db);
        }
      } catch (error) {
        setTokenNote(error instanceof Error ? error.message : String(error));
      }
    },
    [db, discogs, refresh]
  );

  const saveUsername = useCallback(async () => {
    await setDiscogsUsername(db, usernameText);
    setUsernameText('');
    refresh();
  }, [db, usernameText, refresh]);

  const importToken = useCallback(async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) {
      return;
    }
    const asset = picked.assets[0];
    const text = asset.file ? await asset.file.text() : await new File(asset.uri).text();
    await saveToken(text);
  }, [saveToken]);

  const removeToken = useCallback(async () => {
    await setDiscogsToken(null);
    setTokenNote('Removed from this phone.');
    refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (setting: typeof SETTING_DISCOGS | typeof SETTING_STANDINS, on: boolean) => {
      (setting === SETTING_DISCOGS ? setDiscogs : setStandIns)(on);
      await setLookup(db, setting, on);
      refresh();
    },
    [db, refresh]
  );

  const lookUpAgain = useCallback(async () => {
    artworkQueue.stop();
    await resetLookups(db);
    clearFetchedArtwork();
    refresh();
    artworkQueue.start(db);
  }, [db, refresh]);

  const left = counts ? Math.max(0, counts.items - counts.lookedUp) : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Discogs account</Text>
        <Text style={styles.note}>
          {hasToken
            ? `Connected${username ? ` as ${username}` : ''}: your token is saved on this phone (in its secure storage). Your collection comes in with your folders, conditions and notes, and Discogs answers more than twice as fast.`
            : 'Your Discogs token lets the app bring your collection in (with your folders, conditions and notes) without an export file.'}
        </Text>
        {!hasToken && Platform.OS !== 'web' ? (
          <View style={styles.steps}>
            <Text style={styles.note}>Getting it takes a minute, on the Discogs website (the Discogs app can’t make tokens):</Text>
            <Text style={styles.note}>1. Tap the button below and sign in to Discogs if it asks.</Text>
            <Text style={styles.note}>
              2. Find “Personal access token” and tap “Generate new token”. Ignore the part about applications: you don’t need to apply
              for anything. (Can’t see it? Choose “Desktop site” in your browser’s menu.)
            </Text>
            <Text style={styles.note}>3. Copy the long token it shows, come back here, paste it below and tap Save.</Text>
          </View>
        ) : null}
        {Platform.OS === 'web' ? (
          <Text style={styles.note}>(Tokens can only be kept on a phone, not in a web browser.)</Text>
        ) : (
          <>
            {!hasToken ? <Button label="Open the Discogs website for your token" onPress={() => Linking.openURL('https://www.discogs.com/settings/developers')} primary /> : null}
            <TextInput
              style={styles.input}
              placeholder={hasToken ? 'Paste a new token to replace it' : 'Paste your token'}
              placeholderTextColor={colours.faded}
              value={tokenText}
              onChangeText={setTokenText}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              onSubmitEditing={() => saveToken(tokenText)}
            />
            <View style={styles.buttons}>
              <Button label="Save" onPress={() => saveToken(tokenText)} primary={hasToken || Boolean(tokenText)} />
              <Button label="Import from a file" onPress={importToken} />
              {hasToken ? <Button label="Remove" onPress={removeToken} /> : null}
            </View>
          </>
        )}
        {tokenNote ? <Text style={styles.note}>{tokenNote}</Text> : null}
        {!hasToken ? (
          <>
            <Text style={styles.note}>
              {username
                ? `Without a token: ${username}'s public collection (no folders, conditions or notes).`
                : 'No token? If your collection is public on Discogs, your username is enough (without folders, conditions or notes).'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={username ? `Username: ${username}` : 'Your Discogs username'}
              placeholderTextColor={colours.faded}
              value={usernameText}
              onChangeText={setUsernameText}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={saveUsername}
            />
            {usernameText ? <Button label="Save username" onPress={saveUsername} /> : null}
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your collection</Text>
        <View style={styles.buttons}>
          <Button label="Bring in from Discogs" onPress={collection.fromDiscogs} primary disabled={Boolean(collection.busy) || (!hasToken && !username)} />
          <Button label="Import a CSV file" onPress={collection.fromCsv} disabled={Boolean(collection.busy)} />
          <Button label="Save as a CSV file" onPress={collection.saveCsv} disabled={Boolean(collection.busy)} />
        </View>
        {collection.busy ? <Text style={styles.note}>{collection.busy}</Text> : null}
        <Text style={styles.note}>
          Bringing it in again updates what’s changed and adds new records; anything no longer on Discogs is kept and marked “gone”. “Save as a CSV
          file” makes a file in Discogs’ export layout and opens the share menu: save it to OneDrive or email it to yourself, and the game’s
          Librarian can import it.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>YouTube playlists</Text>
        <Text style={styles.note}>
          {googleProblem ??
            (google
              ? `Signed in to Google as ${google}. The app can only make and change playlists in your YouTube account.`
              : 'Make a playlist in your YouTube account from records you choose. You sign in to Google the first time (the app only asks to make and change playlists).')}
        </Text>
        <View style={styles.buttons}>
          <Button label="Make a playlist" onPress={() => router.push('/playlist')} primary />
          {!googleProblem && !google ? <Button label="Sign in to Google" onPress={googleSignIn} /> : null}
          {google ? <Button label="Sign out" onPress={googleSignOut} /> : null}
        </View>
      </View>

      <Text style={styles.heading}>Artwork</Text>
      <Text style={styles.note}>
        Off until you switch it on. When it’s on, the app asks these services about your records, one at a time, while it’s open.
        Pictures are kept on your phone.
      </Text>

      <Row
        title="Discogs photos of your releases"
        detail="By each record's release number: the photos of that exact release, plus its tracklist and barcodes."
        value={discogs}
        onChange={(on) => toggle(SETTING_DISCOGS, on)}
      />
      <Row
        title="Stand-in covers when Discogs has none"
        detail="From MusicBrainz and the Cover Art Archive, by artist and title. They show another pressing's artwork, so they're always marked “Not your copy”."
        value={standIns}
        onChange={(on) => toggle(SETTING_STANDINS, on)}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Progress</Text>
        {counts ? (
          <Text style={styles.value}>
            {`${counts.lookedUp.toLocaleString()} of ${counts.items.toLocaleString()} looked up. ${counts.thisRelease.toLocaleString()} with Discogs photos, ${counts.standIns.toLocaleString()} with stand-ins, ${counts.yourPhotos.toLocaleString()} with your photos.`}
          </Text>
        ) : null}
        <Text style={styles.note}>{queue.running ? `Now: ${queue.status}` : queue.status || (left > 0 ? `${left.toLocaleString()} still to look up.` : '')}</Text>
        <View style={styles.buttons}>
          {queue.running ? (
            <Button label="Pause" onPress={() => artworkQueue.stop()} />
          ) : (
            <Button label="Look up the rest" onPress={() => artworkQueue.start(db)} primary disabled={!discogs && !standIns} />
          )}
          <Button label="Look everything up again" onPress={lookUpAgain} disabled={!discogs && !standIns} />
        </View>
        <Text style={styles.note}>“Again” fetches all the artwork afresh. Your own photos are never touched.</Text>
      </View>
    </ScrollView>
  );
}

function Row({ title, detail, value, onChange }: { title: string; detail: string; value: boolean; onChange: (on: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.value}>{title}</Text>
        <Text style={styles.note}>{detail}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colours.accent, false: colours.border }} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colours.background },
  content: { padding: space.l, gap: space.m },
  heading: { color: colours.text, fontSize: 20, fontWeight: '700' },
  note: { color: colours.faded, fontSize: 13, lineHeight: 18 },
  value: { color: colours.text, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, backgroundColor: colours.surface, borderRadius: 8, padding: space.m },
  rowText: { flex: 1, gap: 2 },
  card: { backgroundColor: colours.surface, borderRadius: 8, padding: space.m, gap: space.s },
  steps: { gap: space.xs, paddingLeft: space.xs },
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
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  button: { borderRadius: 8, borderWidth: 1, borderColor: colours.border, paddingHorizontal: space.m, paddingVertical: space.s },
  buttonPrimary: { backgroundColor: colours.accent, borderColor: colours.accent },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colours.text, fontSize: 14, fontWeight: '600' },
  buttonTextPrimary: { color: colours.accentText },
});
