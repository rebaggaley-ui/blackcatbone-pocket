import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { migrate } from '@/lib/db';
import { artworkQueue } from '@/lib/lookups';
import { colours } from '@/lib/theme';

/** The collection lives in one database on the phone; it's made (or updated) before any screen reads it. */
export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="pocket.db" onInit={migrate}>
      <StatusBar style="light" />
      <ArtworkRunner />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colours.background },
          headerTintColor: colours.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colours.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Your collection' }} />
        <Stack.Screen name="record/[key]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </SQLiteProvider>
  );
}

/** Carries on finding artwork when the app opens, if you've switched a lookup on (it does nothing otherwise). */
function ArtworkRunner() {
  const db = useSQLiteContext();
  useEffect(() => {
    artworkQueue.start(db);
    return () => artworkQueue.stop();
  }, [db]);
  return null;
}
