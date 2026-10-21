# BlackCatBone Pocket

The user's phone app (iPhone and Android) for viewing their music collection: Expo SDK 58 in `app/`. It's a project of its own, separate from the BlackCatBone game: don't change the game from here.

- **Start with `NEXT-SESSION.md`** (where things stand, what's next), then `README.md` and `POCKET-DESIGN.md`.
- Before touching any Expo or React Native API, read `app/AGENTS.md` and the versioned docs (docs.expo.dev/versions/v58.0.0); don't trust memory. Install packages with `npx expo install`.
- In `app/`, run `npm ci` (first time), then `npm run typecheck`, `npm run lint` and `npm test` before calling anything done.
- Online lookups stay opt-in, and the Discogs token stays in secure storage. Never put tokens in the code, git or chat.

## Where you might be running
- **On the user's PC** (Windows, the project at `C:\Users\rebag\OneDrive\Desktop\Claude Ideas\BlackCatBone Pocket`): Node.js is at `C:\Program Files\nodejs`. `test-data\` there holds the user's real Discogs export for `npm test`; it's never in git.
- **In a Claude Code cloud session** (from the user's phone): you have the GitHub repository rebaggaley-ui/blackcatbone-pocket and no PC files. `test-data/` isn't there, so the real-export tests are skipped. That's expected, not a failure.

## Getting changes onto the user's phone
The user has the app installed from an EAS **preview** build (Android `.apk`, version 0.1.0). It checks the **preview** channel for updates each time it starts.
- **Most changes** (anything in JavaScript or TypeScript, screens, styles, assets): commit, then publish an over-the-air update. The phone gets it on the next restart or two:

  `npx eas-cli@latest update --channel preview --environment preview --message "<what changed>" --non-interactive`
- **New native code** (a new Expo module with native parts, such as the barcode scanner, or permission or plugin changes in `app.json`): updates can't carry it. Raise `version` in `app/app.json` (for example 0.1.0 to 0.2.0), commit, and start a new build:

  `npx eas-cli@latest build -p android --profile preview --non-interactive --no-wait`

  Then give the user the build page link from expo.dev, so they can install the new `.apk`. Updates published for the old version don't reach the new build, and the reverse.
- The EAS commands need `EXPO_TOKEN` (set in the cloud environment, or a signed-in EAS CLI on the PC). If they say you're not logged in, ask the user to set it; don't try to sign in yourself.
- **Ask the user before publishing an update or starting a build**: they reach the user's own phone. Commit and push your work as you go, with clear messages.
