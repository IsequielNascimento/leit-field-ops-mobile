import { Stack } from 'expo-router';

import { DatabaseProvider } from '@/shared/data/database';

export {
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  return (
    <DatabaseProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="points/[pointId]" options={{ headerShown: false }} />
      </Stack>
    </DatabaseProvider>
  );
}
