import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { BaseCard, PrimaryButton, SectionLabel, StatusBadge } from '@/shared/presentation/components';
import type { StatusTone } from '@/shared/presentation/theme';
import { tokens } from '@/shared/presentation/theme';
import {
  describeVisitSyncState,
  eligibleForSyncCount,
  type VisitSyncState,
  type VisitSyncSummary,
} from '../view-models/VisitSyncViewModel';

interface VisitSyncPanelProps {
  onSync: () => void;
  state: VisitSyncState;
  summary: VisitSyncSummary;
}

function idleBadge(summary: VisitSyncSummary): { label: string; tone: StatusTone } {
  if (summary.error > 0) {
    return { label: 'Failed', tone: 'danger' };
  }

  return eligibleForSyncCount(summary) === 0
    ? { label: 'Synced', tone: 'success' }
    : { label: 'Pending', tone: 'warning' };
}

function badgeForState(state: VisitSyncState, summary: VisitSyncSummary): {
  label: string;
  tone: StatusTone;
} {
  switch (state.kind) {
    case 'syncing':
      return { label: 'Syncing', tone: 'neutral' };
    case 'failed':
      return { label: 'Not sent', tone: 'danger' };
    case 'completed':
      if (state.failed > 0) {
        return { label: 'Failed', tone: 'danger' };
      }

      return idleBadge(summary);
    case 'idle':
      return idleBadge(summary);
  }
}

function actionLabel(summary: VisitSyncSummary): string {
  return summary.error > 0 ? 'Retry failed visits' : 'Sync pending visits';
}

export function VisitSyncPanel({ onSync, state, summary }: VisitSyncPanelProps) {
  const isSyncing = state.kind === 'syncing';
  const badge = badgeForState(state, summary);
  const eligible = eligibleForSyncCount(summary);
  const label = actionLabel(summary);

  return (
    <BaseCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <SectionLabel>Sync queue</SectionLabel>
          <Text style={styles.message}>{describeVisitSyncState(state, summary)}</Text>
        </View>
        <StatusBadge label={badge.label} tone={badge.tone} />
      </View>

      <View style={styles.counts}>
        <View style={styles.count}>
          <SectionLabel>Pending</SectionLabel>
          <Text style={styles.countValue}>{summary.pending}</Text>
        </View>
        <View style={styles.count}>
          <SectionLabel>Syncing</SectionLabel>
          <Text style={styles.countValue}>{summary.syncing}</Text>
        </View>
        <View style={styles.count}>
          <SectionLabel>Synced</SectionLabel>
          <Text style={styles.countValue}>{summary.synced}</Text>
        </View>
        <View style={styles.count}>
          <SectionLabel>Failed</SectionLabel>
          <Text style={[styles.countValue, summary.error > 0 && styles.countValueFailed]}>
            {summary.error}
          </Text>
        </View>
      </View>

      {isSyncing ? (
        <View accessibilityRole="progressbar" style={styles.progress}>
          <ActivityIndicator color={tokens.colors.primary} />
          <Text style={styles.progressLabel}>Sending pending visits…</Text>
        </View>
      ) : null}

      <PrimaryButton
        accessibilityLabel={label}
        disabled={isSyncing || eligible === 0}
        label={isSyncing ? 'Syncing…' : label}
        onPress={onSync}
      />
    </BaseCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing.md,
  },
  count: {
    gap: tokens.spacing.xs,
  },
  countValue: {
    ...tokens.typography.title,
    color: tokens.colors.text,
  },
  countValueFailed: {
    color: tokens.colors.status.danger.text,
  },
  counts: {
    flexDirection: 'row',
    gap: tokens.spacing.lg,
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.spacing.md,
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  message: {
    ...tokens.typography.body,
    color: tokens.colors.text,
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  progressLabel: {
    ...tokens.typography.body,
    color: tokens.colors.textMuted,
  },
});
