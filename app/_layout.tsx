import { Stack } from 'expo-router';

import { ConnectivityProvider } from '@/features/app-shell/presentation/ConnectivityProvider';
import { VisitSyncProvider } from '@/features/visits/presentation/VisitSyncProvider';
import { DatabaseProvider } from '@/shared/data/database';

export {
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  return (
    <ConnectivityProvider>
      <DatabaseProvider>
        <VisitSyncProvider>
          <Stack>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="points/[pointId]" options={{ headerShown: false }} />
            <Stack.Screen name="visits/evidence" options={{ headerShown: false }} />
          </Stack>
        </VisitSyncProvider>
      </DatabaseProvider>
    </ConnectivityProvider>
  );
}
