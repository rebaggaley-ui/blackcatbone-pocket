# Setting up YouTube playlists

BlackCatBone Pocket can make a playlist in your YouTube account from records you tick (*Playlist* on the collection screen, *YouTube playlist* on a record's page, or Settings > *YouTube playlists*). Before it can sign in to your Google account, Google needs to know about the app. That's a one-off job only you can do, on Google's website, and it takes about 15 minutes. Nothing here is secret: client IDs aren't passwords.

Two things to know first:
- **Expo Go can't sign in to Google.** Making playlists works in the app's own build (the `.apk` from `eas build --profile preview`, or an iPhone build). In Expo Go the playlist screen still works for ticking records and *Share as a list*, and it says why it can't sign in.
- **Google's daily allowance** for the YouTube Data API is 10,000 units per app. Searching for a song costs 100 and adding it costs 50, so about **66 new songs a day**. A song found once is remembered on the phone, so making another playlist with it later only costs the 50. A big playlist that runs out carries on the next day (*Carry on* on the playlist screen). The day restarts at midnight California time (8am in the UK in winter).

## 1. A Google Cloud project
1. Go to https://console.cloud.google.com/ and sign in with the Google account whose YouTube you'll use.
2. At the top, *Select a project* > *New project*. Name it "BlackCatBone Pocket" and create it.
3. In the search bar, find **YouTube Data API v3** and tap *Enable*.

## 2. The sign-in screen (OAuth consent screen)
1. Menu > *Google Auth Platform* (or *APIs & Services* > *OAuth consent screen*) > *Get started*.
2. App name "BlackCatBone Pocket", your email as support and contact email. Audience: **External**.
3. Under *Audience*, leave it in **Testing** and add your own Google address as a **test user** (and any friends who'll use it; up to 100).
4. Under *Data access*, *Add or remove scopes*, add `https://www.googleapis.com/auth/youtube` ("Manage your YouTube account"). The app only uses it to search, make playlists and add songs to them.

When you sign in on the phone, Google shows "Google hasn't verified this app": that's expected for a testing app. Tap *Continue*.

## 3. The client IDs
Menu > *Google Auth Platform* > *Clients* > *Create client*, three times:

1. **Web application**, named "Pocket web". No addresses needed. Copy its **Client ID**: this is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Android's sign-in needs it too).
2. **Android**:
   - Package name: `com.cheifwhat.bcbpocket`.
   - SHA-1 certificate fingerprint: in `app\`, run `npx eas-cli@latest credentials`, choose Android, then the `preview` profile; it shows the keystore's **SHA1 Fingerprint**. Paste that.
   - Nothing to copy afterwards: Google recognises the app by its package and fingerprint.
3. **iOS** (only when there's an iPhone build): bundle ID `com.cheifwhat.bcbpocket`. Copy its **Client ID**: this is `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

## 4. Give the IDs to the app's builds
In `app\`, for each ID (the iOS one only if you made it):

```bash
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "<the web client ID>" --visibility plaintext
npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "<the iOS client ID>" --visibility plaintext
```

Do the same with `--environment production` when you make production builds. For a build on the PC, put the same lines in `app\.env.local` instead (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...`); it's kept out of git.

Then make a new build (`npx eas-cli@latest build --profile preview --platform android`) and install it: the sign-in is native code, so an update over the air isn't enough the first time.

## 5. Try it
Open the app's build, tick a few records on *Playlist*, tap *Find on YouTube*, pick your Google account, and check the matches:
- **Found**: a confident match (the artist's own or YouTube Music's "Topic" upload first).
- **Check**: a near miss (a live take, a cover, someone else's channel). It's left out unless you tap *Use it* or choose from *Other results*.
- **Not there**: YouTube hasn't got it; it's listed so you know.

Then *Make the playlist*. Settings > *YouTube playlists* > *Sign out* takes the app's access away again (your playlists stay on YouTube).

If something fails, the app says what Google answered. "The YouTube Data API isn't switched on" means step 1.3; a sign-in error code 10 (DEVELOPER_ERROR) on Android almost always means the SHA-1 or package name in step 3.2 doesn't match the build.
