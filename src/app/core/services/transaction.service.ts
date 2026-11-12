import { Injectable, computed, inject, signal } from '@angular/core';

import { LatLng, clusterPlaces, distanceMeters } from '../geo-utils';
import { GeoTag, Transaction } from '../models';
import { GeocodingService } from './geocoding.service';
import { SettingsService } from './settings.service';
import { StorageService } from './storage.service';

const KEY = 'ft.transactions';

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>;

export interface PlaceSuggestion {
  placeName?: string;
  address?: string;
  customName?: boolean;
  categoryId?: string;
  visits: number;
  distance: number;
}

/**
 * Single source of truth for transactions. Uses Angular signals so every page
 * updates automatically when data changes; persists to device storage.
 */
@Injectable({ providedIn: 'root' })
export class TransactionService {
  private storage = inject(StorageService);
  private settings = inject(SettingsService);
  private geocoder = inject(GeocodingService);

  private readonly _items = signal<Transaction[]>([]);
  readonly loaded = signal(false);
  /** Bumped on app resume so the current allowance period and "today" roll over correctly. */
  readonly now = signal(new Date());

  /** Newest first. */
  readonly transactions = computed(() => [...this._items()].sort((a, b) => b.date.localeCompare(a.date)));

  readonly places = computed(() => clusterPlaces(this.transactions(), this.settings.settings().placeRadius));

  readonly pendingGeocodeCount = computed(
    () => this._items().filter((t) => t.location?.geocodeStatus === 'pending').length,
  );

  async load(): Promise<void> {
    const items = await this.storage.get<Transaction[]>(KEY, []);
    this._items.set(Array.isArray(items) ? items : []);
    this.loaded.set(true);
  }

  getById(id: string): Transaction | undefined {
    return this._items().find((t) => t.id === id);
  }

  async add(input: NewTransaction): Promise<Transaction> {
    const stamp = new Date().toISOString();
    const tx: Transaction = { ...input, id: uid(), createdAt: stamp, updatedAt: stamp };
    this._items.update((list) => [...list, tx]);
    await this.persist();
    return tx;
  }

  async update(id: string, patch: Partial<NewTransaction>): Promise<void> {
    this._items.update((list) =>
      list.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
    );
    await this.persist();
  }

  async remove(id: string): Promise<Transaction | undefined> {
    const tx = this.getById(id);
    this._items.update((list) => list.filter((t) => t.id !== id));
    await this.persist();
    return tx;
  }

  /** Puts back a deleted transaction (used by the "Undo" toast). */
  async restore(tx: Transaction): Promise<void> {
    this._items.update((list) => [...list.filter((t) => t.id !== tx.id), tx]);
    await this.persist();
  }

  async replaceAll(items: Transaction[]): Promise<void> {
    this._items.set(items);
    await this.persist();
  }

  /** Renames every payment at the same place in one go. */
  async renamePlace(ids: string[], name: string): Promise<void> {
    const set = new Set(ids);
    this._items.update((list) =>
      list.map((t) =>
        set.has(t.id) && t.location ? { ...t, location: { ...t.location, placeName: name, customName: true } } : t,
      ),
    );
    await this.persist();
  }

  /**
   * Looks at past payments near a point to suggest a place name (works offline)
   * and the category the user usually picks there.
   */
  suggestFor(point: LatLng, radiusM = 60): PlaceSuggestion | null {
    let nearest: Transaction | null = null;
    let nearestDist = Infinity;
    const cats = new Map<string, number>();
    let visits = 0;
    for (const t of this._items()) {
      if (!t.location) continue;
      const d = distanceMeters(point, t.location);
      if (d > radiusM) continue;
      visits++;
      if (t.type === 'expense') cats.set(t.categoryId, (cats.get(t.categoryId) ?? 0) + 1);
      // Prefer user-named entries, then the closest one.
      const score = d - (t.location.customName ? 1000 : 0);
      const bestScore = nearest ? nearestDist - (nearest.location!.customName ? 1000 : 0) : Infinity;
      if (t.location.placeName && score < bestScore) {
        nearest = t;
        nearestDist = d;
      }
    }
    if (!visits) return null;
    const categoryId = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      placeName: nearest?.location?.placeName,
      address: nearest?.location?.address,
      customName: nearest?.location?.customName,
      categoryId,
      visits,
      distance: nearest ? nearestDist : 0,
    };
  }

  /** Total spent within `radiusM` of a point since a given date. */
  spentNear(point: LatLng, radiusM: number, since: Date) {
    const from = since.toISOString();
    let total = 0;
    let count = 0;
    for (const t of this._items()) {
      if (t.type !== 'expense' || !t.location || t.date < from) continue;
      if (distanceMeters(point, t.location) <= radiusM) {
        total += t.amount;
        count++;
      }
    }
    return { total, count };
  }

  /**
   * Payments logged while offline only have coordinates. When the app is back
   * online, look up their addresses one by one (rate-limited by the geocoder).
   */
  private resolving = false;
  async resolvePendingAddresses(): Promise<number> {
    if (this.resolving || !this.settings.settings().addressLookup) return 0;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
    this.resolving = true;
    let resolved = 0;
    try {
      const pending = this._items().filter((t) => t.location?.geocodeStatus === 'pending');
      for (const tx of pending) {
        const loc = tx.location!;
        try {
          const info = await this.geocoder.reverse(loc.lat, loc.lng);
          const next: GeoTag = {
            ...loc,
            placeName: loc.customName ? loc.placeName : info.placeName,
            address: info.address,
            geocodeStatus: 'ok',
          };
          this._items.update((list) => list.map((t) => (t.id === tx.id ? { ...t, location: next } : t)));
          resolved++;
        } catch {
          break; // still offline or rate limited; try again later
        }
      }
      if (resolved) await this.persist();
    } finally {
      this.resolving = false;
    }
    return resolved;
  }

  private async persist() {
    await this.storage.set(KEY, this._items());
  }
}


function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

