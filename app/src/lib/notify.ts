import { Alert, Platform } from 'react-native';

/** A message with an OK button: the phone's own alert, or the browser's when previewing on the web (where React Native's does nothing). */
export function tell(title: string, message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
