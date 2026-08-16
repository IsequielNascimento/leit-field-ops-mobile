import { useLocalSearchParams, useRouter } from 'expo-router';

import { PointDetailsScreen } from '@/features/routes/presentation/screens/PointDetailsScreen';

export default function PointDetailsRoute() {
  const router = useRouter();
  const { pointId } = useLocalSearchParams<{ pointId?: string | string[] }>();

  return (
    <PointDetailsScreen
      onBack={() => router.back()}
      onStartVisit={(currentReading) => {
        if (typeof pointId !== 'string') {
          return;
        }

        router.push({
          pathname: '/visits/evidence',
          params: { currentReading: String(currentReading), pointId },
        });
      }}
      pointId={pointId}
    />
  );
}
