import { useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  CameraCaptureOutcome,
  CameraPermissionGateway,
  DurablePhotoStorage,
} from '../../domain/services/CameraEvidenceService';
import type { VisitPhotoProcessor } from '../../domain/services/ImageProcessingService';
import type {
  CurrentPositionProvider,
  LocationPermissionGateway,
  LocationReading,
} from '../../domain/services/LocationEvidenceService';
import { ExpoCameraPreview } from '../../infrastructure/camera/ExpoCameraPreview';
import type {
  VisitCompletionState,
  VisitEvidenceContext,
  VisitEvidenceState,
  VisitLocationState,
} from '../view-models/VisitEvidenceViewModel';
import {
  handleCameraOutcome,
  requestCamera,
  requestVisitLocation,
  resetCompletionState,
  resetEvidenceState,
  resetLocationState,
} from '../view-models/VisitEvidenceViewModel';
import { ConnectivityBanner } from '@/features/app-shell/presentation/components/ConnectivityBanner';
import { BaseCard, PrimaryButton, SectionLabel, StatusBadge } from '@/shared/presentation/components';
import { tokens } from '@/shared/presentation/theme';

interface VisitEvidenceScreenProps {
  cameraService: CameraPermissionGateway & DurablePhotoStorage;
  context: VisitEvidenceContext | null;
  locationService: LocationPermissionGateway & CurrentPositionProvider;
  onBack: () => void;
  onCompleteVisit: (photoUri: string, reading: LocationReading) => Promise<VisitCompletionState>;
  onVisitSaved: () => void;
  onLocationReady?: (reading: LocationReading) => void;
  onPhotoReady?: (photoUri: string) => void;
  photoProcessor: VisitPhotoProcessor;
}

