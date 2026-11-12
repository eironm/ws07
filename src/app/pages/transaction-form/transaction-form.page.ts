import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
} from '@ionic/angular';

import { categoriesFor, categoryById } from '../../core/categories';
import { toLocalIso } from '../../core/date-utils';
import { LatLng, distanceMeters, formatCoords } from '../../core/geo-utils';
import { GeoTag, PAYMENT_METHODS, PaymentMethod, TxType } from '../../core/models';
import { MoneyPipe, formatMoney } from '../../core/money.pipe';
import { FeedbackService } from '../../core/services/feedback.service';
import { GeocodingService } from '../../core/services/geocoding.service';
import { Fix, LocationErrorCode, LocationService } from '../../core/services/location.service';
import { SettingsService } from '../../core/services/settings.service';
import { TransactionService } from '../../core/services/transaction.service';
import { LocationPickerComponent, PickedLocation } from '../../shared/location-picker.component';
import { MiniMapComponent } from '../../shared/mini-map.component';

type LocStatus = 'off' | 'ask' | 'locating' | 'ready' | 'error';

const MAX_AMOUNT = 10_000_000;
/** Re-run address lookup only if the fix moved more than this. */
const REGEOCODE_DISTANCE_M = 30;

@Component({
  selector: 'app-transaction-form',
  templateUrl: 'transaction-form.page.html',
  styleUrls: ['transaction-form.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonFooter,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonInput,
    IonIcon,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    IonSpinner,
    MiniMapComponent,
    MoneyPipe,
  ],
})
export class TransactionFormPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private nav = inject(NavController);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private txService = inject(TransactionService);
  readonly location = inject(LocationService);
  private geocoder = inject(GeocodingService);
  private feedback = inject(FeedbackService);
  readonly settings = inject(SettingsService);

  readonly methods = PAYMENT_METHODS;
  readonly maxDate = toLocalIso(new Date());

  // ---- form fields ----
  readonly editId = signal<string | null>(null);
  readonly type = signal<TxType>('expense');
  readonly amountText = signal('');
  readonly categoryId = signal<string | null>(null);
  readonly note = signal('');
  readonly method = signal<PaymentMethod>('cash');
  readonly dateIso = signal(toLocalIso(new Date()));
  readonly submitted = signal(false);
  readonly saving = signal(false);
  private categoryTouched = false;

  // ---- location state ----
  readonly locStatus = signal<LocStatus>('off');
  readonly geo = signal<GeoTag | null>(null);
  readonly refining = signal(false);
  readonly lookingUp = signal(false);
  readonly locError = signal<{ code: LocationErrorCode; message: string } | null>(null);
  readonly visitsHere = signal(0);
  readonly suggestedCategory = signal<string | null>(null);
  private abort?: AbortController;
  private describedAt: LatLng | null = null;
  private describeSeq = 0;

  // ---- derived ----
  readonly isEdit = computed(() => this.editId() !== null);
  readonly categories = computed(() => categoriesFor(this.type()));
  readonly amount = computed(() => {
    const n = Number.parseFloat(this.amountText().replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  });
  readonly amountError = computed(() => {
    const a = this.amount();
    if (this.amountText().trim() === '') return 'Enter an amount';
    if (!Number.isFinite(a) || a <= 0) return 'Amount must be greater than 0';
    if (a > MAX_AMOUNT) return 'That amount looks too large';
    return null;
  });
  readonly categoryError = computed(() => (this.categoryId() ? null : 'Pick a category'));
  readonly valid = computed(() => !this.amountError() && !this.categoryError());
  readonly currencySymbol = computed(() =>
    formatMoney(0, this.settings.settings().currency, true).replace(/[\d.,\s]/g, ''),
  );
  readonly title = computed(() =>
    this.isEdit() ? 'Edit transaction' : this.type() === 'expense' ? 'New expense' : 'New income',
  );

  readonly accuracyClass = computed(() => {
    const g = this.geo();
    if (!g) return '';
    if (g.source === 'manual' || g.accuracy == null) return 'manual';
    return g.accuracy <= 25 ? 'good' : g.accuracy <= 100 ? 'ok' : 'poor';
  });
  readonly accuracyText = computed(() => {
    const g = this.geo();
    if (!g) return '';
    if (g.source === 'manual' || g.accuracy == null) return 'Set on map';
    return `±${g.accuracy} m · ${g.source === 'gps' ? 'GPS' : 'Network'}`;
  });
  readonly coordsText = computed(() => {
    const g = this.geo();
    return g ? formatCoords(g) : '';
  });
  /** Warn when logging an older payment with a fresh GPS stamp. */
  readonly pastDateWarning = computed(() => {
    const g = this.geo();
    if (!g || g.source === 'manual') return false;
    const age = Date.now() - new Date(this.dateIso()).getTime();
    return age > 2 * 60 * 60 * 1000;
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const existing = this.txService.getById(id);
      if (!existing) {
        void this.feedback.toast('Transaction not found', { color: 'danger' });
        this.nav.back();
        return;
      }
      this.editId.set(id);
      this.type.set(existing.type);
      this.amountText.set(String(existing.amount));
      this.categoryId.set(existing.categoryId);
      this.categoryTouched = true;
      this.note.set(existing.note);
      this.method.set(existing.method);
      this.dateIso.set(toLocalIso(new Date(existing.date)));
      if (existing.location) {
        this.geo.set(existing.location);
        this.describedAt = existing.location;
        this.locStatus.set('ready');
      }
      return;
    }

    const qType = this.route.snapshot.queryParamMap.get('type');
    if (qType === 'income') {
      this.type.set('income');
      this.method.set('ewallet');
    }
    // The headline feature: stamp the location automatically for new payments.
    if (this.settings.settings().autoLocation) void this.startStamping();
  }

  ngOnDestroy() {
    this.abort?.abort();
  }

  // ------------------------------------------------------------------
  // Location capture
  // ------------------------------------------------------------------

  /** First stamp only: explain it before the system permission prompt, instead of firing the prompt unannounced. */
  private async startStamping(): Promise<void> {
    if (!this.settings.settings().onboarded) {
      const perm = await this.location.permission();
      if (perm === 'prompt') {
        this.locStatus.set('ask');
        return;
      }
    }
    void this.captureLocation();
  }

  async allowStamping(): Promise<void> {
    await this.settings.update({ onboarded: true, autoLocation: true });
    void this.captureLocation();
  }

  /** Respect the answer: stop auto-stamping until it is turned back on in Settings. */
  async declineStamping(): Promise<void> {
    await this.settings.update({ onboarded: true, autoLocation: false });
    this.locStatus.set('off');
  }

  async captureLocation() {
    this.abort?.abort();
    const ctrl = new AbortController();
    this.abort = ctrl;

    this.locError.set(null);
    this.refining.set(true);
    if (!this.geo()) this.locStatus.set('locating');

    try {
      const fix = await this.location.acquire({
        highAccuracy: this.settings.settings().highAccuracy,
        signal: ctrl.signal,
        onProgress: (f) => {
          if (this.abort === ctrl) this.applyFix(f);
        },
      });
      if (this.abort !== ctrl) return; // a newer request replaced this one
      this.applyFix(fix);
      void this.feedback.tap();
    } catch (err) {
      if (this.abort !== ctrl) return;
      const e = this.location.mapError(err);
      if (e.code === 'cancelled') return;
      if (this.geo()) {
        // Keep the reading we already have; just report the refresh failure.
        void this.feedback.toast(this.location.describeError(e), { color: 'warning' });
      } else {
        this.locError.set({ code: e.code, message: this.location.describeError(e) });
        this.locStatus.set('error');
        void this.feedback.warning();
      }
    } finally {
      if (this.abort === ctrl) this.refining.set(false);
    }
  }

  /** Called for every improved GPS reading while refining. */
  private applyFix(f: Fix) {
    const prev = this.geo();
    const keepDescription = !!this.describedAt && distanceMeters(this.describedAt, f) <= REGEOCODE_DISTANCE_M;
    this.geo.set({
      lat: f.lat,
      lng: f.lng,
      accuracy: f.accuracy,
      capturedAt: new Date(f.timestamp).toISOString(),
      source: f.source,
      placeName: keepDescription ? prev?.placeName : undefined,
      address: keepDescription ? prev?.address : undefined,
      customName: keepDescription ? prev?.customName : false,
      geocodeStatus: keepDescription && prev ? prev.geocodeStatus : 'pending',
    });
    this.locStatus.set('ready');
    if (!keepDescription) void this.describe(f);
  }

  /**
   * Gives the coordinates a human name:
   * 1. instantly from your own history ("you've paid here before"), works offline;
   * 2. otherwise from OpenStreetMap (HTTP GET), if address lookup is enabled.
   */
  private async describe(point: LatLng) {
    const seq = ++this.describeSeq;
    this.describedAt = point;

    const known = this.txService.suggestFor(point, 50);
    this.visitsHere.set(known?.visits ?? 0);
    if (known?.categoryId && this.type() === 'expense') {
      this.suggestedCategory.set(known.categoryId);
      if (!this.categoryTouched) this.categoryId.set(known.categoryId);
    }
    if (known?.placeName) {
      this.patchGeo({ placeName: known.placeName, address: known.address, customName: known.customName, geocodeStatus: 'ok' });
      return;
    }

    if (!this.settings.settings().addressLookup) {
      this.patchGeo({ geocodeStatus: 'off' });
      return;
    }

    this.lookingUp.set(true);
    try {
      const info = await this.geocoder.reverse(point.lat, point.lng);
      if (seq !== this.describeSeq) return;
      this.patchGeo({ placeName: info.placeName, address: info.address, customName: false, geocodeStatus: 'ok' });
    } catch {
      if (seq !== this.describeSeq) return;
      // Probably offline: keep coordinates, address will be filled in later.
      this.patchGeo({ geocodeStatus: 'pending' });
    } finally {
      if (seq === this.describeSeq) this.lookingUp.set(false);
    }
  }

  private patchGeo(patch: Partial<GeoTag>) {
    const g = this.geo();
    if (g) this.geo.set({ ...g, ...patch });
  }

  async openPicker() {
    this.abort?.abort();
    this.refining.set(false);
    const g = this.geo();
    const modal = await this.modalCtrl.create({
      component: LocationPickerComponent,
      componentProps: {
        initial: g ? { lat: g.lat, lng: g.lng } : null,
        initialName: g?.placeName ?? '',
        initialCustom: !!g?.customName,
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<PickedLocation>();
    if (role !== 'confirm' || !data) return;

    this.describeSeq++; // cancel any in-flight lookup
    this.describedAt = data;
    this.lookingUp.set(false);
    this.locError.set(null);
    this.geo.set({
      lat: data.lat,
      lng: data.lng,
      accuracy: null,
      capturedAt: new Date().toISOString(),
      source: 'manual',
      placeName: data.placeName,
      address: data.address,
      customName: data.customName,
      geocodeStatus: data.geocodeStatus,
    });
    this.locStatus.set('ready');
    const known = this.txService.suggestFor(data, 50);
    this.visitsHere.set(known?.visits ?? 0);
  }

  async renamePlace() {
    const g = this.geo();
    if (!g) return;
    const alert = await this.alertCtrl.create({
      header: 'Name this place',
      message: 'Give it a name you will recognize, e.g. "School canteen".',
      inputs: [{ name: 'name', type: 'text', value: g.placeName ?? '', placeholder: 'Place name', attributes: { maxlength: 40 } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (v: { name: string }) => {
            const name = v.name?.trim();
            if (name) this.patchGeo({ placeName: name, customName: true });
          },
        },
      ],
    });
    await alert.present();
  }

  removeLocation() {
    this.abort?.abort();
    this.describeSeq++;
    this.geo.set(null);
    this.describedAt = null;
    this.refining.set(false);
    this.lookingUp.set(false);
    this.visitsHere.set(0);
    this.locStatus.set('off');
    void this.feedback.tap();
  }

  // ------------------------------------------------------------------
  // Form
  // ------------------------------------------------------------------

  setType(value: unknown) {
    const t = value === 'income' ? 'income' : 'expense';
    if (t === this.type()) return;
    this.type.set(t);
    this.categoryId.set(null);
    this.categoryTouched = false;
    void this.feedback.selection();
  }

  pickCategory(id: string) {
    this.categoryId.set(id);
    this.categoryTouched = true;
    void this.feedback.selection();
  }

  pickMethod(value: unknown) {
    this.method.set((value as PaymentMethod) ?? 'cash');
  }

  onDate(value: string | string[] | null | undefined) {
    if (typeof value === 'string') this.dateIso.set(value);
  }

  categoryName(id: string) {
    return categoryById(id).name;
  }

  async save() {
    this.submitted.set(true);
    if (!this.valid()) {
      void this.feedback.error();
      return;
    }

    // Still waiting for the very first GPS reading?
    if (this.locStatus() === 'locating' && !this.geo()) {
      const choice = await this.askSaveWithoutLocation();
      if (choice !== 'save') return;
    }
    this.abort?.abort(); // stop refining; we keep the best reading so far

    this.saving.set(true);
    try {
      const payload = {
        type: this.type(),
        amount: this.amount(),
        categoryId: this.categoryId()!,
        note: this.note().trim(),
        method: this.method(),
        date: new Date(this.dateIso()).toISOString(),
        location: this.geo(),
      };
      const editId = this.editId();
      if (editId) {
        await this.txService.update(editId, payload);
      } else {
        await this.txService.add(payload);
      }
      if (payload.location?.geocodeStatus === 'pending') void this.txService.resolvePendingAddresses();

      void this.feedback.success();
      const where = payload.location?.placeName ? ` · ${payload.location.placeName}` : '';
      void this.feedback.toast(`${this.isEdit() ? 'Updated' : 'Saved'} ${formatMoney(payload.amount, this.settings.settings().currency)}${where}`, {
        icon: 'checkmark-circle',
        color: 'success',
      });
      this.nav.back();
    } catch (err) {
      console.error(err);
      void this.feedback.error();
      void this.feedback.toast('Could not save. Please try again.', { color: 'danger' });
    } finally {
      this.saving.set(false);
    }
  }

  private async askSaveWithoutLocation(): Promise<'save' | 'wait'> {
    const alert = await this.alertCtrl.create({
      header: 'Still finding your location',
      message: 'Wait a few more seconds, or save this payment without a location?',
      buttons: [
        { text: 'Wait', role: 'cancel' },
        { text: 'Save without', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role === 'confirm') {
      this.removeLocation();
      return 'save';
    }
    return 'wait';
  }
}
