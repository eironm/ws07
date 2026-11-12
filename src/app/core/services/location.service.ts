import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Geolocation, PermissionStatus, Position } from '@capacitor/geolocation';

import { GeoSource } from '../models';

export interface Fix {
  lat: number;
  lng: number;
  /** meters */
  accuracy: number;
  timestamp: number;
  source: GeoSource;
}

export type LocationErrorCode = 'denied' | 'disabled' | 'timeout' | 'unavailable' | 'cancelled';

export class LocationError extends Error {
  constructor(
    public readonly code: LocationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * granted     -> precise location allowed
 * approximate -> Android 12+ "Approximate" only (accuracy of 1–3 km)
 * prompt      -> not asked yet
 * denied      -> user said no
 * disabled    -> device location services are off
 */
export type PermissionInfo = 'granted' | 'approximate' | 'prompt' | 'denied' | 'disabled' | 'unsupported';

export interface AcquireOptions {
  highAccuracy: boolean;
  /** Stop refining once a reading is at least this accurate (meters). */
  targetAccuracy?: number;
  /** Give up refining after this long and return the best reading so far. */
  maxWaitMs?: number;
  /** Called every time a more accurate reading arrives. */
  onProgress?: (fix: Fix) => void;
  /** Abort refining early; resolves with the best reading so far (if any). */
  signal?: AbortSignal;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  /** Most recent good reading, shared across pages (e.g. Home "near you"). */
  readonly lastFix = signal<Fix | null>(null);
  readonly permissionState = signal<PermissionInfo>('prompt');

  async permission(): Promise<PermissionInfo> {
    let result: PermissionInfo;
    try {
      result = this.interpret(await Geolocation.checkPermissions());
    } catch (err) {
      const mapped = this.mapError(err);
      if (mapped.code === 'disabled') result = 'disabled';
      else if (typeof navigator !== 'undefined' && !('geolocation' in navigator)) result = 'unsupported';
      else result = 'prompt';
    }
    this.permissionState.set(result);
    return result;
  }

  /** Checks the permission and shows the OS prompt if the user hasn't decided yet. */
  async ensurePermission(): Promise<PermissionInfo> {
    let state = await this.permission();
    if (state === 'prompt' && Capacitor.isNativePlatform()) {
      try {
        state = this.interpret(await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] }));
      } catch (err) {
        state = this.mapError(err).code === 'disabled' ? 'disabled' : 'denied';
      }
      this.permissionState.set(state);
    }
    // On the web the browser shows its own prompt on the first position request.
    return state;
  }

  /**
   * Gets the device position and keeps *refining* it for a few seconds:
   * the first GPS reading is often off by 30–100 m, so we watch the position
   * and keep the most accurate reading until it is good enough, the time runs
   * out, or the caller aborts (e.g. the user taps Save).
   *
   * Falls back to a cached/network position if GPS cannot get a fix in time.
   */
  async acquire(opts: AcquireOptions): Promise<Fix> {
    const { highAccuracy, targetAccuracy = 20, maxWaitMs = 15000, onProgress, signal } = opts;

    const perm = await this.ensurePermission();
    if (perm === 'denied') throw new LocationError('denied', 'Location permission was denied.');
    if (perm === 'disabled') throw new LocationError('disabled', 'Location services are turned off.');
    if (perm === 'unsupported') throw new LocationError('unavailable', 'This device has no location support.');

    const source: GeoSource = highAccuracy && perm !== 'approximate' ? 'gps' : 'network';

    return new Promise<Fix>((resolve, reject) => {
      let best: Fix | null = null;
      let watchId: string | null = null;
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (settle: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (watchId) void Geolocation.clearWatch({ id: watchId });
        settle();
      };

      const onAbort = () =>
        finish(() => (best ? resolve(best) : reject(new LocationError('cancelled', 'Location request cancelled.'))));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort);

      // Hard deadline: return the best reading, or fall back to a coarse/cached one.
      timer = setTimeout(async () => {
        if (best) return finish(() => resolve(best!));
        try {
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 10 * 60 * 1000,
          });
          const fix = this.toFix(pos, 'network');
          this.lastFix.set(fix);
          onProgress?.(fix);
          finish(() => resolve(fix));
        } catch (err) {
          finish(() => reject(this.mapError(err)));
        }
      }, maxWaitMs);

      Geolocation.watchPosition(
        { enableHighAccuracy: highAccuracy, timeout: maxWaitMs, maximumAge: 0 },
        (pos, err) => {
          if (done) return;
          if (err) {
            const mapped = this.mapError(err);
            // Timeouts are handled by our own deadline; fatal errors end the request.
            if (mapped.code === 'denied' || mapped.code === 'disabled') finish(() => reject(mapped));
            return;
          }
          if (!pos) return;
          const fix = this.toFix(pos, source);
          if (!best || fix.accuracy < best.accuracy) {
            best = fix;
            this.lastFix.set(fix);
            onProgress?.(fix);
          }
          if (fix.accuracy <= targetAccuracy) finish(() => resolve(best!));
        },
      )
        .then((id) => {
          watchId = id;
          if (done) void Geolocation.clearWatch({ id });
        })
        .catch((err) => finish(() => reject(this.mapError(err))));
    });
  }

  /** One-shot position, accepting a recent cached reading. Used for "near you" stats. */
  async quickFix(highAccuracy: boolean): Promise<Fix> {
    const recent = this.lastFix();
    if (recent && Date.now() - recent.timestamp < 60_000) return recent;
    const perm = await this.ensurePermission();
    if (perm === 'denied') throw new LocationError('denied', 'Location permission was denied.');
    if (perm === 'disabled') throw new LocationError('disabled', 'Location services are turned off.');
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 60000 });
      const fix = this.toFix(pos, highAccuracy ? 'gps' : 'network');
      this.lastFix.set(fix);
      return fix;
    } catch (err) {
      throw this.mapError(err);
    }
  }

  describeError(err: unknown): string {
    const e = err instanceof LocationError ? err : this.mapError(err);
    switch (e.code) {
      case 'denied':
        return Capacitor.getPlatform() === 'android'
          ? 'Location permission is off. Enable it in Settings › Apps › Finance; Tracker › Permissions.'
          : "Location is blocked for this site. Allow it in your browser's site settings, then try again.";
      case 'disabled':
        return Capacitor.getPlatform() === 'android'
          ? 'Your device location (GPS) is turned off. Turn it on from the quick settings panel.'
          : "Your device or browser isn't sharing a location right now.";
      case 'timeout':
        return 'Could not get a GPS fix in time. Try moving near a window or outdoors.';
      case 'cancelled':
        return 'Location request cancelled.';
      default:
        return 'Location is unavailable right now.';
    }
  }

  private toFix(pos: Position, source: GeoSource): Fix {
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy ?? 9999),
      timestamp: pos.timestamp ?? Date.now(),
      source,
    };
  }

  private interpret(s: PermissionStatus): PermissionInfo {
    if (s.location === 'granted') return 'granted';
    if (s.coarseLocation === 'granted') return 'approximate';
    if (s.location === 'denied') return 'denied';
    return 'prompt';
  }

  mapError(err: unknown): LocationError {
    if (err instanceof LocationError) return err;
    const e = err as { code?: number | string; message?: string } | null;
    const msg = String(e?.message ?? err ?? '');
    if (e?.code === 1 || /denied|permission/i.test(msg)) return new LocationError('denied', msg);
    if (/disabled|not enabled|services|turned off/i.test(msg)) return new LocationError('disabled', msg);
    if (e?.code === 3 || /time ?out|timed out/i.test(msg)) return new LocationError('timeout', msg);
    return new LocationError('unavailable', msg);
  }
}
