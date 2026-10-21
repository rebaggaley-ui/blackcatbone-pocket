# BlackCatBone Pocket: where things stand, 18 Oct 2026

**Start here.** This is the phone app's handover. It's a project of its own, separate from the BlackCatBone game (which lives in `Claude Ideas\Cozy Music Shop\FlipSide`; don't change the game from here). See also `README.md` (what it does, how to run it) and `POCKET-DESIGN.md` (the full design and its phases). Inside `app\`, read `AGENTS.md` before touching any Expo API.

## In short
BlackCatBone Pocket is a phone app (iPhone and Android) for viewing your music collection.
- What it does:
  - Brings your Discogs collection in.
  - Shows it as a grid of sleeves with a page per record.
  - Fetches artwork, or uses your own photos.
  - Saves the collection as a Discogs-style CSV.
- Coming later: mixtapes, barcode/ID-tag scanning, streaming playlists, a player.
- It is **not** the game: no shop, no 3D. That was the user's choice.
- **It runs on the user's Android phone** in Expo Go 58, from a dev server on the PC.

## Where it's up to (18 Oct)
- The user has **saved their Discogs token** in the app (Settings).
- **Next for the user:** Settings > *Bring in from Discogs* (about half a minute for 1,212 records). Then switch on *Discogs photos of your releases* (and stand-ins if wanted); the whole collection takes about 22 minutes with the token, while the app's open.
- Not yet tried on the phone: a full artwork run, the camera and photo picker, saving a CSV through the share sheet, and the CSV import on the phone.

## What needs doing next
1. **Help the user finish the first run on the phone** (bring the collection in, then artwork). Fix whatever shows up. The dev server's output, in the terminal running `npm start`, shows the phone's errors.
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
   - A standalone `.apk` through EAS: needs a free Expo account the user signs in to themselves.
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
  - `npm start` in `app\`. The phone scans the QR code in Expo Go 58 on the same Wi-Fi.
  - The user's Play Store Expo Go was too old, so Expo Go 58.0.4 is installed from github.com/expo/expo-go-releases.
  - Web preview: `npm run web`, or `.claude\launch.json` "pocket-web". It can bring the collection in by username, but can't pick files or keep a token.
- `app\` has its own git repo, made by create-expo-app. Nothing has been committed: ask the user before committing.

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
