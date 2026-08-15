import { StyleSheet, Text, View } from 'react-native';

import type { RoutePoint } from '../../domain/entities/RoutePoint';
import { BaseCard, SectionLabel, StatusBadge } from '@/shared/presentation/components';
import type { StatusTone } from '@/shared/presentation/theme';
import { tokens } from '@/shared/presentation/theme';

interface RoutePointCardProps {
  point: RoutePoint;
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

export function RoutePointCard({ point }: RoutePointCardProps) {
  return (
    <BaseCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.orderBlock}>
          <SectionLabel style={styles.orderLabel}>Order</SectionLabel>
          <Text style={styles.orderValue}>{point.order}</Text>
        </View>

        <View style={styles.headerContent}>
          <SectionLabel>Installation</SectionLabel>
          <Text style={styles.installation}>{point.installationCode}</Text>
          <StatusBadge label={point.status} style={styles.status} tone={getStatusTone(point.status)} />
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
  );
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing.md,
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
  status: {
    marginTop: tokens.spacing.xs,
  },
  value: {
    ...tokens.typography.body,
    color: tokens.colors.text,
  },
});
