import type { PressableProps } from 'react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { tokens } from '@/shared/presentation/theme';

type PrimaryButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
};

export function PrimaryButton({
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  disabled = false,
  label,
  style,
  ...pressableProps
}: PrimaryButtonProps) {
  const isDisabled = disabled ?? false;

  return (
    <Pressable
      {...pressableProps}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      disabled={isDisabled}
      style={(state) => [
        styles.button,
        state.pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.chrome,
    borderRadius: tokens.borders.radius.subtle,
    borderWidth: tokens.borders.width.strong,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    width: '100%',
  },
  disabled: {
    backgroundColor: tokens.colors.primaryDisabled,
    borderColor: tokens.colors.primaryDisabled,
  },
  label: {
    ...tokens.typography.action,
    color: tokens.colors.textInverse,
    textAlign: 'center',
  },
  pressed: {
    backgroundColor: tokens.colors.primaryPressed,
  },
});
