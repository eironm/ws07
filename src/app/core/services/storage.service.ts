import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

/**
 * Thin JSON wrapper around Capacitor Preferences (SharedPreferences on Android,
 * localStorage on the web). All app data lives on the device.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const { value } = await Preferences.get({ key });
      return value ? (JSON.parse(value) as T) : fallback;
    } catch (err) {
      console.error(`[storage] failed to read "${key}"`, err);
      return fallback;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    await Preferences.set({ key, value: JSON.stringify(value) });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}

