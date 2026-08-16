import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PointDetailsScreen } from '@/features/routes/presentation/screens/PointDetailsScreen';

export default function PointDetailsRoute() {
  const router = useRouter();
  const { pointId } = useLocalSearchParams<{ pointId?: string | string[] }>();

  return (
    <PointDetailsScreen
      onBack={() => router.back()}
      onStartVisit={(currentReading) => {
        Alert.alert(
          'Reading accepted',
          `Current reading: ${currentReading}. Evidence capture and visit completion continue in their dedicated tasks.`,
        );
      }}
      pointId={pointId}
    />
  );
}
