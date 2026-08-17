import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoutePoint } from '../../domain/entities/RoutePoint';
import type { Visit } from '@/features/visits/domain/entities/Visit';
import { deriveVisitDisplayStatus } from '@/features/visits/domain/use-cases/DeriveVisitDisplayStatus';
import { BaseCard, SectionLabel, StatusBadge } from '@/shared/presentation/components';
import { tokens } from '@/shared/presentation/theme';

interface RoutePointCardProps {
  latestVisit: Visit | null;
  onPress: () => void;
  point: RoutePoint;
}

export function RoutePointCard({ latestVisit, onPress, point }: RoutePointCardProps) {
  const displayStatus = deriveVisitDisplayStatus(point.status, latestVisit);

  return (
    <Pressable
      accessibilityHint="Opens the locally saved point details"
      accessibilityLabel={`Open installation ${point.installationCode}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <BaseCard style={styles.card}>
        <View style={styles.header}>
          <View style={styles.orderBlock}>
            <SectionLabel style={styles.orderLabel}>Order</SectionLabel>
            <Text style={styles.orderValue}>{point.order}</Text>
          </View>

          <View style={styles.headerContent}>
            <Text style={styles.customer}>{point.customer}</Text>
            <SectionLabel>Installation</SectionLabel>
            <Text style={styles.installation}>{point.installationCode}</Text>
            <StatusBadge
              label={displayStatus.label}
              style={styles.status}
              tone={displayStatus.tone}
            />
          </View>
        </View>

        <View style={styles.detail}>
          <SectionLabel>Address</SectionLabel>
          <Text style={styles.value}>{point.address}</Text>
        </View>

        <View style={styles.detail}>
          <SectionLabel>Reference</SectionLabel>
          <Text style={styles.value}>{point.referencePoint}</Text>
        </View>
      </BaseCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing.md,
  },
  customer: {
    ...tokens.typography.body,
    color: tokens.colors.text,
    fontWeight: '700',
  },
  detail: {
    gap: tokens.spacing.xs,
  },
  header: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  headerContent: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  installation: {
    ...tokens.typography.body,
    color: tokens.colors.text,
    fontWeight: '700',
  },
  orderBlock: {
    alignItems: 'center',
    backgroundColor: tokens.colors.chrome,
    borderColor: tokens.colors.chrome,
    borderWidth: tokens.borders.width.strong,
    justifyContent: 'center',
    minWidth: 64,
    padding: tokens.spacing.sm,
  },
  orderLabel: {
    color: tokens.colors.textInverse,
    fontSize: 10,
  },
  orderValue: {
    ...tokens.typography.title,
    color: tokens.colors.textInverse,
  },
  pressed: {
    opacity: 0.72,
  },
  status: {
    marginTop: tokens.spacing.xs,
  },
  value: {
    ...tokens.typography.body,
    color: tokens.colors.text,
  },
});
