import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PointDetailsScreen } from '@/features/routes/presentation/screens/PointDetailsScreen';

export default function PointDetailsRoute() {
  const router = useRouter();
  const { pointId } = useLocalSearchParams<{ pointId?: string | string[] }>();

  return (
    <PointDetailsScreen
      onBack={() => router.back()}
      onStartVisit={() => {
        Alert.alert(
          'Visit ready',
          'This point is selected. Continue with reading registration when the visit flow is available.',
        );
      }}
      pointId={pointId}
    />
  );
}
