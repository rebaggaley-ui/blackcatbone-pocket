import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json, plus Google's sign-in for YouTube playlists when the app's iPhone client ID is set (EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
 * see YOUTUBE-SETUP.md): the iPhone needs Google's address for coming back to the app after signing in. Android needs nothing here.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const plugins = [...(config.plugins ?? [])];
  if (iosClientId) {
    // "1234-abcd.apps.googleusercontent.com" comes back to the app as "com.googleusercontent.apps.1234-abcd".
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }]);
  }
  return { ...config, name: config.name ?? 'BlackCatBone Pocket', slug: config.slug ?? 'blackcatbone-pocket', plugins };
};
