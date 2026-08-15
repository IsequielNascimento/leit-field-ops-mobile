import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { type RelativePathString, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SQLiteRouteRepository } from '../../data/repositories/SQLiteRouteRepository';
import { BaseCard, PrimaryButton, SectionLabel } from '@/shared/presentation/components';
import { tokens } from '@/shared/presentation/theme';
import { RoutePointCard } from '../components/RoutePointCard';
import {
  getRouteHomeSummary,
  loadRouteHome,
  type RouteHomeState,
} from '../view-models/RouteHomeViewModel';

export function RouteHomeScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const routeRepository = useMemo(() => new SQLiteRouteRepository(database), [database]);
  const [state, setState] = useState<RouteHomeState>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    setState(await loadRouteHome(routeRepository));
  }, [routeRepository]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === 'loading') {
    return <FeedbackScreen label="Loading local route…" />;
  }

  if (state.kind === 'empty') {
    return (
      <FeedbackScreen
        actionLabel="Retry local route"
        description="No saved route points are available on this device."
        label="Route unavailable"
        onRetry={() => void load()}
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <FeedbackScreen
        actionLabel="Retry local route"
        description={state.message}
        label="Could not load local route"
        onRetry={() => void load()}
      />
    );
  }

  const { route } = state;
  const summary = getRouteHomeSummary(route);

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scrollView}>
        <View style={styles.appBar}>
          <SectionLabel style={styles.appBarLabel}>Field route</SectionLabel>
          <Text style={styles.routeName}>{route.name}</Text>
          <Text style={styles.routeId}>{route.id}</Text>
        </View>

        <BaseCard style={styles.summary}>
          <View>
            <SectionLabel>Route coverage</SectionLabel>
            <Text style={styles.summaryValue}>{summary.pointCount} points</Text>
          </View>
          <View style={styles.summaryMetadata}>
            <Text style={styles.summaryMetadataText}>{route.neighborhood}</Text>
            <Text style={styles.summaryMetadataText}>{route.city} · {route.state}</Text>
          </View>
        </BaseCard>

        <View style={styles.listHeader}>
          <SectionLabel>Service points</SectionLabel>
          <Text style={styles.listCount}>{summary.pointCount} total</Text>
        </View>

        <View style={styles.list}>
          {route.points.map((point) => (
            <RoutePointCard
              key={point.id}
              onPress={() => {
                router.push(`./points/${point.id}` as RelativePathString);
              }}
              point={point}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface FeedbackScreenProps {
  actionLabel?: string;
  description?: string;
  label: string;
  onRetry?: () => void;
}

function FeedbackScreen({ actionLabel, description, label, onRetry }: FeedbackScreenProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.feedbackContainer}>
        <SectionLabel>Field route</SectionLabel>
        <Text style={styles.feedbackTitle}>{label}</Text>
        {description ? <Text style={styles.feedbackDescription}>{description}</Text> : null}
        {actionLabel && onRetry ? <PrimaryButton label={actionLabel} onPress={onRetry} style={styles.retry} /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  appBar: {
    backgroundColor: tokens.colors.chrome,
    borderColor: tokens.colors.chrome,
    borderWidth: tokens.borders.width.strong,
    gap: tokens.spacing.xs,
    padding: tokens.spacing.lg,
  },
  appBarLabel: {
    color: tokens.colors.textInverse,
  },
  content: {
    gap: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
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
  list: {
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.lg,
  },
  listCount: {
    ...tokens.typography.label,
    color: tokens.colors.textMuted,
  },
  listHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.lg,
  },
  retry: {
    marginTop: tokens.spacing.md,
  },
  routeId: {
    ...tokens.typography.label,
    color: tokens.colors.textInverse,
  },
  routeName: {
    ...tokens.typography.title,
    color: tokens.colors.textInverse,
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
  summary: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: tokens.spacing.lg,
  },
  summaryMetadata: {
    alignItems: 'flex-end',
  },
  summaryMetadataText: {
    ...tokens.typography.body,
    color: tokens.colors.textMuted,
    textAlign: 'right',
  },
  summaryValue: {
    ...tokens.typography.title,
    color: tokens.colors.text,
  },
});
