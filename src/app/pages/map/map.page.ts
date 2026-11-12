import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  IonButton,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
} from '@ionic/angular';
import * as L from 'leaflet';

import { categoryById } from '../../core/categories';
import { dayKey, friendlyDay, startOfDay, startOfMonth, timeOf } from '../../core/date-utils';
import { PlaceCluster, clusterPlaces, distanceMeters, formatDistance } from '../../core/geo-utils';
import { DEFAULT_CENTER, createMap, escapeHtml, pricePin, stepPin, userPin } from '../../core/map-utils';
import { Transaction } from '../../core/models';
import { MoneyPipe, formatMoney } from '../../core/money.pipe';
import { FeedbackService } from '../../core/services/feedback.service';
import { LocationService } from '../../core/services/location.service';
import { SettingsService } from '../../core/services/settings.service';
import { TransactionService } from '../../core/services/transaction.service';
import { PlaceDetailComponent } from '../../shared/place-detail.component';

type Mode = 'pins' | 'places' | 'trail';
type Period = 'today' | 'week' | 'month' | 'all';

const INCOME_COLOR = '#16a34a';
const TRAIL_COLOR = '#5b5fef';

@Component({
  selector: 'app-map',
  templateUrl: 'map.page.html',
  styleUrls: ['map.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonChip,
    IonIcon,
    IonButton,
    IonSpinner,
    MoneyPipe,
  ],
})
export class MapPage implements OnDestroy {
  private txService = inject(TransactionService);
  private settings = inject(SettingsService);
  private location = inject(LocationService);
  private feedback = inject(FeedbackService);
  private nav = inject(NavController);
  private modalCtrl = inject(ModalController);

  private mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: L.Map;
  private dataLayer = L.layerGroup();
  private meLayer = L.layerGroup();
  private fitNext = true;
  private lastCount = -1;

  readonly mode = signal<Mode>('pins');
  readonly period = signal<Period>('week');
  readonly trailDay = signal<string | null>(null);
  readonly bounds = signal<L.LatLngBounds | null>(null);
  readonly locating = signal(false);

