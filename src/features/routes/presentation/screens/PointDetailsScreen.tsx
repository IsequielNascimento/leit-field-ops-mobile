import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SQLiteRouteRepository } from '../../data/repositories/SQLiteRouteRepository';
import { BaseCard, PrimaryButton, SectionLabel, StatusBadge } from '@/shared/presentation/components';
import type { StatusTone } from '@/shared/presentation/theme';
import { tokens } from '@/shared/presentation/theme';
import {
  loadPointDetails,
  type PointDetailsState,
  type PointIdParameter,
} from '../view-models/PointDetailsViewModel';

interface PointDetailsScreenProps {
  onBack: () => void;
  onStartVisit: () => void;
  pointId: PointIdParameter;
}

function getStatusTone(status: string): StatusTone {
  switch (status.toLowerCase()) {
    case 'completed':
    case 'synced':
      return 'success';
    case 'pending':
    case 'assigned':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function PointDetailsScreen({ onBack, onStartVisit, pointId }: PointDetailsScreenProps) {
  const database = useSQLiteContext();
  const routeRepository = useMemo(() => new SQLiteRouteRepository(database), [database]);
  const [state, setState] = useState<PointDetailsState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    setState(await loadPointDetails(routeRepository, pointId));
  }, [pointId, routeRepository]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return <FeedbackScreen label="Loading local point…" onBack={onBack} />;
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

  const { point } = state;

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
              <Text style={styles.installation}>{point.installationCode}</Text>
            </View>
            <StatusBadge label={point.status} tone={getStatusTone(point.status)} />
          </View>
        </View>

        <BaseCard style={styles.contextCard}>
          <DetailRow label="Installation" value={point.installationCode} />
          <DetailRow label="Address" value={point.address} />
          <DetailRow label="Meter number" value={point.meterNumber} />
          <DetailRow label="Previous reading" value={String(point.previousReading)} />
          <View style={styles.detailRow}>
            <SectionLabel>Status</SectionLabel>
            <StatusBadge label={point.status} tone={getStatusTone(point.status)} />
          </View>
        </BaseCard>

        <View style={styles.actionArea}>
          <SectionLabel>Visit</SectionLabel>
          <Text style={styles.actionDescription}>
            Use this point context to register or continue its field visit.
          </Text>
          <PrimaryButton label="Register visit" onPress={onStartVisit} />
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
  description?: string;
  label: string;
  onBack: () => void;
  onRetry?: () => void;
}

function FeedbackScreen({ actionLabel, description, label, onBack, onRetry }: FeedbackScreenProps) {
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
