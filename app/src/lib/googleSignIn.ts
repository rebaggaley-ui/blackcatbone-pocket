import { Platform, TurboModuleRegistry } from 'react-native';
import { YOUTUBE_SCOPE } from './youtube';

/**
 * Signing in to your Google account, for making playlists in your YouTube account. Google's own sign-in (the
 * phone's account picker) does it, and keeps the sign-in in the phone's secure storage; the app only asks to make
 * and change playlists.
 *
 * It needs the app's Google client IDs (see YOUTUBE-SETUP.md), set when the app is built:
 * EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (both phones) and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (iPhone). It doesn't work in
 * Expo Go, which can't carry Google's sign-in: it needs the app's own build.
 */

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

/** Whether this copy of the app can sign in to Google, and if not, why not (in plain words). */
export function googleSignInProblem(): string | null {
  if (Platform.OS === 'web') {
    return 'Making a YouTube playlist works on a phone, not in a web browser.';
  }
  if (!WEB_CLIENT_ID || (Platform.OS === 'ios' && !IOS_CLIENT_ID)) {
    return 'This copy of the app hasn’t been given its Google client IDs yet, so it can’t sign in to Google. The steps are in YOUTUBE-SETUP.md.';
  }
  // Google's sign-in is native code: Expo Go doesn't have it, only the app's own build does.
  if (!TurboModuleRegistry.get('RNGoogleSignin')) {
    return 'Signing in to Google needs the app’s own build: Expo Go can’t do it. The steps are in YOUTUBE-SETUP.md.';
  }
  return null;
}

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');
let loaded: Promise<GoogleSignInModule> | null = null;

/** Loaded only when it's there (so Expo Go, which hasn't got it, still opens the app). */
function signInModule(): Promise<GoogleSignInModule> {
  const problem = googleSignInProblem();
  if (problem) {
    return Promise.reject(new Error(problem));
  }
  loaded ??= import('@react-native-google-signin/google-signin').then((module) => {
    module.GoogleSignin.configure({ scopes: [YOUTUBE_SCOPE], webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID || undefined });
    return module;
  });
  return loaded;
}

export interface GoogleAccount {
  email: string;
  accessToken: string;
}

/**
 * A YouTube sign-in: the one already on the phone, or (when `ask` is true) Google's account picker. Null when there's
 * none and you weren't asked, or you cancelled.
 */
export async function signInToGoogle(ask: boolean): Promise<GoogleAccount | null> {
  const { GoogleSignin, isErrorWithCode, statusCodes } = await signInModule();
  try {
    let user = (await GoogleSignin.signInSilently()).data;
    if (!user && ask) {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      user = (await GoogleSignin.signIn()).data;
    }
    if (!user) {
      return null;
    }
    if (!user.scopes.includes(YOUTUBE_SCOPE)) {
      if (!ask) {
        return null;
      }
      user = (await GoogleSignin.addScopes({ scopes: [YOUTUBE_SCOPE] }))?.data ?? null;
      if (!user?.scopes.includes(YOUTUBE_SCOPE)) {
        return null;
      }
    }
    const { accessToken } = await GoogleSignin.getTokens();
    return { email: user.user.email, accessToken };
  } catch (error) {
    if (isErrorWithCode(error) && (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.SIGN_IN_REQUIRED)) {
      return null;
    }
    if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play services need updating on this phone before you can sign in.');
    }
    throw error;
  }
}

/** A fresh sign-in after YouTube said the last one had run out. */
export async function refreshGoogleSignIn(expiredToken: string): Promise<GoogleAccount | null> {
  const { GoogleSignin } = await signInModule();
  await GoogleSignin.clearCachedAccessToken(expiredToken);
  return signInToGoogle(false);
}

/** Who's signed in (without asking anything), or null. */
export async function currentGoogleAccount(): Promise<string | null> {
  if (googleSignInProblem()) {
    return null;
  }
  try {
    const { GoogleSignin } = await signInModule();
    return GoogleSignin.getCurrentUser()?.user.email ?? (await GoogleSignin.signInSilently()).data?.user.email ?? null;
  } catch {
    return null;
  }
}

/** Signs out and takes back the app's access to your YouTube account (your playlists stay on YouTube). */
export async function signOutOfGoogle(): Promise<void> {
  const { GoogleSignin } = await signInModule();
  try {
    await GoogleSignin.revokeAccess();
  } finally {
    await GoogleSignin.signOut();
  }
}
