import { useCallback, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SQLiteRouteRepository } from '../../data/repositories/SQLiteRouteRepository';
import { ConnectivityBanner } from '@/features/app-shell/presentation/components/ConnectivityBanner';
import { SQLiteVisitRepository } from '@/features/visits/data/repositories/SQLiteVisitRepository';
import { deriveVisitDisplayStatus } from '@/features/visits/domain/use-cases/DeriveVisitDisplayStatus';
import { BaseCard, PrimaryButton, SectionLabel, StatusBadge } from '@/shared/presentation/components';
import { tokens } from '@/shared/presentation/theme';
import { validateCurrentReading } from '@/features/visits/domain/validation/validateCurrentReading';
import {
  loadPointDetails,
  type PointDetailsState,
  type PointIdParameter,
} from '../view-models/PointDetailsViewModel';

interface PointDetailsScreenProps {
  onBack: () => void;
  onStartVisit: (currentReading: number) => void;
  pointId: PointIdParameter;
}

export function PointDetailsScreen({ onBack, onStartVisit, pointId }: PointDetailsScreenProps) {
  const database = useSQLiteContext();
  const routeRepository = useMemo(() => new SQLiteRouteRepository(database), [database]);
  const visitRepository = useMemo(() => new SQLiteVisitRepository(database), [database]);
  const [state, setState] = useState<PointDetailsState>({ kind: 'loading' });
  const [currentReading, setCurrentReading] = useState('');
  const [readingError, setReadingError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    setState(await loadPointDetails(routeRepository, visitRepository, pointId));
  }, [pointId, routeRepository, visitRepository]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleCurrentReadingChange = (value: string) => {
    setCurrentReading(value);
    setReadingError(null);
  };

  const handleStartVisit = () => {
    const result = validateCurrentReading(currentReading);

    if (result.kind === 'required') {
      setReadingError('Enter the new reading to continue.');
      return;
    }

    if (result.kind === 'invalid') {
      setReadingError('Enter a valid numeric reading.');
      return;
    }

    setReadingError(null);
    onStartVisit(result.value);
  };

  if (state.kind === 'loading') {
    return <FeedbackScreen busy label="Loading local point…" onBack={onBack} />;
  }

  if (state.kind === 'invalid') {
    return (
      <FeedbackScreen
        description="The point identifier is invalid. Return to the route and select a saved point."
        label="Point unavailable"
        onBack={onBack}
      />
    );
  }

  if (state.kind === 'empty') {
    return (
      <FeedbackScreen
        description="This point is not available in local storage."
        label="Point unavailable"
        onBack={onBack}
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <FeedbackScreen
        actionLabel="Retry local point"
        description={state.message}
        label="Could not load local point"
        onBack={onBack}
        onRetry={() => void load()}
      />
    );
  }

  const { latestVisit, point } = state;
  const displayStatus = deriveVisitDisplayStatus(point.status, latestVisit);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
        <View style={styles.appBar}>
          <Pressable
            accessibilityLabel="Back to route"
            accessibilityRole="button"
            hitSlop={12}
            onPress={onBack}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          >
            <Text style={styles.backLabel}>‹ Route</Text>
          </Pressable>
          <View style={styles.appBarTitleRow}>
            <View style={styles.appBarTitle}>
              <SectionLabel style={styles.appBarLabel}>Point details</SectionLabel>
              <Text style={styles.installation}>{point.customer}</Text>
              <Text style={styles.appBarInstallation}>{point.installationCode}</Text>
            </View>
            <StatusBadge label={displayStatus.label} tone={displayStatus.tone} />
          </View>
        </View>

        <ConnectivityBanner />

        <BaseCard style={styles.contextCard}>
          <DetailRow label="Installation" value={point.installationCode} />
          <DetailRow label="Address" value={point.address} />
          <DetailRow label="Meter number" value={point.meterNumber} />
          <DetailRow label="Previous reading" value={String(point.previousReading)} />
          <View style={styles.detailRow}>
            <SectionLabel>Status</SectionLabel>
            <StatusBadge label={displayStatus.label} tone={displayStatus.tone} />
          </View>
        </BaseCard>

        <View style={styles.actionArea}>
          <SectionLabel>New reading</SectionLabel>
          <Text style={styles.actionDescription}>
            Enter the current meter reading to continue the visit.
          </Text>
          <TextInput
            accessibilityHint={readingError ?? 'Enter a numeric meter reading.'}
            accessibilityLabel="New reading"
            keyboardType="numeric"
            onChangeText={handleCurrentReadingChange}
            placeholder="Enter current reading"
            placeholderTextColor={tokens.colors.textMuted}
            style={[styles.readingInput, readingError && styles.readingInputInvalid]}
            value={currentReading}
          />
          {readingError ? (
            <Text accessibilityLiveRegion="polite" style={styles.readingError}>
              {readingError}
            </Text>
          ) : null}
          <PrimaryButton label="Continue visit" onPress={handleStartVisit} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <SectionLabel>{label}</SectionLabel>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

interface FeedbackScreenProps {
  actionLabel?: string;
  busy?: boolean;
  description?: string;
  label: string;
  onBack: () => void;
  onRetry?: () => void;
}

function FeedbackScreen({
  actionLabel,
  busy,
  description,
  label,
  onBack,
  onRetry,
}: FeedbackScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.feedbackContainer}>
        <Pressable
          accessibilityLabel="Back to route"
          accessibilityRole="button"
          hitSlop={12}
          onPress={onBack}
          style={({ pressed }) => [styles.feedbackBack, pressed && styles.pressed]}
        >
          <Text style={styles.feedbackBackLabel}>‹ Route</Text>
        </Pressable>
        <SectionLabel>Point details</SectionLabel>
        <Text style={styles.feedbackTitle}>{label}</Text>
        {busy ? (
          <ActivityIndicator
            accessibilityLabel={label}
            accessibilityRole="progressbar"
            color={tokens.colors.primary}
            style={styles.feedbackIndicator}
          />
        ) : null}
        {description ? <Text style={styles.feedbackDescription}>{description}</Text> : null}
        {actionLabel && onRetry ? <PrimaryButton label={actionLabel} onPress={onRetry} style={styles.retry} /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actionArea: {
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
  },
  actionDescription: {
    ...tokens.typography.body,
    color: tokens.colors.textMuted,
    marginBottom: tokens.spacing.sm,
  },
  appBar: {
    backgroundColor: tokens.colors.chrome,
    borderColor: tokens.colors.chrome,
    borderWidth: tokens.borders.width.strong,
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
  },
  appBarInstallation: {
    ...tokens.typography.body,
    color: tokens.colors.textInverse,
  },
  appBarLabel: {
    color: tokens.colors.textInverse,
  },
  appBarTitle: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  appBarTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.spacing.md,
    justifyContent: 'space-between',
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backLabel: {
    ...tokens.typography.action,
    color: tokens.colors.textInverse,
  },
  content: {
    gap: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
  },
  contextCard: {
    gap: tokens.spacing.md,
    marginHorizontal: tokens.spacing.lg,
  },
  detailRow: {
    gap: tokens.spacing.xs,
  },
  detailValue: {
    ...tokens.typography.body,
    color: tokens.colors.text,
  },
  feedbackBack: {
    alignSelf: 'flex-start',
    marginBottom: tokens.spacing.md,
  },
  feedbackBackLabel: {
    ...tokens.typography.action,
    color: tokens.colors.primary,
  },
  feedbackContainer: {
    gap: tokens.spacing.sm,
    maxWidth: 640,
    padding: tokens.spacing.lg,
    width: '100%',
  },
  feedbackDescription: {
    ...tokens.typography.body,
    color: tokens.colors.textMuted,
  },
  feedbackIndicator: {
    alignSelf: 'flex-start',
  },
  feedbackTitle: {
    ...tokens.typography.title,
    color: tokens.colors.chrome,
  },
  installation: {
    ...tokens.typography.title,
    color: tokens.colors.textInverse,
    fontSize: 22,
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.72,
  },
  readingError: {
    ...tokens.typography.body,
    color: tokens.colors.status.danger.text,
  },
  readingInput: {
    ...tokens.typography.body,
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderRadius: tokens.borders.radius.subtle,
    borderWidth: tokens.borders.width.strong,
    color: tokens.colors.text,
    minHeight: 52,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  readingInputInvalid: {
    borderColor: tokens.colors.status.danger.border,
  },
  retry: {
    marginTop: tokens.spacing.md,
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
});
