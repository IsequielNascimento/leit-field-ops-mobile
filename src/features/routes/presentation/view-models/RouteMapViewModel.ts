import type { RoutePoint } from '../../domain/entities/RoutePoint';

export const TILE_SIZE = 256;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 18;
export const SINGLE_POINT_ZOOM = 16;
export const MAP_TILE_ATTRIBUTION = '© OpenStreetMap contributors © CARTO';

const MAX_MERCATOR_LATITUDE = 85.05112878;

export interface RouteMapMarker {
  pointId: number;
  order: number;
  installationCode: string;
  customer: string;
  x: number;
  y: number;
}

export interface RouteMapTile {
  key: string;
  url: string;
  left: number;
  top: number;
}

export interface RouteMapViewport {
  width: number;
  height: number;
  padding: number;
}

export type RouteMapView =
  | { kind: 'unavailable'; reason: string }
  | {
      kind: 'ready';
      zoom: number;
      tiles: readonly RouteMapTile[];
      markers: readonly RouteMapMarker[];
      attribution: string;
    };

interface NormalizedPosition {
  x: number;
  y: number;
}

function isRenderableCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Web Mercator projection into the unit square used by every XYZ raster tile
 * scheme, so marker placement and tile selection share one coordinate space.
 */
export function projectToUnitSquare(latitude: number, longitude: number): NormalizedPosition {
  const clampedLatitude = Math.min(Math.max(latitude, -MAX_MERCATOR_LATITUDE), MAX_MERCATOR_LATITUDE);
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180);

  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI),
  };
}

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_ZOOM), MAX_ZOOM);
}

function fitZoom(spanX: number, spanY: number, usableWidth: number, usableHeight: number): number {
  const candidates: number[] = [];

  if (spanX > 0) {
    candidates.push(Math.log2(usableWidth / (spanX * TILE_SIZE)));
  }

  if (spanY > 0) {
    candidates.push(Math.log2(usableHeight / (spanY * TILE_SIZE)));
  }

  if (candidates.length === 0) {
    return SINGLE_POINT_ZOOM;
  }

  return clampZoom(Math.floor(Math.min(...candidates)));
}

// MARK: Keyless OpenStreetMap-derived basemap, so no Android map credential is required.
function tileUrl(zoom: number, column: number, row: number): string {
  return `https://basemaps.cartocdn.com/light_all/${zoom}/${column}/${row}.png`;
}

/**
 * Builds the map viewport from route points already read back from local
 * persistence. Points carrying unusable coordinates are dropped instead of
 * being rendered at a fabricated position.
 */
export function buildRouteMapView(
  points: readonly RoutePoint[],
  viewport: RouteMapViewport,
): RouteMapView {
  const { height, padding, width } = viewport;

  if (!(width > 0) || !(height > 0)) {
    return { kind: 'unavailable', reason: 'The map area has no measured size yet.' };
  }

  const locatedPoints = points.filter((point) => isRenderableCoordinate(point.latitude, point.longitude));

  if (locatedPoints.length === 0) {
    return { kind: 'unavailable', reason: 'No saved route point has usable coordinates.' };
  }

  const positions = locatedPoints.map((point) => projectToUnitSquare(point.latitude, point.longitude));
  const minX = Math.min(...positions.map((position) => position.x));
  const maxX = Math.max(...positions.map((position) => position.x));
  const minY = Math.min(...positions.map((position) => position.y));
  const maxY = Math.max(...positions.map((position) => position.y));

  const usableWidth = Math.max(width - padding * 2, 1);
  const usableHeight = Math.max(height - padding * 2, 1);
  const zoom = fitZoom(maxX - minX, maxY - minY, usableWidth, usableHeight);

  const worldSize = TILE_SIZE * 2 ** zoom;
  const originX = ((minX + maxX) / 2) * worldSize - width / 2;
  const originY = ((minY + maxY) / 2) * worldSize - height / 2;

  const markers = locatedPoints.map((point, index) => ({
    pointId: point.id,
    order: point.order,
    installationCode: point.installationCode,
    customer: point.customer,
    x: positions[index].x * worldSize - originX,
    y: positions[index].y * worldSize - originY,
  }));

  const tiles: RouteMapTile[] = [];
  const tileCount = 2 ** zoom;
  const firstColumn = Math.floor(originX / TILE_SIZE);
  const lastColumn = Math.floor((originX + width) / TILE_SIZE);
  const firstRow = Math.floor(originY / TILE_SIZE);
  const lastRow = Math.floor((originY + height) / TILE_SIZE);

  for (let row = firstRow; row <= lastRow; row += 1) {
    if (row < 0 || row >= tileCount) {
      continue;
    }

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const wrappedColumn = ((column % tileCount) + tileCount) % tileCount;

      tiles.push({
        key: `${zoom}/${column}/${row}`,
        url: tileUrl(zoom, wrappedColumn, row),
        left: column * TILE_SIZE - originX,
        top: row * TILE_SIZE - originY,
      });
    }
  }

  return { kind: 'ready', zoom, tiles, markers, attribution: MAP_TILE_ATTRIBUTION };
}
