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
import { ExpoCameraPreview } from '../../infrastructure/camera/ExpoCameraPreview';
import type { VisitEvidenceContext, VisitEvidenceState } from '../view-models/VisitEvidenceViewModel';
import {
  handleCameraOutcome,
  requestCamera,
  resetEvidenceState,
} from '../view-models/VisitEvidenceViewModel';
import { BaseCard, PrimaryButton, SectionLabel, StatusBadge } from '@/shared/presentation/components';
import { tokens } from '@/shared/presentation/theme';

interface VisitEvidenceScreenProps {
  cameraService: CameraPermissionGateway & DurablePhotoStorage;
  context: VisitEvidenceContext | null;
  onBack: () => void;
  onPhotoReady?: (photoUri: string) => void;
}

export function VisitEvidenceScreen({
  cameraService,
  context,
  onBack,
  onPhotoReady,
}: VisitEvidenceScreenProps) {
  const [state, setState] = useState<VisitEvidenceState>({ kind: 'ready' });

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

    const nextState = await handleCameraOutcome(cameraService, outcome);
    setState(nextState);

    if (nextState.kind === 'captured') {
      onPhotoReady?.(nextState.photoUri);
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
      </ScrollView>
    </SafeAreaView>
  );
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
