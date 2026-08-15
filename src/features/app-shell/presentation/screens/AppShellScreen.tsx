import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BaseCard,
  PrimaryButton,
  SectionLabel,
  StatusBadge,
} from '@/shared/presentation/components';
import { tokens } from '@/shared/presentation/theme';

export function AppShellScreen() {
  const [isConfirmed, setIsConfirmed] = useState(false);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.container}>
        <SectionLabel>Interface foundation</SectionLabel>
        <Text style={styles.title}>LEIT Field Ops</Text>
        <Text style={styles.subtitle}>
          Reusable visual primitives are ready for feature screens.
        </Text>

        <BaseCard style={styles.card}>
          <View style={styles.cardHeader}>
            <SectionLabel>Core components</SectionLabel>
            <StatusBadge
              label={isConfirmed ? 'Confirmed' : 'Ready'}
              tone={isConfirmed ? 'success' : 'info'}
            />
          </View>

          <Text style={styles.description}>
            This generic surface verifies shared spacing, borders, type, status,
            and action treatments without feature data.
          </Text>

          <PrimaryButton
            disabled={isConfirmed}
            label={isConfirmed ? 'Interaction confirmed' : 'Confirm interaction'}
            onPress={() => setIsConfirmed(true)}
            style={styles.action}
          />
        </BaseCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    maxWidth: 640,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xl,
    width: '100%',
  },
  screen: {
    alignItems: 'center',
    backgroundColor: tokens.colors.background,
    flex: 1,
  },
  title: {
    ...tokens.typography.title,
    color: tokens.colors.chrome,
    marginTop: tokens.spacing.sm,
  },
  subtitle: {
    ...tokens.typography.body,
    color: tokens.colors.textMuted,
    marginTop: tokens.spacing.sm,
  },
  card: {
    marginTop: tokens.spacing.xl,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    justifyContent: 'space-between',
  },
  description: {
    ...tokens.typography.body,
    color: tokens.colors.text,
    marginTop: tokens.spacing.md,
  },
  action: {
    marginTop: tokens.spacing.lg,
  },
});
