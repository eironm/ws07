import { Transaction } from './models';

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two coordinates in meters (Haversine formula).
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Moves a point by a number of meters north/east (used for demo data). */
export function offsetMeters(origin: LatLng, northM: number, eastM: number): LatLng {
  const dLat = northM / EARTH_RADIUS_M;
  const dLng = eastM / (EARTH_RADIUS_M * Math.cos(toRad(origin.lat)));
  return { lat: origin.lat + (dLat * 180) / Math.PI, lng: origin.lng + (dLng * 180) / Math.PI };
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export function formatCoords(p: LatLng): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
}

/**
 * A "place" is a group of geotagged transactions that happened close to each other,
 * e.g. every time you bought lunch at the same canteen.
 */
export interface PlaceCluster {
  id: string;
  name: string;
  address?: string;
  center: LatLng;
  transactions: Transaction[];
  totalSpent: number;
  totalIncome: number;
  visits: number;
  lastVisit: string;
  topCategoryId: string;
}

/**
 * Groups geotagged transactions into places using a simple greedy clustering:
 * each transaction joins the nearest existing cluster whose center is within
 * `radiusM`, otherwise it starts a new cluster. Cluster centers are the running
 * average of their members, so they settle on the "real" spot over time.
 */
export function clusterPlaces(transactions: Transaction[], radiusM: number): PlaceCluster[] {
  type Work = { sumLat: number; sumLng: number; center: LatLng; items: Transaction[] };
  const clusters: Work[] = [];

  const tagged = transactions
    .filter((t) => t.location)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of tagged) {
    const p = { lat: tx.location!.lat, lng: tx.location!.lng };
    let best: Work | null = null;
    let bestDist = Infinity;
    for (const c of clusters) {
      const d = distanceMeters(c.center, p);
      if (d <= radiusM && d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    if (best) {
      best.items.push(tx);
      best.sumLat += p.lat;
      best.sumLng += p.lng;
      best.center = { lat: best.sumLat / best.items.length, lng: best.sumLng / best.items.length };
    } else {
      clusters.push({ sumLat: p.lat, sumLng: p.lng, center: p, items: [tx] });
    }
  }

  return clusters.map((c) => {
    const names = new Map<string, number>();
    const cats = new Map<string, number>();
    let totalSpent = 0;
    let totalIncome = 0;
    let address: string | undefined;
    for (const t of c.items) {
      const loc = t.location!;
      if (loc.placeName) {
        // User-given names weigh more than names from the geocoder.
        names.set(loc.placeName, (names.get(loc.placeName) ?? 0) + (loc.customName ? 5 : 1));
      }
      address ??= loc.address;
      if (t.type === 'expense') {
        totalSpent += t.amount;
        cats.set(t.categoryId, (cats.get(t.categoryId) ?? 0) + t.amount);
      } else {
        totalIncome += t.amount;
      }
    }
    const name = maxKey(names) ?? 'Unnamed place';
    const lastVisit = c.items[c.items.length - 1].date;
    return {
      id: `${c.center.lat.toFixed(4)}:${c.center.lng.toFixed(4)}`,
      name,
      address,
      center: c.center,
      transactions: [...c.items].reverse(),
      totalSpent,
      totalIncome,
      visits: c.items.length,
      lastVisit,
      topCategoryId: maxKey(cats) ?? c.items[0].categoryId,
    };
  });
}

function maxKey(map: Map<string, number>): string | undefined {
  let bestKey: string | undefined;
  let bestVal = -Infinity;
  for (const [k, v] of map) {
    if (v > bestVal) {
      bestKey = k;
      bestVal = v;
    }
  }
  return bestKey;
}

