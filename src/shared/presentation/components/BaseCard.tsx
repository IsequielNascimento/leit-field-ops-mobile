import type { ViewProps } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { tokens } from '@/shared/presentation/theme';

export function BaseCard({ children, style, ...viewProps }: ViewProps) {
  return (
    <View {...viewProps} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderRadius: tokens.borders.radius.subtle,
    borderWidth: tokens.borders.width.strong,
    padding: tokens.spacing.md,
  },
});
