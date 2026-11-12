import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import * as L from 'leaflet';

import { LatLng, formatCoords } from '../core/geo-utils';
import { DEFAULT_CENTER, createMap, userPin } from '../core/map-utils';
import { GeocodeStatus } from '../core/models';
import { FeedbackService } from '../core/services/feedback.service';
import { GeocodingService, SearchResult } from '../core/services/geocoding.service';
import { LocationService } from '../core/services/location.service';
import { SettingsService } from '../core/services/settings.service';
import { TransactionService } from '../core/services/transaction.service';

export interface PickedLocation extends LatLng {
  placeName?: string;
  address?: string;
  customName: boolean;
  geocodeStatus: GeocodeStatus;
}

/**
 * Full-screen map to correct or manually choose where a payment happened.
 * Works like ride-hailing apps: drag the map under a fixed center pin.
 */
@Component({
  selector: 'app-location-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonInput,
    IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="cancel()">Cancel</ion-button>
        </ion-buttons>
        <ion-title>Where did you pay?</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar
          placeholder="Search a store, street or landmark"
          [debounce]="700"
          (ionInput)="search($event.detail.value ?? '')"
          (ionClear)="results.set([])"
          aria-label="Search places"
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content [scrollY]="false">
      <div class="picker">
        <div class="map-wrap">
        <div #mapEl class="map"></div>

        <div class="center-pin" [class.lifted]="moving()" aria-hidden="true">
          <ion-icon name="location"></ion-icon>
          <span class="shadow"></span>
        </div>

        @if (searching()) {
          <div class="results loading"><ion-spinner name="dots"></ion-spinner></div>
        } @else if (results().length) {
          <ion-list class="results" lines="full">
            @for (r of results(); track $index) {
              <ion-item [button]="true" [detail]="false" (click)="choose(r)">
                <ion-icon name="location-outline" slot="start"></ion-icon>
                <ion-label>
                  <h3>{{ r.placeName }}</h3>
                  <p>{{ r.address }}</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        } @else if (searchError()) {
          <div class="results error">{{ searchError() }}</div>
        }

        <button class="locate-btn" (click)="goToMe()" aria-label="Go to my location">
          @if (locating()) {
            <ion-spinner name="crescent"></ion-spinner>
          } @else {
            <ion-icon name="locate"></ion-icon>
          }
        </button>
        </div>

        <div class="sheet">
          <div class="addr">
            @if (looking()) {
              <ion-spinner name="dots"></ion-spinner>
              <span>Finding address…</span>
            } @else {
              <div>
                <strong>{{ foundName() || 'Unnamed place' }}</strong>
                <small>{{ foundAddress() || coordsText() }}</small>
              </div>
            }
          </div>
          <ion-input
            class="name-input"
            fill="outline"
            label="Place name (optional)"
            labelPlacement="floating"
            placeholder="e.g. School canteen"
            [maxlength]="40"
            [clearInput]="true"
            [value]="name()"
            (ionInput)="onName($event.detail.value ?? '')"
          ></ion-input>
          <ion-button expand="block" size="large" (click)="confirm()">
            <ion-icon name="checkmark" slot="start"></ion-icon>
            Use this location
          </ion-button>
        </div>
      </div>
    </ion-content>
  `,
  styles: `
    .picker {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .map-wrap {
      position: relative;
      flex: 1;
    }
    .map {
      position: absolute;
      inset: 0;
    }
    .center-pin {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -100%);
      z-index: 500;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      transition: transform 0.15s ease;
    }
    .center-pin ion-icon {
      font-size: 46px;
      color: var(--ion-color-primary);
      filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.35));
    }
    .center-pin .shadow {
      width: 10px;
      height: 4px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.35);
      margin-top: -4px;
    }
    .center-pin.lifted {
      transform: translate(-50%, calc(-100% - 10px));
    }
    .results {
      position: absolute;
      top: 8px;
      left: 8px;
      right: 8px;
      z-index: 600;
      border-radius: 14px;
      overflow: auto;
      max-height: 45%;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      background: var(--ion-background-color);
    }
    .results.loading,
    .results.error {
      padding: 14px;
      text-align: center;
      font-size: 14px;
    }
    .locate-btn {
      position: absolute;
      right: 14px;
      bottom: 30px;
      z-index: 600;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      background: var(--ion-background-color);
      color: var(--ion-color-primary);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      display: grid;
      place-items: center;
      font-size: 24px;
    }
    .sheet {
      position: relative;
      margin-top: -16px;
      z-index: 600;
      padding: 14px 16px calc(14px + var(--ion-safe-area-bottom, 0px));
      background: var(--ion-background-color);
      border-radius: 20px 20px 0 0;
      box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .addr {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
    }
    .addr strong {
      display: block;
      font-size: 16px;
    }
    .addr small {
      color: var(--ion-color-medium);
    }
  `,
})
export class LocationPickerComponent implements OnInit, OnDestroy {
  /** Starting point (e.g. the GPS fix to be corrected). */
  @Input() initial: LatLng | null = null;
  @Input() initialName = '';
  @Input() initialCustom = false;

  private modalCtrl = inject(ModalController);
  private geocoder = inject(GeocodingService);
  private location = inject(LocationService);
  private settings = inject(SettingsService);
  private txService = inject(TransactionService);
  private feedback = inject(FeedbackService);

  private mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: L.Map;
  private meMarker?: L.Marker;
  private lookupTimer: ReturnType<typeof setTimeout> | undefined;
  private lookupSeq = 0;

  readonly center = signal<LatLng | null>(null);
  readonly moving = signal(false);
  readonly looking = signal(false);
  readonly locating = signal(false);
  readonly searching = signal(false);
  readonly searchError = signal('');
  readonly results = signal<SearchResult[]>([]);
  readonly foundName = signal('');
  readonly foundAddress = signal('');
  readonly name = signal('');
  private nameTouched = false;
  private geocodeStatus: GeocodeStatus = 'off';

  ngOnInit() {
    this.name.set(this.initialName);
    this.nameTouched = this.initialCustom;
  }

  ionViewDidEnter() {
    // Wait for the modal animation so Leaflet measures the final size.
    if (this.map) return;
    const start = this.initial ?? this.location.lastFix() ?? DEFAULT_CENTER;
    const zoom = this.initial || this.location.lastFix() ? 18 : 13;
    this.map = createMap(this.mapEl().nativeElement, { center: [start.lat, start.lng], zoom });
    this.map.on('movestart', () => this.moving.set(true));
    this.map.on('moveend', () => {
      this.moving.set(false);
      this.onCenterChanged();
    });
    this.onCenterChanged();
    if (!this.initial && !this.location.lastFix()) void this.goToMe();
  }

  private onCenterChanged() {
    if (!this.map) return;
    const ll = this.map.getCenter();
    const c = { lat: ll.lat, lng: ll.lng };
    this.center.set(c);

    clearTimeout(this.lookupTimer);
    this.lookupTimer = setTimeout(() => void this.lookup(c), 600);
  }

  private async lookup(c: LatLng) {
    const seq = ++this.lookupSeq;
    // 1) Offline suggestion from your own history
    const known = this.txService.suggestFor(c, 40);
    if (known?.placeName) {
      this.foundName.set(known.placeName);
      this.foundAddress.set(known.address ?? '');
      if (!this.nameTouched) this.name.set(known.placeName);
      this.geocodeStatus = 'ok';
      return;
    }
    if (!this.settings.settings().addressLookup) {
      this.foundName.set('');
      this.foundAddress.set('');
      this.geocodeStatus = 'off';
      return;
    }
    // 2) OpenStreetMap reverse geocoding
    this.looking.set(true);
    try {
      const info = await this.geocoder.reverse(c.lat, c.lng);
      if (seq !== this.lookupSeq) return;
      this.foundName.set(info.placeName);
      this.foundAddress.set(info.address);
      if (!this.nameTouched) this.name.set(info.placeName);
      this.geocodeStatus = 'ok';
    } catch {
      if (seq !== this.lookupSeq) return;
      this.foundName.set('');
      this.foundAddress.set('Address unavailable offline — it will be filled in later.');
      this.geocodeStatus = 'pending';
    } finally {
      if (seq === this.lookupSeq) this.looking.set(false);
    }
  }

  coordsText() {
    const c = this.center();
    return c ? formatCoords(c) : '';
  }

  onName(value: string) {
    this.name.set(value);
    this.nameTouched = value.trim().length > 0;
  }

  async search(query: string) {
    this.searchError.set('');
    if (query.trim().length < 3) {
      this.results.set([]);
      return;
    }
    this.searching.set(true);
    try {
      const res = await this.geocoder.search(query.trim(), this.center());
      this.results.set(res);
      if (!res.length) this.searchError.set('No places found. Try a different name.');
    } catch {
      this.results.set([]);
      this.searchError.set('Search needs an internet connection.');
    } finally {
      this.searching.set(false);
    }
  }

  choose(r: SearchResult) {
    this.results.set([]);
    this.map?.setView([r.lat, r.lng], 18);
    if (!this.nameTouched) this.name.set(r.placeName);
    void this.feedback.selection();
  }

  async goToMe() {
    this.locating.set(true);
    try {
      const fix = await this.location.quickFix(this.settings.settings().highAccuracy);
      if (!this.map) return;
      this.meMarker ??= L.marker([fix.lat, fix.lng], { icon: userPin(), interactive: false }).addTo(this.map);
      this.meMarker.setLatLng([fix.lat, fix.lng]);
      this.map.setView([fix.lat, fix.lng], 18);
    } catch (err) {
      void this.feedback.toast(this.location.describeError(err), { color: 'warning', icon: 'warning' });
    } finally {
      this.locating.set(false);
    }
  }

  cancel() {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    const c = this.center();
    if (!c) return;
    const typed = this.name().trim();
    const result: PickedLocation = {
      lat: c.lat,
      lng: c.lng,
      placeName: typed || this.foundName() || undefined,
      address: this.foundAddress() && this.geocodeStatus === 'ok' ? this.foundAddress() : undefined,
      customName: !!typed && typed !== this.foundName(),
      geocodeStatus: this.geocodeStatus,
    };
    void this.feedback.success();
    void this.modalCtrl.dismiss(result, 'confirm');
  }

  ngOnDestroy() {
    clearTimeout(this.lookupTimer);
    this.map?.remove();
  }
}