export function VisitEvidenceScreen({
  cameraService,
  context,
  locationService,
  onBack,
  onCompleteVisit,
  onLocationReady,
  onPhotoReady,
  onVisitSaved,
  photoProcessor,
}: VisitEvidenceScreenProps) {
  const [state, setState] = useState<VisitEvidenceState>({ kind: 'ready' });
  const [locationState, setLocationState] = useState<VisitLocationState>({ kind: 'idle' });
  const [completionState, setCompletionState] = useState<VisitCompletionState>({ kind: 'idle' });

  if (!context) {
    return (
      <FeedbackScreen
        description="The visit context is invalid. Return to the point and enter the reading again."
        label="Visit unavailable"
        onBack={onBack}
      />
    );
  }

  const openCamera = async () => {
    setState({ kind: 'requesting-permission' });
    setState(await requestCamera(cameraService));
  };

  const receiveCameraOutcome = async (outcome: CameraCaptureOutcome) => {
    if (outcome.kind === 'captured') {
      setState({ kind: 'saving' });
    }

    const nextState = await handleCameraOutcome(photoProcessor, cameraService, outcome);
    setState(nextState);

    if (nextState.kind === 'captured') {
      onPhotoReady?.(nextState.photoUri);
    }
  };

  const captureLocation = async () => {
    setLocationState({ kind: 'requesting' });

    const nextState = await requestVisitLocation(locationService, locationService);
    setLocationState(nextState);

    if (nextState.kind === 'captured') {
      onLocationReady?.(nextState.reading);
    }
  };

  const evidenceIsComplete = state.kind === 'captured' && locationState.kind === 'captured';

  const completeVisit = async () => {
    if (
      completionState.kind === 'saving' ||
      state.kind !== 'captured' ||
      locationState.kind !== 'captured'
    ) {
      return;
    }

    setCompletionState({ kind: 'saving' });
    const result = await onCompleteVisit(state.photoUri, locationState.reading);
    setCompletionState(result);

    // MARK: the visit is done, so the agent belongs back on the route, not on
    // the point they just finished with another back tap to go
    if (result.kind === 'saved') {
      onVisitSaved();
    }
  };

  if (state.kind === 'camera') {
    return (
      <SafeAreaView style={styles.cameraScreen}>
        <View style={styles.cameraHeader}>
          <SectionLabel style={styles.inverseLabel}>Photo evidence</SectionLabel>
          <Text style={styles.cameraInstruction}>Frame the meter clearly, then capture the photo.</Text>
        </View>
        <ExpoCameraPreview
          onCancel={() => void receiveCameraOutcome({ kind: 'cancelled' })}
          onOutcome={(outcome) => void receiveCameraOutcome(outcome)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
        <View style={styles.appBar}>
          <Pressable
            accessibilityLabel="Back to point details"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backLabel}>‹ Point</Text>
          </Pressable>
          <SectionLabel style={styles.inverseLabel}>Visit evidence</SectionLabel>
          <Text style={styles.title}>Capture meter photo</Text>
        </View>

        <ConnectivityBanner />

        <BaseCard style={styles.contextCard}>
          <ContextRow label="Point" value={String(context.pointId)} />
          <ContextRow label="Current reading" value={String(context.currentReading)} />
        </BaseCard>

        <View style={styles.evidenceArea}>
          <SectionLabel>Photo evidence</SectionLabel>
          <Text style={styles.description}>
            Capture the meter with the device camera. The photo stays stored on this device.
          </Text>

          {state.kind === 'captured' ? (
            <BaseCard accessibilityLabel="Photo evidence captured" style={styles.successCard}>
              <View style={styles.statusRow}>
                <StatusBadge label="Captured" tone="success" />
                <Text accessibilityLiveRegion="polite" style={styles.successText}>
                  Evidence captured and stored on this device.
                </Text>
              </View>
              <Image
                accessibilityLabel="Captured meter evidence preview"
                resizeMode="cover"
                source={{ uri: state.photoUri }}
                style={styles.preview}
              />
            </BaseCard>
          ) : null}

          {state.kind === 'ready' && state.notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {state.notice}
            </Text>
          ) : null}

          {state.kind === 'denied' ? (
            <BaseCard accessibilityLiveRegion="assertive" style={styles.errorCard}>
              <StatusBadge label="Camera blocked" tone="danger" />
              <Text style={styles.errorText}>
                Camera permission is required to capture visit evidence.
              </Text>
              {state.canAskAgain ? (
                <PrimaryButton label="Request camera permission" onPress={() => void openCamera()} />
              ) : (
                <PrimaryButton label="Open app settings" onPress={() => void Linking.openSettings()} />
              )}
            </BaseCard>
          ) : null}

          {state.kind === 'error' ? (
            <BaseCard accessibilityLiveRegion="assertive" style={styles.errorCard}>
              <StatusBadge label="Capture failed" tone="danger" />
              <Text style={styles.errorText}>{state.message}</Text>
              <PrimaryButton
                label="Try camera again"
                onPress={() => {
                  setState(resetEvidenceState());
                  void openCamera();
                }}
              />
            </BaseCard>
          ) : null}

          {state.kind !== 'captured' && state.kind !== 'denied' && state.kind !== 'error' ? (
            <PrimaryButton
              accessibilityState={{ busy: state.kind === 'requesting-permission' || state.kind === 'saving' }}
              disabled={state.kind === 'requesting-permission' || state.kind === 'saving'}
              label={
                state.kind === 'requesting-permission'
                  ? 'Checking camera permission…'
                  : state.kind === 'saving'
                    ? 'Storing photo…'
                    : 'Capture photo'
              }
              onPress={() => void openCamera()}
            />
          ) : null}
        </View>

        <View style={styles.evidenceArea}>
          <SectionLabel>Location evidence</SectionLabel>
          <Text style={styles.description}>
            Record where this visit was carried out. The coordinates come from the device and stay
            stored on it.
          </Text>

          {locationState.kind === 'captured' ? (
            <BaseCard accessibilityLabel="Location evidence captured" style={styles.successCard}>
              <View style={styles.statusRow}>
                <StatusBadge label="Location recorded" tone="success" />
                <Text accessibilityLiveRegion="polite" style={styles.successText}>
                  Coordinates reported by this device.
                </Text>
              </View>
              <ContextRow label="Latitude" value={formatCoordinate(locationState.reading.latitude)} />
              <ContextRow label="Longitude" value={formatCoordinate(locationState.reading.longitude)} />
              <ContextRow label="Captured at" value={formatCaptureTime(locationState.reading.capturedAt)} />
            </BaseCard>
          ) : null}

          {locationState.kind === 'denied' ? (
            <BaseCard accessibilityLiveRegion="assertive" style={styles.errorCard}>
              <StatusBadge label="Location blocked" tone="danger" />
              <Text style={styles.errorText}>
                Location permission is required to record where the visit happened.
              </Text>
              {locationState.canAskAgain ? (
                <PrimaryButton
                  label="Request location permission"
                  onPress={() => void captureLocation()}
                />
              ) : (
                <PrimaryButton label="Open app settings" onPress={() => void Linking.openSettings()} />
              )}
            </BaseCard>
          ) : null}

          {locationState.kind === 'error' ? (
            <BaseCard accessibilityLiveRegion="assertive" style={styles.errorCard}>
              <StatusBadge label="Location failed" tone="danger" />
              <Text style={styles.errorText}>{locationState.message}</Text>
              <PrimaryButton
                label="Try location again"
                onPress={() => {
                  setLocationState(resetLocationState());
                  void captureLocation();
                }}
              />
            </BaseCard>
          ) : null}

          {locationState.kind === 'idle' || locationState.kind === 'requesting' ? (
            <PrimaryButton
              accessibilityState={{ busy: locationState.kind === 'requesting' }}
              disabled={locationState.kind === 'requesting'}
              label={
                locationState.kind === 'requesting'
                  ? 'Reading current location…'
                  : 'Record current location'
              }
              onPress={() => void captureLocation()}
            />
          ) : null}
        </View>

        <View style={styles.evidenceArea}>
          <SectionLabel>Complete visit</SectionLabel>
          <Text style={styles.description}>
            Saving stores the reading, photo and location on this device. No connection is needed.
          </Text>

          {completionState.kind === 'saved' ? (
            <BaseCard accessibilityLabel="Visit saved on this device" style={styles.successCard}>
              <View style={styles.statusRow}>
                <StatusBadge label="Visited · pending sync" tone="warning" />
                <Text accessibilityLiveRegion="polite" style={styles.successText}>
                  Visit saved on this device and waiting to be synchronized.
                </Text>
              </View>
              <PrimaryButton label="Back to route" onPress={onVisitSaved} />
            </BaseCard>
          ) : null}

          {completionState.kind === 'error' ? (
            <BaseCard accessibilityLiveRegion="assertive" style={styles.errorCard}>
              <StatusBadge label="Visit not saved" tone="danger" />
              <Text style={styles.errorText}>{completionState.message}</Text>
              <PrimaryButton
                label="Try saving again"
                onPress={() => {
                  setCompletionState(resetCompletionState());
                  void completeVisit();
                }}
              />
            </BaseCard>
          ) : null}

          {completionState.kind === 'idle' || completionState.kind === 'saving' ? (
            <>
              {!evidenceIsComplete ? (
                <Text style={styles.notice}>
                  Capture the meter photo and the current location to complete this visit.
                </Text>
              ) : null}
              <PrimaryButton
                accessibilityState={{ busy: completionState.kind === 'saving' }}
                disabled={!evidenceIsComplete || completionState.kind === 'saving'}
                label={completionState.kind === 'saving' ? 'Saving visit…' : 'Complete visit'}
                onPress={() => void completeVisit()}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

function formatCaptureTime(capturedAt: string): string {
  const captureTime = new Date(capturedAt);
  return Number.isFinite(captureTime.getTime()) ? captureTime.toLocaleString() : capturedAt;
}

interface ContextRowProps {
  label: string;
  value: string;
}

function ContextRow({ label, value }: ContextRowProps) {
  return (
    <View style={styles.contextRow}>
      <SectionLabel>{label}</SectionLabel>
      <Text selectable style={styles.contextValue}>{value}</Text>
    </View>
  );
}

interface FeedbackScreenProps {
  description: string;
  label: string;
  onBack: () => void;
}

function FeedbackScreen({ description, label, onBack }: FeedbackScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.feedbackContainer}>
        <SectionLabel>Visit evidence</SectionLabel>
        <Text style={styles.feedbackTitle}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
        <PrimaryButton label="Back to point" onPress={onBack} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appBar: {
    backgroundColor: tokens.colors.chrome,
    borderColor: tokens.colors.chrome,
    borderWidth: tokens.borders.width.strong,
    gap: tokens.spacing.sm,
    padding: tokens.spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: tokens.spacing.sm,
  },
  backLabel: {
    ...tokens.typography.action,
    color: tokens.colors.textInverse,
  },
  cameraHeader: {
    backgroundColor: tokens.colors.chrome,
    gap: tokens.spacing.xs,
    padding: tokens.spacing.lg,
  },
  cameraInstruction: {
    ...tokens.typography.body,
    color: tokens.colors.textInverse,
  },
  cameraScreen: {
    backgroundColor: tokens.colors.chrome,
    flex: 1,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
  },
  contextCard: {
    flexDirection: 'row',
    gap: tokens.spacing.lg,
    marginHorizontal: tokens.spacing.lg,
  },
  contextRow: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  contextValue: {
    ...tokens.typography.body,
    color: tokens.colors.text,
    fontWeight: '700',
  },
  description: {
    ...tokens.typography.body,
    color: tokens.colors.textMuted,
  },
  errorCard: {
    borderColor: tokens.colors.status.danger.border,
    gap: tokens.spacing.md,
  },
  errorText: {
    ...tokens.typography.body,
    color: tokens.colors.status.danger.text,
  },
  evidenceArea: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  feedbackContainer: {
    gap: tokens.spacing.md,
    maxWidth: 640,
    padding: tokens.spacing.lg,
    width: '100%',
  },
  feedbackTitle: {
    ...tokens.typography.title,
    color: tokens.colors.chrome,
  },
  inverseLabel: {
    color: tokens.colors.textInverse,
  },
  notice: {
    ...tokens.typography.body,
    color: tokens.colors.textMuted,
  },
  pressed: {
    opacity: 0.72,
  },
  preview: {
    aspectRatio: 4 / 3,
    backgroundColor: tokens.colors.background,
    borderColor: tokens.colors.status.success.border,
    borderWidth: tokens.borders.width.thin,
    width: '100%',
  },
  screen: {
    alignItems: 'center',
    backgroundColor: tokens.colors.background,
    flex: 1,
  },
  scrollView: {
    maxWidth: 640,
    width: '100%',
  },
  statusRow: {
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  successCard: {
    borderColor: tokens.colors.status.success.border,
    gap: tokens.spacing.md,
  },
  successText: {
    ...tokens.typography.body,
    color: tokens.colors.status.success.text,
  },
  title: {
    ...tokens.typography.title,
    color: tokens.colors.textInverse,
    fontSize: 22,
    lineHeight: 28,
  },
});
