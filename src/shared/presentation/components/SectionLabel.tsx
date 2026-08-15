import type { TextProps } from 'react-native';
import { StyleSheet, Text } from 'react-native';

import { tokens } from '@/shared/presentation/theme';

export function SectionLabel({ children, style, ...textProps }: TextProps) {
  return (
    <Text {...textProps} style={[styles.label, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    ...tokens.typography.label,
    color: tokens.colors.textMuted,
  },
});
