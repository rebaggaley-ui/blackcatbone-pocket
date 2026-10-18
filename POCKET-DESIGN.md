# BlackCatBone Pocket: design

A phone app for **iPhone and Android** to carry your music collection with you: browse your Discogs export, see the artwork, photograph your own copies, tag them by barcode or your own ID label, and play music files. It's a project of its own (`Claude Ideas\BlackCatBone Pocket`), separate from the BlackCatBone game; the two only share file formats (a Discogs-style CSV now, and later an export the game can import). "Pocket" is a working name.

**What it isn't:** no shop, no 3D, no street. It's a way to view your records, tapes and CDs (and the files that go with them), not the game on a phone.

Status (18 Oct 2026): Phase 1 started in `app/`: CSV import, the collection grid with search and filters, record pages, artwork (Discogs photos, badged stand-ins, your own photos), bringing the collection in straight from Discogs, and saving it as a CSV. See [README.md](README.md) to try it on a phone.

---

## 1. What it does

1. **Your collection straight from Discogs**, through Discogs' API with your token (or, for a public collection, your username): no export file needed, since Discogs' mobile site can't make one. Or import the `.csv` export if you have one. Every record, tape and CD appears in a list and a grid of sleeves. The app can also **save the collection as a CSV** in Discogs' export layout (for the game's Librarian), through the phone's share menu.
2. **Artwork, the right way round.**
   - From **Discogs** first: the photos of that exact release (by its `release_id`). These are marked as **this release**.
   - If Discogs has no picture, from **elsewhere** (MusicBrainz / Cover Art Archive, then an album folder's cover on the phone). These are clearly marked **"Not your copy: artwork from another release"** (a small badge on the sleeve and a line on its page), so a stand-in never passes for the real thing.
   - Your **own photo** beats both (see 3).
3. **Photograph your own copies.** On any record's page: *Take a photo* (front, back, label, spine, inserts: as many as you like). Your photos are marked **"Your copy"** and become its sleeve in the app.
4. **Link a physical item to its entry by scanning.**
   - **Barcode** (EAN/UPC on CDs, tapes and later records): scan it, and the app finds the matching entry in your collection (by the barcodes Discogs lists for each release). If nothing in your collection matches, it offers what the barcode is (from Discogs / MusicBrainz) and *Add as "not on Discogs"* or *Not now*.
   - **Your own ID tag** for things with no barcode (most 7" singles, old LPs, cassettes): the app prints a sheet of small **QR labels** (`BCB-000123` and so on) you can stick on an inner sleeve, case or box. Scan one once to attach it to an entry; scan it again any time to jump straight to that record.
   - **Catalogue number** as a fallback: type or photograph it (`TEN 385`), and the app searches your collection for it.
5. **Things not on Discogs.** Add an item by hand (artist, title, format, year, photos, barcode or ID tag). It's marked **"Not on Discogs"** and sits in the collection with everything else.
6. **A media player** (FlipAmp-style, kept simple): play music files with your collection's artwork. See section 6.
7. **Playlists for streaming apps:** pick records (or a whole folder, a filter, a mixtape) and make a playlist of them in Spotify, YouTube or another service, then share it. See section 6a.
8. **Mixtapes for real tapes:** fill a C60 or C90 (or C46, C120) side by side, and always see how much time is left on each side. See section 6b.

All formats are in scope: 7", 10", 12", LPs, box sets, cassettes, CDs, and anything else Discogs lists.

---

## 2. Screens

- **Collection:** grid of sleeves or a list; search (artist, title, label, catalogue no., barcode); filters (format, folder, decade, "has my photo", "not on Discogs", "no artwork yet"); sort (artist, date added, year, label, value).
- **Record page:** the sleeve (swipe through Discogs photos, stand-ins and your photos, each with its badge), the details from the CSV (catalogue no., label, format, released, folder, date added, media and sleeve condition, your notes), the tracklist (from Discogs, when fetched), linked barcode and ID tag, *Take a photo*, *Scan to link*, *Play* (if there are files).
- **Scan:** the camera, reading barcodes and QR ID tags; it goes straight to the record, or offers to link it.
- **Add:** a new item not on Discogs (or a Discogs release by its number or barcode).
- **Player:** now playing (artwork, track, progress), the queue, play/pause/next/previous, shuffle; plays in the background and from the lock screen.
- **Settings:** import a new CSV, online lookups on/off (each source separately), your Discogs token, print ID labels, back up / restore, export to the game.

---

## 3. Data and storage

Everything lives **on the phone**, in a local database plus a folder of pictures. Nothing goes anywhere unless you switch an online lookup on.

### What's kept for each item
| Field | Where it comes from |
|---|---|
| Catalog#, Artist, Title, Label, Format, Rating, Released, release_id, CollectionFolder, Date Added, Media / Sleeve Condition, Notes | the Discogs CSV (these are its exact columns) |
| Tracklist, barcodes, genres, release photos | Discogs API, by `release_id` (optional, online) |
| Stand-in artwork | MusicBrainz / Cover Art Archive, or a cover file on the phone |
| Your photos | the phone's camera |
| ID tag (`BCB-000123`), extra barcodes you scanned | you |
| Source | `discogs` or `not-on-discogs` |

### Each picture carries where it's from
`this-release` (Discogs, this release) · `stand-in` (another release or a folder cover: shown with the "Not your copy" badge) · `your-photo`.

### Re-importing
A newer CSV updates the details and adds new records; your photos, tags and links stay. Something that's gone from Discogs isn't deleted: it moves to a *Gone from Discogs* filter (the same rule as the game).

---

## 4. Online lookups (all opt-in)

| Source | Used for | Notes |
|---|---|---|
| **Discogs API** | release photos, tracklists, barcodes; looking up a barcode not in your collection | Works without a token (25 requests a minute); with your personal token (paste it in Settings, or import it from a text file; kept in the phone's secure storage) it's 60 a minute. A big first fetch takes a while; it runs while the app is open and carries on next time. (Checked 18 Oct 2026: Discogs lists release photos even without a token.) |
| **MusicBrainz + Cover Art Archive** | stand-in artwork and barcode lookups when Discogs has nothing | No account needed; one request a second. |

Before release: check the Discogs API terms on keeping images on the device and on showing the "data provided by Discogs" credit.

---

## 5. Barcode and ID tag details

- **Scanning:** EAN-13, UPC-A, EAN-8 and QR, through the phone's camera (on-device: no internet needed to scan).
- **Matching a barcode:** first your collection's known barcodes (from Discogs, plus any you've linked); then, if online lookups are on, Discogs' barcode search, then MusicBrainz.
- **One item, several codes:** a box set or reissue can have more than one barcode; an item can have a barcode and an ID tag.
- **ID labels:** a printable PDF sheet of QR codes (standard label-sheet sizes, e.g. 65 per A4), numbered in order. The app remembers which numbers it has printed, so they never repeat.

---

## 6. Media player

Kept from the game's FlipAmp idea, without the jukebox or the shop:

- **Phase 1: files on the phone.** Pick a music folder on the phone (or files shared to the app). The app reads their tags and links each album or track to a collection entry by artist and title, like the game's Librarian does: confident matches are linked, and close ones are shown for you to confirm or reject. Records with files get a play button.
- Background playback, lock-screen and headphone controls, queue, shuffle, play a whole album.
- MP3, AAC/M4A, FLAC, WAV, OGG (FLAC and OGG need checking on iPhone).
- **Phase 3 (optional): your PC's music over Wi-Fi.** Your music is on the PC (`F:\Music\My Music`, about 17,500 files), too much to copy to a phone. Later, the PC could share it on your home network (from the game, or a small helper) so the phone can browse and play it at home.

---

## 6a. Playlists for streaming apps

Make a playlist from your collection in the streaming app you use, then share it.

**Choosing what goes in:** tick records in the collection, or use what's on screen (a search, a filter, a folder: "my Northern Soul 7"s"), or a mixtape (6b). For a single, both sides or only the A side. For an album or EP, every track, or the ones you pick from its tracklist.

**Finding each song in the service:** by artist and track title (from the Discogs tracklist, or the record's title for a single), helped by the year. Each match is shown before anything is made, marked:
- **found** (a confident match);
- **check** (a near miss, e.g. a live version or a later re-recording: you choose, or swap it for another result);
- **not there** (the service doesn't have it: it's left out, and listed so you know).

A song is never quietly swapped for a different version.

**Making it:**

| Service | How | Limits |
|---|---|---|
| **Spotify** | Sign in to your Spotify account in the app (Spotify's own sign-in page); the playlist is made in your account. | Since 2025 Spotify only allows an app outside its approved list for a few named users, which is fine for you and a few friends. Releasing it to everyone would need Spotify's approval, which is hard for a small app. |
| **YouTube / YouTube Music** | Sign in to your Google account; the playlist is made in your YouTube account (and shows in YouTube Music). | Google's daily allowance for an app runs out fast: each song search costs twice as much as adding a song, so roughly **100 songs a day** when they have to be searched for. Bigger playlists carry on the next day, or you can raise the allowance with Google. |
| **Apple Music** | Through Apple's MusicKit. | Needs the Apple developer account (see 7). Later. |
| **Any other service** (Tidal, Deezer, Amazon Music...) | **Export a playlist file** (CSV with artist, title and album, or M3U) that the common playlist-transfer services import into almost any app. | No sign-in needed in this app. |

**Sharing:** the phone's own share sheet, with the playlist's link (Spotify or YouTube), or the playlist file, or a plain list as text ("Side A: 1. Gene Chandler, Get Down..."). Each playlist remembers what it was made from, so it can be updated after you add records.

**Sign-ins** stay on the phone (in its secure storage), are only asked for when you first make a playlist for that service, and can be removed in Settings. The app only asks to make and change playlists, nothing else in your account. No service logos in the app's look (neutral names, as elsewhere), only the service names on the buttons.

---

## 6b. Mixtapes

Plan a real tape: choose its length, add songs, and see how much is left on each side.

**Tape lengths:** C46 (23 minutes a side), **C60 (30)**, **C90 (45)**, C120 (60), or your own length. Each side starts with a few seconds of leader before the music can start (5 seconds by default, changeable).

**Filling it:**
- Add songs from your collection: a record's sides, or tracks from an album's tracklist. A song can also be typed in, or be one that's only on a streaming service.
- Drag to reorder, or move a song from side A to side B.
- An optional gap between songs (2 seconds by default).
- *Fill side B from here* continues onto side B when side A is full.

**Time left, always on screen:** for each side, a bar and "12:40 left on side A" (or "1:15 over" in red). The song that won't fit is marked, and the app can suggest which song to move to the other side.

**Song lengths** come from (best first): the music file's length; the Discogs tracklist (when it lists durations; many old 7"s don't); the streaming service's version (when you've matched it, 6a); or what you type in. A song with no known length gets an **estimate** (3:00 for a single side, changeable) that's clearly marked as such, so the time left is shown as "about".

**Then:**
- **Print a J-card**, the paper insert for the cassette case, with the title, the two sides' songs and their times (a PDF, the right size to fold).
- **Make a playlist of it** (6a) to listen to in the same order.
- **Play it** in the player (6), from your files, in tape order.
- Save as many mixtapes as you like; one can also be a mixtape you already have, recorded long ago and logged so you know what's on it. It's tagged *Mixtape* and can have its own photo and ID tag like any other item.

The game's FlipAmp already has mixtapes; the two should read and write the same mixtape file (Phase 2, with the export to the game).

---

## 7. How it's built

- **Expo (React Native) with TypeScript**, one codebase for iPhone and Android.
  - **Why Expo:** iPhone apps are normally built on a Mac (and there's no Mac here). Expo's cloud build service (EAS Build) builds the iPhone version without one, and Android builds here or in the cloud.
  - Camera and barcodes: `expo-camera`. Database: `expo-sqlite`. Token: `expo-secure-store`. Playback: `expo-audio` (or `react-native-track-player` for lock-screen controls). CSV: `papaparse`. Label PDFs: `expo-print`.
- **Testing on your own phone:** Expo Go (Android or iPhone) during development, no store needed.
- **Publishing (later, if wanted):** an Apple Developer account (about $99 a year) for TestFlight and the App Store; a Google Play developer account ($25 once) for Play, or an Android `.apk` straight from itch.io / cheifwhat.com.
- **Neutral names** as everywhere else: no Discogs or other logos in the app's look; credits where the terms ask for them.

---

## 8. Working with the game

- **Same rules as the game:** the CSV columns, *Gone from Discogs*, the matching of files to records, stand-ins never passing for the real thing.
- **Phase 2: Export to the game.** A zip (your photos, ID tags, barcodes, items not on Discogs) that the game's Librarian imports. Your own sleeve photos then show on the records in your shop, and records you added on the phone appear in it.
- Later, maybe: the game's `Collection.db` the other way round, so the phone shows the game's links and covers.

---

## 9. Phases

1. **Phase 1, the collection in your pocket:** CSV import, list and grid, record pages, search and filters, Discogs artwork and tracklists (opt-in), stand-in artwork with its badge, your own photos, barcode scanning and linking, printable ID labels, items not on Discogs, back up / restore. The player with files on the phone.
2. **Phase 2:** mixtapes (C46 to C120, time left per side, J-card printing); playlists: the playlist file for any service first, then Spotify and YouTube; export to the game (and import in the Librarian), with mixtapes shared with FlipAmp; catalogue-number search from a photo (on-device text recognition); collection value from Discogs.
3. **Phase 3:** your PC's music over Wi-Fi; maybe sync between phone and game.

---

## 10. Questions to settle

- **The name:** "BlackCatBone Pocket" or something else?
- **Back-up place:** a file you save yourself (simplest), or iCloud / Google Drive?
- **ID labels:** QR (works with any phone camera) or a short printed barcode? And which label sheets do you have, or would you buy?
- **Free or paid,** and whether it goes in the App Store / Play Store or only to you at first (Expo Go / TestFlight / an Android file).
- **The player:** is phase 1 (files on the phone) enough to begin with, or is playing from the PC the main thing you want?
- **Playlists:** which service first: Spotify, YouTube Music, or the playlist file that works with any of them? (Spotify only for you and named friends unless Spotify approves the app; YouTube about 100 searched songs a day.)
- **Mixtapes:** do you want them before the streaming playlists, or after? And should a song's length estimate default to 3:00, or something else for your mostly-7" collection?
