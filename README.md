# BlackCatBone Pocket

Your record collection on your phone (iPhone and Android). A project of its own, separate from the BlackCatBone game. **Start with [NEXT-SESSION.md](NEXT-SESSION.md)** for where things stand; the design is in [POCKET-DESIGN.md](POCKET-DESIGN.md); the app is in `app/` (Expo SDK 58, React Native, TypeScript).

## What works so far (Phase 1, first part)
- **Bring your collection in straight from Discogs**: no export file needed (Discogs' mobile site can't make one). With your Discogs token it includes your folders, conditions and notes; with just your username, what your public collection shows. Or **import an export file** (CSV) if you have one. Bringing it in again updates the details and adds new records; anything no longer on Discogs is kept and marked *Gone from Discogs*.
- **Save as a CSV file** (*Update* > *Save as a CSV file*, or Settings): your collection in Discogs' export layout, through the phone's share menu (OneDrive, Drive, email...), for the BlackCatBone game's Librarian or anything else that reads Discogs exports.
- **Your collection as a grid of sleeves**, with search (artist, title, label, catalogue no.), a filter by kind (7", 10", 12", LP, Box set, Cassette, CD) with counts, and sorting (A-Z, newest, year, label).
- **A page for each record:** format, label, catalogue no., year, record and sleeve condition, folder, date added, rating, your notes, and a link to the release on Discogs.
- **Artwork** (Settings, off until you switch it on):
  - **Discogs photos of your exact release**, by the release number in your export, plus its tracklist, barcodes and genres (shown on the record page). With your Discogs token it's quicker: about 22 minutes for your whole collection the first time, instead of about 50. It runs while the app is open, and carries on where it left off.
  - **Stand-in covers** from MusicBrainz / Cover Art Archive when Discogs has no picture, always badged **"Not your copy"**.
  - **Your own photos**: *Take a photo* or *Choose photos* on any record's page. They're badged **"Your copy"** and become its sleeve. Swipe through all of a record's pictures; *Remove this photo* takes one of yours off.
  - Your **Discogs token** is kept in the phone's secure storage: paste it in Settings, or *Import from a file* (a text file with the token in it). *Check* happens as you save it.
- Records with no picture yet are **plain sleeves** (a colour of their own, with artist and title), so they're never mistaken for the real picture.

Not yet: barcode and ID-tag scanning, items not on Discogs, mixtapes, playlists, the player (see the phases in the design).

## Try it on your phone with Expo Go
1. On your phone, install **Expo Go** from the App Store or Google Play.
2. On the PC, in `BlackCatBone Pocket\app`:
   ```bash
   npm start
   ```
   A QR code appears in the terminal. The first time, Windows may ask whether Node.js can use the network: allow it on **private networks**.
3. With the phone on the **same Wi-Fi** as the PC:
   - **iPhone:** open the Camera app and point it at the QR code, then tap the banner to open it in Expo Go.
   - **Android:** open Expo Go and tap *Scan QR code*.

   If the phone can't connect (a different network, or the Wi-Fi blocks it), use `npx expo start --tunnel` instead.
4. If Expo Go says the project needs a different SDK, update Expo Go from the store, or install the matching Expo Go for Android from Expo's own releases: https://github.com/expo/expo-go-releases/releases (this app needs Expo Go 58, file Expo-Go-58.0.4.apk).

## Bringing your collection in
1. In the app, tap **Connect to Discogs** (or **Settings**).
2. Tap **Open the Discogs website for your token** (the Discogs app can't make tokens). Sign in if it asks, find **Personal access token** and tap **Generate new token**, then copy it. Ignore the "API applications" part: there's nothing to apply for. If the token button doesn't show, choose **Desktop site** in the browser's menu.
3. Back in the app, paste it and tap **Save**. The app checks it with Discogs and shows whose it is.
4. Tap **Bring in from Discogs**: about half a minute for 1,200 records.

No token? If your collection is public, typing your Discogs username works too (without folders, conditions and notes). An export file still works: *Choose an export file (CSV) instead*.

Your collection stays on the phone. The app only talks to Discogs (and MusicBrainz, for stand-in covers) when you ask it to.

## For working on it
```bash
npm run typecheck
npm run lint
npm test
```
`npm test` checks the CSV reader and writer (including against a real export when there's a CSV in `test-data\`, next to `app\`; it's kept out of the app's git), the Discogs collection mapping and the artwork parsers. `npm run web` previews it in a browser on the PC: bringing the collection in from Discogs works there (by username); picking a file and keeping a token need a phone.
