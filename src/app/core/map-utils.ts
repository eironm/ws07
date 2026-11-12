import * as L from 'leaflet';

import { environment } from '../../environments/environment';

import { LatLng } from './geo-utils';

export const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 }; // Manila

function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

const CARTO_KEY = environment.cartoApiKey?.trim() ?? '';

/** Who drew the map tiles, for the attribution lines in the app. */
export const TILE_CREDIT = CARTO_KEY ? 'Tiles © CARTO' : 'Tiles © OpenStreetMap';

/**
 * Light/dark CARTO tiles when a CARTO key is configured (CARTO watermarks keyless
 * requests); otherwise OpenStreetMap's standard tiles, darkened with a filter in dark mode.
 */
function tileLayer(): L.TileLayer {
  const dark = prefersDark();
  if (CARTO_KEY) {
    const style = dark ? 'dark_all' : 'voyager';
    return L.tileLayer(
      `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(CARTO_KEY)}`,
      { maxZoom: 20, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' },
    );
  }
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
    className: dark ? 'ft-tiles-dark' : '',
  });
}

/**
 * Creates a Leaflet map with tiles that match the light/dark theme, and keeps it
 * correctly sized inside Ionic pages.
 */
export function createMap(el: HTMLElement, options: L.MapOptions = {}): L.Map {
  const map = L.map(el, { zoomControl: false, ...options });
  tileLayer().addTo(map);
  map.attributionControl?.setPrefix(false);

  // Leaflet measures its container once; Ionic page transitions and the
  // keyboard change the size afterwards, so re-measure whenever it changes.
  const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
  observer.observe(el);
  map.on('unload', () => observer.disconnect());
  return map;
}

/** Price-tag style pin, e.g. a little orange "₱120" bubble with a pointer. */
export function pricePin(color: string, label: string, highlight = false): L.DivIcon {
  return L.divIcon({
    className: 'ft-pin-wrap',
    html: `<div class="ft-pin${highlight ? ' ft-pin--hl' : ''}" style="--pin:${color}">${escapeHtml(label)}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -30],
  });
}

/** Round numbered marker used for the "day trail". */
export function stepPin(color: string, step: number): L.DivIcon {
  return L.divIcon({
    className: 'ft-pin-wrap',
    html: `<div class="ft-step" style="--pin:${color}">${step}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -14],
  });
}

/** Simple colored dot (mini maps / picker). */
export function dotPin(color: string): L.DivIcon {
  return L.divIcon({
    className: 'ft-pin-wrap',
    html: `<div class="ft-dot" style="--pin:${color}"></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Pulsing blue "you are here" dot. */
export function userPin(): L.DivIcon {
  return L.divIcon({
    className: 'ft-pin-wrap',
    html: '<div class="ft-me"></div>',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

