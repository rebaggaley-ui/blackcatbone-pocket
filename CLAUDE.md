# BlackCatBone Pocket

The user's phone app (iPhone and Android) for viewing their music collection: Expo SDK 58 in `app\`. It's a project of its own, separate from the BlackCatBone game (`Claude Ideas\Cozy Music Shop\FlipSide`): don't change the game from here.

- **Start with `NEXT-SESSION.md`** (where things stand, what's next), then `README.md` and `POCKET-DESIGN.md`.
- Before touching any Expo or React Native API, read `app\AGENTS.md` and the versioned docs (docs.expo.dev/versions/v58.0.0); don't trust memory.
- Run `npm run typecheck`, `npm run lint` and `npm test` in `app\` before calling anything done. Install packages with `npx expo install`.
- Node.js is at `C:\Program Files\nodejs` (add it to PATH if a shell can't find `node`).
- Online lookups stay opt-in, and the Discogs token stays in secure storage. Don't commit to git without asking.
