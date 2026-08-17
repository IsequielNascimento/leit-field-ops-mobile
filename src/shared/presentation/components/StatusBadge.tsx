import type { StyleProp, TextStyle, ViewProps, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { statusToneGlyph, tokens } from '@/shared/presentation/theme';
import type { StatusTone } from '@/shared/presentation/theme';

type StatusBadgeProps = Omit<ViewProps, 'children' | 'style'> & {
  label: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  tone?: StatusTone;
};

export function StatusBadge({
  accessibilityLabel,
  accessibilityRole,
  label,
  style,
  textStyle,
  tone = 'neutral',
  ...viewProps
}: StatusBadgeProps) {
  const toneTokens = tokens.colors.status[tone];

  return (
    <View
      {...viewProps}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole ?? 'text'}
      accessible
      style={[
        styles.badge,
        {
          backgroundColor: toneTokens.background,
          borderColor: toneTokens.border,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: toneTokens.text }, textStyle]}>
        {statusToneGlyph(tone)} {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: tokens.borders.radius.none,
    borderWidth: tokens.borders.width.strong,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  label: {
    ...tokens.typography.label,
    textAlign: 'center',
  },
});
