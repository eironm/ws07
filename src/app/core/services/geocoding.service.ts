import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';

import { LatLng } from '../geo-utils';
import { StorageService } from './storage.service';

export interface PlaceInfo {
  placeName: string;
  address: string;
}

export interface SearchResult extends PlaceInfo, LatLng {}

/** Subset of the Nominatim JSON (format=jsonv2) we actually use. */
interface NominatimResult {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
  error?: string;
}

const BASE = 'https://nominatim.openstreetmap.org';
const CACHE_KEY = 'ft.geocache';
const CACHE_LIMIT = 400;
/** Nominatim's usage policy allows at most 1 request per second. */
const MIN_INTERVAL_MS = 1100;

/**
 * Turns coordinates into readable place names using the free OpenStreetMap
 * Nominatim API (HTTP GET). Results are cached on the device so revisiting the
 * same spot works offline and does not hit the API again.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private http = inject(HttpClient);
  private storage = inject(StorageService);

  private cache = new Map<string, PlaceInfo>();
  private cacheLoaded = false;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  async reverse(lat: number, lng: number): Promise<PlaceInfo> {
    await this.loadCache();
    // ~11 m grid: nearby readings share a cache entry.
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const result = await this.throttled(() =>
      firstValueFrom(
        this.http
          .get<NominatimResult>(`${BASE}/reverse`, {
            params: { format: 'jsonv2', lat, lon: lng, zoom: 18, addressdetails: 1, 'accept-language': 'en' },
          })
          .pipe(timeout(10000)),
      ),
    );
    if (!result || result.error) throw new Error(result?.error ?? 'No address found');

    const info = this.describe(result);
    this.cache.set(key, info);
    this.saveCache();
    return info;
  }

  async search(query: string, near?: LatLng | null): Promise<SearchResult[]> {
    const params: Record<string, string | number> = {
      q: query,
      format: 'jsonv2',
      addressdetails: 1,
      limit: 6,
      'accept-language': 'en',
    };
    if (near) {
      // Prefer (but don't restrict to) results around the user.
      const d = 0.25;
      params['viewbox'] = `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
    }
    const results = await this.throttled(() =>
      firstValueFrom(this.http.get<NominatimResult[]>(`${BASE}/search`, { params }).pipe(timeout(10000))),
    );
    return (results ?? []).map((r) => ({ lat: +r.lat, lng: +r.lon, ...this.describe(r) }));
  }

  /** Builds a short name + address line from Nominatim's address breakdown. */
  private describe(r: NominatimResult): PlaceInfo {
    const a = r.address ?? {};
    const poi = r.name || a['amenity'] || a['shop'] || a['building'] || a['tourism'] || a['leisure'];
    const street = [a['house_number'], a['road']].filter(Boolean).join(' ');
    const area = [
      a['suburb'] ?? a['neighbourhood'] ?? a['quarter'] ?? a['village'],
      a['city'] ?? a['town'] ?? a['municipality'] ?? a['county'],
    ].filter(Boolean);

    const placeName = poi || street || area[0] || r.display_name?.split(',')[0] || 'Unknown place';
    const parts = poi && street ? [street, ...area] : area;
    const address = parts.join(', ') || r.display_name || '';
    return { placeName, address };
  }

  /** Serializes requests so we never exceed Nominatim's rate limit. */
  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastRequestAt = Date.now();
      return fn();
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async loadCache() {
    if (this.cacheLoaded) return;
    this.cacheLoaded = true;
    const entries = await this.storage.get<[string, PlaceInfo][]>(CACHE_KEY, []);
    this.cache = new Map(entries);
  }

  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private saveCache() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const entries = [...this.cache.entries()].slice(-CACHE_LIMIT);
      void this.storage.set(CACHE_KEY, entries);
    }, 1000);
  }
}

