# BlackCatBone Pocket: where things stand, 21 Oct 2026

**Start here.** This is the phone app's handover, for Claude on the user's PC or in a cloud session from their phone. It's a project of its own, separate from the BlackCatBone game; don't change the game from here. `CLAUDE.md` says how to get changes onto the phone (over-the-air updates, or a new build). See also `README.md` (what it does, how to run it) and `POCKET-DESIGN.md` (the full design and its phases). Inside `app\`, read `AGENTS.md` before touching any Expo API.

## In short
BlackCatBone Pocket is a phone app (iPhone and Android) for viewing your music collection.
- What it does:
  - Brings your Discogs collection in.
  - Shows it as a grid of sleeves with a page per record.
  - Fetches artwork, or uses your own photos.
  - Saves the collection as a Discogs-style CSV.
- Coming later: mixtapes, barcode/ID-tag scanning, streaming playlists, a player.
- It is **not** the game: no shop, no 3D. That was the user's choice.
- **It's installed on the user's Android phone** as a real app: EAS preview build 0.1.0 (finished 21 Oct), which takes over-the-air updates on the **preview** channel. No PC or Expo Go is needed to run it.
- **The code is on GitHub** (private): rebaggaley-ui/blackcatbone-pocket, so Claude Code cloud sessions can work on it from the phone. The Expo project is @rebaggaley/blackcatbone-pocket.

## Where it's up to (21 Oct)
- The user is installing build 0.1.0 from its page on expo.dev (expo.dev/accounts/rebaggaley/projects/blackcatbone-pocket/builds/704b94d6-5a8e-4681-a9ee-a639d4b7fcf9). It's a new install, so it starts empty: they paste their Discogs token again in Settings.
- For cloud sessions, the user is setting up the GitHub connection to the repository, and an Expo access token as `EXPO_TOKEN` in the cloud environment.
- **Next for the user:** Settings > *Bring in from Discogs* (about half a minute for 1,212 records). Then switch on *Discogs photos of your releases* (and stand-ins if wanted); the whole collection takes about 22 minutes with the token, while the app's open.
- Not yet tried on the phone: a full artwork run, the camera and photo picker, saving a CSV through the share sheet, and the CSV import on the phone.

## What needs doing next
1. **Help the user finish the first run on the phone** (bring the collection in, then artwork). Fix whatever shows up, and send fixes as an over-the-air update (see `CLAUDE.md`). There's no dev server now, so ask the user what they see.
2. **Make "Save as a CSV" write formats exactly as Discogs' export does.** Found by the game's Discogs import work on 18 Oct: `formatText` in `src\lib\discogsCollection.ts` differs from the export for 693 of the 1,212 records. Kinds and filters are unaffected; the CSV Pocket saves for the game is. The export's rules (the game's `ExportFormat` matches all 1,212 records):
   - sizes come first;
   - "LP" is dropped when there's a size;
   - descriptions use Discogs' short forms (Comp, Ltd, RE, S/Sided, W/Lbl, Box, Flexi, Lathe...), in Discogs' order;
   - no speeds and no "Stereo";
   - free text is cut to 3 letters;
   - 50 characters at most.

   Check against the real export in `test-data\`; the format mismatch is the only one expected.
3. **Mixtapes** (design section 6b): C46/C60/C90/C120, sides A and B with time left, a gap between songs, estimated lengths clearly marked, and a printable J-card.
4. **Scanning** (design section 5): barcodes (the Discogs barcodes are already fetched with the artwork, in the `lookups` table) and printable QR ID labels (`BCB-000123`).
5. **Items not on Discogs** (added by hand, marked as such).
6. **Streaming playlists** (design section 6a). **YouTube is built** (19 Oct, on the `claude/youtube-playlists-thisw9` branch): `src\app\playlist.tsx`, `src\lib\youtube.ts` (songs from records, matching, API), `youtubePlaylists.ts` (searches remembered, daily allowance, carry on tomorrow), `googleSignIn.ts`. **Waiting on the user:** the Google Cloud setup in `YOUTUBE-SETUP.md` (client IDs as EAS environment variables) and a new build, since Google's sign-in can't run in Expo Go. Not tried on a phone yet. Still to do: a playlist file for any service, then Spotify (only for a few named users unless Spotify approves the app).
7. **The player** (design section 6): music files on the phone first.
8. **Later:**
   - "Sign in with Discogs": register the app with Discogs for OAuth, so others don't paste a token.
   - Phase 2 export to the game.

## How it's built
- `app\` holds Expo SDK 58, expo-router (screens in `src\app`), expo-sqlite and TypeScript. Node.js 24 LTS is at `C:\Program Files\nodejs`; a shell started before the install needs it added to PATH.
- **Screens:**
  - `src\app\index.tsx`: the collection grid; *Update* is the menu to bring in, import or save.
  - `src\app\record\[key].tsx`: a record's page, with its photos, tracklist and *Find artwork now*.
  - `src\app\settings.tsx`: your Discogs account (token steps), your collection, YouTube sign-in, artwork.
  - `src\app\playlist.tsx`: a YouTube playlist from ticked records (pick, check the matches, make, carry on).
- **Library** (`src\lib`):
  - `csv.ts`: reads and writes Discogs exports. Keys are `d<release>-<n>`, numbered by date added.
  - `discogsCollection.ts`: the collection straight from the Discogs API, mapped to the same rows as the CSV; all 1,212 matched the real export.
  - `db.ts`: SQLite, schema version 3, with items, images, lookups, settings, `youtube_matches` (every search made, so it's never made twice) and `playlists`.
  - `lookups.ts`: the artwork queue (Discogs photos, MusicBrainz / Cover Art Archive stand-ins).
  - `http.ts`: pacing. Discogs allows 60/min with a token and 25 without; MusicBrainz is about 1 a second and answers 503 when busy, so the app backs off.
  - `images.ts` (picture files), `photos.ts` (camera and library), `artwork.ts` (parsers), `collectionSources.ts` (bring in, save CSV), `useCollectionActions.ts`.
- The **token** is in expo-secure-store; it's never in the database. Online lookups are off until switched on.
- **Checks** (run them before calling anything done):
  - `npm run typecheck`, `npm run lint`, `npm test` (32 tests).
  - `npx expo export --platform android --platform ios` (both phone bundles).
  - `npm test` uses the real export in `test-data\` (outside `app\`, so never in git).
- **Running it:**
  - **On the phone:** the installed preview build. Changes reach it as EAS updates; native changes need a new build after raising `version` (see `CLAUDE.md`). Build settings are in `app/eas.json`, and `runtimeVersion` follows the app version.
  - **On the PC, for quick tries:** `npm start` in `app\` with Expo Go 58 (installed from github.com/expo/expo-go-releases; the Play Store's was too old).
  - Web preview: `npm run web`, or `.claude\launch.json` "pocket-web". It can bring the collection in by username, but can't pick files or keep a token.
- **Git:** one repository for the whole project, pushed to GitHub `main`; the root `.gitignore` leaves out `test-data/`. Git on the PC signs in through Git Credential Manager. The empty repository create-expo-app made is archived at `F:\Builds\Archive\pocket-app-git-empty-20261018`.

## Things learnt
- Discogs' mobile site can't export a CSV, and the Discogs app can't make tokens. The token comes from the website's Settings > Developers > *Generate new token*; the "API applications" form isn't needed.
- The user's Discogs username is `rebaggaley`; the collection is public (1,212 items). Without a token, the API hides folders, conditions and notes, so a token-free re-import keeps the ones already there.
- The Discogs API lists release images even without a token.
- In the export, a format's free text is cut to three letters ("Boxed Decca" becomes "Box"). Only a format part that *starts* with "Box" is a box set: 14 of the user's records.
- Expo changes every SDK: read the versioned docs (docs.expo.dev/versions/v58.0.0) rather than memory.

## The user's preferences
- Explain plainly; show it working with pictures.
- Never delete their things.
- Tokens are pasted or imported from a file and kept securely; online lookups are opt-in.
- Neutral names for real brands, shops and venues, and no service logos.
- A stand-in picture must never pass for their own copy.
