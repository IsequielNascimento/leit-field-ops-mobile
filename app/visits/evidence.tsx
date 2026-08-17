import { useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SQLiteRouteRepository } from '@/features/routes/data/repositories/SQLiteRouteRepository';
import { SQLiteVisitRepository } from '@/features/visits/data/repositories/SQLiteVisitRepository';
import { ExpoCameraEvidenceService } from '@/features/visits/infrastructure/camera/ExpoCameraEvidenceService';
import { ExpoVisitPhotoProcessor } from '@/features/visits/infrastructure/imaging/ExpoVisitPhotoProcessor';
import { ExpoLocationEvidenceService } from '@/features/visits/infrastructure/location/ExpoLocationEvidenceService';
import { VisitEvidenceScreen } from '@/features/visits/presentation/screens/VisitEvidenceScreen';
import {
  parseVisitEvidenceContext,
  submitCompletedVisit,
} from '@/features/visits/presentation/view-models/VisitEvidenceViewModel';

export default function VisitEvidenceRoute() {
  const database = useSQLiteContext();
  const router = useRouter();
  const { currentReading, pointId } = useLocalSearchParams<{
    currentReading?: string | string[];
    pointId?: string | string[];
  }>();
  const cameraService = useMemo(() => new ExpoCameraEvidenceService(), []);
  const locationService = useMemo(() => new ExpoLocationEvidenceService(), []);
  const photoProcessor = useMemo(() => new ExpoVisitPhotoProcessor(), []);
  const routeRepository = useMemo(() => new SQLiteRouteRepository(database), [database]);
  const visitRepository = useMemo(() => new SQLiteVisitRepository(database), [database]);
  const context = parseVisitEvidenceContext(pointId, currentReading);

  return (
    <VisitEvidenceScreen
      cameraService={cameraService}
      context={context}
      locationService={locationService}
      onBack={() => router.back()}
      onCompleteVisit={async (photoUri, reading) => {
        if (!context) {
          return { kind: 'error', message: 'The visit context is no longer valid.' };
        }

        return submitCompletedVisit(routeRepository, visitRepository, context, photoUri, reading);
      }}
      photoProcessor={photoProcessor}
    />
  );
}
