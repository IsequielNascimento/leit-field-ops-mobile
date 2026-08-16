import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ExpoCameraEvidenceService } from '@/features/visits/infrastructure/camera/ExpoCameraEvidenceService';
import { VisitEvidenceScreen } from '@/features/visits/presentation/screens/VisitEvidenceScreen';
import { parseVisitEvidenceContext } from '@/features/visits/presentation/view-models/VisitEvidenceViewModel';

export default function VisitEvidenceRoute() {
  const router = useRouter();
  const { currentReading, pointId } = useLocalSearchParams<{
    currentReading?: string | string[];
    pointId?: string | string[];
  }>();
  const cameraService = useMemo(() => new ExpoCameraEvidenceService(), []);
  const context = parseVisitEvidenceContext(pointId, currentReading);

  return (
    <VisitEvidenceScreen
      cameraService={cameraService}
      context={context}
      onBack={() => router.back()}
    />
  );
}
