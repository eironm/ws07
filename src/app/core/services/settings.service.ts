import { Injectable, inject, signal } from '@angular/core';

import { AppSettings, DEFAULT_SETTINGS } from '../models';
import { StorageService } from './storage.service';

const KEY = 'ft.settings';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private storage = inject(StorageService);

  private readonly _settings = signal<AppSettings>(DEFAULT_SETTINGS);
  readonly settings = this._settings.asReadonly();

  async load(): Promise<void> {
    const saved = await this.storage.get<Partial<AppSettings>>(KEY, {});
    this._settings.set({ ...DEFAULT_SETTINGS, ...saved });
  }

  async update(patch: Partial<AppSettings>): Promise<void> {
    this._settings.update((s) => ({ ...s, ...patch }));
    await this.storage.set(KEY, this._settings());
  }

  async reset(): Promise<void> {
    this._settings.set({ ...DEFAULT_SETTINGS, onboarded: true });
    await this.storage.set(KEY, this._settings());
  }
}

