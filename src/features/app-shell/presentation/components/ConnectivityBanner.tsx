import { StyleSheet, Text, View } from 'react-native';

import { useConnectivityStatus } from '../ConnectivityProvider';
import { describeConnectivityBanner } from '../view-models/ConnectivityBannerViewModel';
import { tokens } from '@/shared/presentation/theme';

/**
 * Renders nothing while online. Shown only while offline, so it never adds
 * persistent chrome — the mandatory offline flows (route read, visit
 * registration) work identically whether this banner is visible or not.
 */
export function ConnectivityBanner() {
  const status = useConnectivityStatus();
  const view = describeConnectivityBanner(status);

  if (!view.visible) {
    return null;
  }

  const toneTokens = tokens.colors.status[view.tone];

  return (
    <View
      accessibilityLabel={view.label}
      accessibilityRole="text"
      accessible
      style={[styles.banner, { backgroundColor: toneTokens.background, borderColor: toneTokens.border }]}
    >
      <Text style={[styles.label, { color: toneTokens.text }]}>{view.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: tokens.borders.radius.none,
    borderWidth: tokens.borders.width.strong,
    marginHorizontal: tokens.spacing.lg,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  label: {
    ...tokens.typography.label,
    textAlign: 'center',
  },
});