  readonly periods: { id: Period; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: '7 days' },
    { id: 'month', label: 'This month' },
    { id: 'all', label: 'All time' },
  ];

  readonly tagged = computed(() => this.txService.transactions().filter((t) => t.location));

  /** Geotagged transactions inside the selected period. */
  readonly filtered = computed(() => {
    const now = this.txService.now();
    let from: Date | null = null;
    switch (this.period()) {
      case 'today':
        from = startOfDay(now);
        break;
      case 'week':
        from = startOfDay(now);
        from.setDate(from.getDate() - 6);
        break;
      case 'month':
        from = startOfMonth(now);
        break;
    }
    const iso = from?.toISOString();
    return iso ? this.tagged().filter((t) => t.date >= iso) : this.tagged();
  });

  readonly placesInPeriod = computed(() =>
    clusterPlaces(
      this.filtered().filter((t) => t.type === 'expense'),
      this.settings.settings().placeRadius,
    ).sort((a, b) => b.totalSpent - a.totalSpent),
  );

  /** Days that have at least one geotagged payment (newest first). */
  readonly trailDays = computed(() => [...new Set(this.tagged().map((t) => dayKey(t.date)))]);
  readonly activeTrailDay = computed(() => this.trailDay() ?? this.trailDays()[0] ?? null);
  readonly trailTx = computed(() => {
    const day = this.activeTrailDay();
    return this.tagged()
      .filter((t) => dayKey(t.date) === day)
      .sort((a, b) => a.date.localeCompare(b.date));
  });
  readonly trailStats = computed(() => {
    const list = this.trailTx();
    let distance = 0;
    for (let i = 1; i < list.length; i++) distance += distanceMeters(list[i - 1].location!, list[i].location!);
    const spent = list.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    return {
      label: list.length ? friendlyDay(list[0].date) : '',
      stops: list.length,
      spent,
      distance: formatDistance(distance),
      first: list.length ? timeOf(list[0].date) : '',
      last: list.length ? timeOf(list[list.length - 1].date) : '',
    };
  });
  readonly canPrevDay = computed(() => {
    const idx = this.trailDays().indexOf(this.activeTrailDay() ?? '');
    return idx >= 0 && idx < this.trailDays().length - 1;
  });
  readonly canNextDay = computed(() => this.trailDays().indexOf(this.activeTrailDay() ?? '') > 0);

  /** Live total for whatever part of the map is currently visible. */
  readonly inView = computed(() => {
    const b = this.bounds();
    const list = this.mode() === 'trail' ? this.trailTx() : this.filtered();
    let spent = 0;
    let count = 0;
    for (const t of list) {
      if (t.type !== 'expense') continue;
      if (b && !b.contains([t.location!.lat, t.location!.lng])) continue;
      spent += t.amount;
      count++;
    }
    return { spent, count };
  });

  readonly isEmpty = computed(() => (this.mode() === 'trail' ? this.trailTx().length === 0 : this.filtered().length === 0));

  constructor() {
    // Redraw the map whenever the data or the selected view changes.
    effect(() => {
      this.mode();
      this.filtered();
      this.trailTx();
      this.placesInPeriod();
      this.render();
    });
  }

  ionViewDidEnter() {
    if (!this.map) {
      this.map = createMap(this.mapEl().nativeElement, {
        center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
        zoom: 13,
      });
      this.dataLayer.addTo(this.map);
      this.meLayer.addTo(this.map);
      this.map.on('moveend', () => this.bounds.set(this.map!.getBounds()));
      this.render();
      if (!this.tagged().length) void this.locateMe(true);
    } else {
      this.map.invalidateSize();
      // New payments since last visit? Re-fit so they're visible.
      if (this.tagged().length !== this.lastCount) {
        this.fitNext = true;
        this.render();
      }
    }
  }

  setMode(value: unknown) {
    this.mode.set((value as Mode) ?? 'pins');
    this.fitNext = true;
    void this.feedback.selection();
  }

  setPeriod(p: Period) {
    this.period.set(p);
    this.fitNext = true;
    void this.feedback.selection();
  }

  shiftDay(direction: -1 | 1) {
    const days = this.trailDays();
    const idx = days.indexOf(this.activeTrailDay() ?? '');
    // days are newest-first: "previous day" means a higher index
    const next = days[idx - direction];
    if (!next) return;
    this.trailDay.set(next);
    this.fitNext = true;
    void this.feedback.selection();
  }

  fitAll() {
    this.fitNext = true;
    this.render();
  }

  async locateMe(silent = false) {
    this.locating.set(true);
    try {
      const fix = await this.location.quickFix(this.settings.settings().highAccuracy);
      this.meLayer.clearLayers();
      L.circle([fix.lat, fix.lng], {
        radius: fix.accuracy,
        color: '#2563eb',
        weight: 1,
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(this.meLayer);
      L.marker([fix.lat, fix.lng], { icon: userPin(), interactive: false, zIndexOffset: 2000 }).addTo(this.meLayer);
      this.map?.flyTo([fix.lat, fix.lng], Math.max(this.map.getZoom(), 16), { duration: 0.8 });
    } catch (err) {
      if (!silent) void this.feedback.toast(this.location.describeError(err), { color: 'warning', icon: 'warning' });
    } finally {
      this.locating.set(false);
    }
  }

  private render() {
    if (!this.map) return;
    this.dataLayer.clearLayers();
    this.lastCount = this.tagged().length;

    const points: L.LatLngExpression[] = [];
    switch (this.mode()) {
      case 'pins':
        this.renderPins(points);
        break;
      case 'places':
        this.renderPlaces(points);
        break;
      case 'trail':
        this.renderTrail(points);
        break;
    }

    if (this.fitNext && points.length) {
      this.fitNext = false;
      const b = L.latLngBounds(points);
      this.map.fitBounds(b, { padding: [60, 60], maxZoom: 17, animate: true });
    }
    this.bounds.set(this.map.getBounds());
  }

  private renderPins(points: L.LatLngExpression[]) {
    const currency = this.settings.settings().currency;
    for (const t of this.filtered()) {
      const loc = t.location!;
      const color = t.type === 'income' ? INCOME_COLOR : categoryById(t.categoryId).color;
      const label = `${t.type === 'income' ? '+' : ''}${formatMoney(t.amount, currency, true)}`;
      L.marker([loc.lat, loc.lng], { icon: pricePin(color, label), zIndexOffset: Math.round(t.amount) })
        .bindPopup(() => this.popupFor(t))
        .addTo(this.dataLayer);
      points.push([loc.lat, loc.lng]);
    }
  }

  private renderPlaces(points: L.LatLngExpression[]) {
    const currency = this.settings.settings().currency;
    const places = this.placesInPeriod();
    const max = Math.max(...places.map((p) => p.totalSpent), 1);
    places.forEach((p, rank) => {
      const color = categoryById(p.topCategoryId).color;
      // Area of the bubble is proportional to money spent there.
      const radius = 10 + 28 * Math.sqrt(p.totalSpent / max);
      L.circleMarker([p.center.lat, p.center.lng], {
        radius,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.35,
      })
        .bindTooltip(`${escapeHtml(p.name)} · ${formatMoney(p.totalSpent, currency, true)}`, {
          permanent: rank < 5,
          direction: 'top',
          offset: [0, -radius],
          className: 'ft-place-label',
        })
        .on('click', () => void this.openPlace(p))
        .addTo(this.dataLayer);
      points.push([p.center.lat, p.center.lng]);
    });
  }

  private renderTrail(points: L.LatLngExpression[]) {
    const list = this.trailTx();
    const path = list.map((t) => [t.location!.lat, t.location!.lng] as L.LatLngTuple);
    if (path.length > 1) {
      L.polyline(path, { color: TRAIL_COLOR, weight: 4, opacity: 0.85, dashArray: '2 10', lineCap: 'round' }).addTo(
        this.dataLayer,
      );
    }
    list.forEach((t, i) => {
      const color = t.type === 'income' ? INCOME_COLOR : categoryById(t.categoryId).color;
      L.marker(path[i], { icon: stepPin(color, i + 1), zIndexOffset: i })
        .bindPopup(() => this.popupFor(t, i + 1))
        .addTo(this.dataLayer);
    });
    points.push(...path);
  }

  /** Popup content built as a DOM node so the button can navigate inside the app. */
  private popupFor(t: Transaction, step?: number): HTMLElement {
    const cat = categoryById(t.categoryId);
    const el = document.createElement('div');
    el.className = 'ft-popup';
    const amount = `${t.type === 'income' ? '+' : '−'}${formatMoney(t.amount, this.settings.settings().currency)}`;
    el.innerHTML = `
      <div class="amt" style="color:${t.type === 'income' ? INCOME_COLOR : 'inherit'}">${amount}</div>
      <div class="meta">
        ${step ? `<b>Stop ${step}</b> · ` : ''}${escapeHtml(t.note || cat.name)}<br/>
        ${escapeHtml(t.location?.placeName ?? 'Unnamed place')}<br/>
        ${escapeHtml(friendlyDay(t.date))}, ${escapeHtml(timeOf(t.date))}
      </div>
      <button type="button">View details</button>`;
    el.querySelector('button')!.addEventListener('click', () => {
      this.map?.closePopup();
      this.nav.navigateForward(['/transaction', t.id]);
    });
    return el;
  }

  async openPlace(place: PlaceCluster) {
    void this.feedback.tap();
    const modal = await this.modalCtrl.create({
      component: PlaceDetailComponent,
      componentProps: { place },
      breakpoints: [0, 0.6, 1],
      initialBreakpoint: 0.6,
    });
    await modal.present();
  }

  addExpense() {
    this.nav.navigateForward(['/transaction/new']);
  }

  ngOnDestroy() {
    this.map?.remove();
  }
}

