import { Component, type ReactNode, useCallback, useMemo, useState } from 'react';
import { Image, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoutePoint } from '../../domain/entities/RoutePoint';
import { BaseCard, SectionLabel } from '@/shared/presentation/components';
import { tokens } from '@/shared/presentation/theme';
import { buildRouteMapView, TILE_SIZE } from '../view-models/RouteMapViewModel';

const MAP_HEIGHT = 220;
const MARKER_SIZE = 30;
const MAP_PADDING = 28;

interface RouteMapCardProps {
  onSelectPoint: (point: RoutePoint) => void;
  points: readonly RoutePoint[];
}

export function RouteMapCard(props: RouteMapCardProps) {
  return (
    <RouteMapBoundary>
      <RouteMapCanvas {...props} />
    </RouteMapBoundary>
  );
}

function RouteMapCanvas({ onSelectPoint, points }: RouteMapCardProps) {
  const [width, setWidth] = useState(0);
  const [failedTiles, setFailedTiles] = useState<readonly string[]>([]);

  const view = useMemo(
    () => buildRouteMapView(points, { width, height: MAP_HEIGHT, padding: MAP_PADDING }),
    [points, width],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  const handleTileError = useCallback((key: string) => {
    setFailedTiles((current) => (current.includes(key) ? current : [...current, key]));
  }, []);

  const pointsById = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const tilesUnavailable =
    view.kind === 'ready' &&
    view.tiles.length > 0 &&
    view.tiles.every((tile) => failedTiles.includes(tile.key));

  return (
    <BaseCard style={styles.card}>
      <View style={styles.header}>
        <SectionLabel>Route map</SectionLabel>
        <Text style={styles.headerCount}>
          {view.kind === 'ready' ? `${view.markers.length} located` : 'unavailable'}
        </Text>
      </View>

      <View onLayout={handleLayout} style={styles.surface}>
        {view.kind === 'ready' ? (
          <>
            {view.tiles.map((tile) => (
              <Image
                key={tile.key}
                onError={() => handleTileError(tile.key)}
                source={{ uri: tile.url }}
                style={[styles.tile, { left: tile.left, top: tile.top }]}
              />
            ))}

            {view.markers.map((marker) => {
              const point = pointsById.get(marker.pointId);

              return (
                <Pressable
                  accessibilityHint="Opens the locally saved point details"
                  accessibilityLabel={`Point ${marker.order}, installation ${marker.installationCode}`}
                  accessibilityRole="button"
                  key={marker.pointId}
                  onPress={() => {
                    if (point) {
                      onSelectPoint(point);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.marker,
                    { left: marker.x - MARKER_SIZE / 2, top: marker.y - MARKER_SIZE / 2 },
                    pressed && styles.markerPressed,
                  ]}
                >
                  <Text style={styles.markerLabel}>{marker.order}</Text>
                </Pressable>
              );
            })}
          </>
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{view.reason}</Text>
          </View>
        )}
      </View>

      <Text style={styles.footnote}>
        {tilesUnavailable
          ? 'Map tiles unavailable offline — markers keep the official positions.'
          : `Official coordinates · ${view.kind === 'ready' ? view.attribution : 'no tiles loaded'}`}
      </Text>
    </BaseCard>
  );
}

interface RouteMapBoundaryProps {
  children: ReactNode;
}

// MARK: The map is a differential; a rendering failure must never hide the route list.
class RouteMapBoundary extends Component<RouteMapBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <BaseCard style={styles.card}>
          <SectionLabel>Route map</SectionLabel>
          <Text style={styles.placeholderText}>
            The map could not be displayed on this device. The route list below stays available.
          </Text>
        </BaseCard>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  card: {
    gap: tokens.spacing.sm,
  },
  footnote: {
    ...tokens.typography.label,
    color: tokens.colors.textMuted,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerCount: {
    ...tokens.typography.label,
    color: tokens.colors.textMuted,
  },
  marker: {
    alignItems: 'center',
    backgroundColor: tokens.colors.chrome,
    borderColor: tokens.colors.textInverse,
    borderRadius: MARKER_SIZE / 2,
    borderWidth: tokens.borders.width.strong,
    height: MARKER_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    width: MARKER_SIZE,
  },
  markerLabel: {
    ...tokens.typography.action,
    color: tokens.colors.textInverse,
    fontSize: 14,
  },
  markerPressed: {
    backgroundColor: tokens.colors.primaryPressed,
  },
  placeholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing.md,
  },
  placeholderText: {
    ...tokens.typography.body,
    color: tokens.colors.textMuted,
    textAlign: 'center',
  },
  surface: {
    backgroundColor: tokens.colors.status.neutral.background,
    borderColor: tokens.colors.border,
    borderWidth: tokens.borders.width.thin,
    height: MAP_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  tile: {
    height: TILE_SIZE,
    position: 'absolute',
    width: TILE_SIZE,
  },
});
