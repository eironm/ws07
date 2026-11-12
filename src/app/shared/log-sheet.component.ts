import type { OnInit } from '@angular/core';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';

import { categoriesFor, categoryById } from '../core/categories';
import { distanceMeters } from '../core/geo-utils';
import type { LatLng, PlaceCluster } from '../core/geo-utils';
import type { GeoTag, PaymentMethod } from '../core/models';
import { MoneyPipe, describeBalance, formatMoney, formatMoneyLedger } from '../core/money.pipe';
import { AllowanceService } from '../core/services/allowance.service';
import { FeedbackService } from '../core/services/feedback.service';
import type { Fix } from '../core/services/location.service';
import { LocationService } from '../core/services/location.service';
import { SettingsService } from '../core/services/settings.service';
import type { PlaceSuggestion } from '../core/services/transaction.service';
import { TransactionService } from '../core/services/transaction.service';

type WhereState = 'ask' | 'locating' | 'known' | 'new' | 'none';

interface Usual {
  label: string;
  note: string;
  amount: number;
  categoryId: string;
  method: PaymentMethod;
  count: number;
  last: string;
}

/** The name clusterPlaces gives a place no payment has named yet. */
const UNNAMED = 'Unnamed place';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

/**
 * The log sheet: opens on where you are. At a place you've paid before, your usual
 * payments there are one tap each; anywhere else, a keypad. A refused or rough
 * location never blocks logging.
 */
@Component({
  selector: 'app-log-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonIcon, IonSpinner, IonInput, MoneyPipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Log a payment</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="close()" aria-label="Close"><ion-icon slot="icon-only" name="close"></ion-icon></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ft-page sheet">
      <!-- Where you paid -->
      <section class="where" aria-live="polite">
        @switch (state()) {
          @case ('ask') {
            <h2 class="where-title">Stamp where you paid?</h2>
            <p class="where-sub">
              You'll see your spending by place, and next time this place takes one tap. Stamps stay on this phone; place
              names come from OpenStreetMap.
            </p>
            <div class="row">
              <ion-button (click)="allow()"><ion-icon slot="start" name="locate"></ion-icon>Stamp it</ion-button>
              <ion-button fill="clear" color="medium" (click)="decline()">Not now</ion-button>
            </div>
          }
          @case ('locating') {
            <p class="where-title quiet"><ion-spinner name="dots" aria-hidden="true"></ion-spinner> Finding where you are…</p>
            <p class="where-sub">You can type the amount while it looks.</p>
          }
          @case ('known') {
            <h2 class="where-title">At {{ placeName() }}?</h2>
            <p class="where-sub">
              {{ placeDetail() }}
              <button type="button" class="link" (click)="choosing.set(!choosing())">Somewhere else</button>
            </p>
          }
          @case ('new') {
            <h2 class="where-title">Somewhere new</h2>
            <p class="where-sub">
              {{ settings.settings().addressLookup ? 'It gets a name once you are online.' : 'Stamped without a name.' }}
              <button type="button" class="link" (click)="choosing.set(!choosing())">Pick a place</button>
            </p>
          }
          @default {
            <h2 class="where-title">No place</h2>
            <p class="where-sub">
              {{ reason() }}
              <button type="button" class="link" (click)="choosing.set(!choosing())">Pick a place</button>
            </p>
          }
        }
      </section>

      @if (choosing()) {
        <section class="pick" aria-labelledby="pick-title">
          <h3 id="pick-title">Where did you pay?</h3>
          <ul>
            @for (p of recentPlaces(); track p.id) {
              <li>
                <button type="button" class="pick-row" (click)="pickPlace(p)">
                  <span class="pick-name">{{ p.name }}</span>
                  <span class="pick-meta">{{ p.visits }} {{ p.visits === 1 ? 'visit' : 'visits' }}</span>
                </button>
              </li>
            }
            <li>
              <button type="button" class="pick-row" (click)="pickNoPlace()">
                <span class="pick-name">No place</span>
                <span class="pick-meta">Log it without a stamp</span>
              </button>
            </li>
          </ul>
        </section>
      }

      <!-- One tap: what you usually pay here, with what you'd have left after -->
      @if (usual().length) {
        <section class="usual" aria-labelledby="usual-title">
          <h3 id="usual-title">Your usual here</h3>
          <div class="tiles">
            @for (u of usual(); track u.label + u.amount) {
              <button type="button" class="tile" [disabled]="saving()" (click)="quickLog(u)" [attr.aria-label]="tileLabel(u)">
                <span class="tile-label">{{ u.label }}</span>
                <span class="tile-amount">{{ u.amount | money: 'ledger' }}</span>
                @if (left() !== null) {
                  <span class="tile-after">{{ afterText(u.amount) }}</span>
                }
              </button>
            }
          </div>
          @if (!customOpen()) {
            <button type="button" class="link other" (click)="customOpen.set(true)">Another amount</button>
          }
        </section>
      }

      <!-- Any amount -->
      @if (customOpen() || !usual().length) {
        <section class="custom" aria-labelledby="custom-title">
          <h3 id="custom-title" class="visually-hidden">Amount</h3>
          <div class="amount" aria-live="polite">
            <span class="amount-value">{{ symbol() }}{{ amountText() || '0' }}</span>
            @if (left() !== null && amount() > 0) {
              <span class="amount-after">{{ afterText(amount()) }}</span>
            }
          </div>

          <div class="cats" role="radiogroup" aria-label="Category">
            @for (c of categories; track c.id) {
              <button
                type="button"
                role="radio"
                class="cat"
                [class.on]="categoryId() === c.id"
                [attr.aria-checked]="categoryId() === c.id"
                (click)="pickCategory(c.id)"
              >
                <span class="cat-bubble" [style.--c]="c.color" aria-hidden="true"><ion-icon [name]="c.icon"></ion-icon></span>
                <span>{{ c.name }}</span>
              </button>
            }
          </div>

          @if (noteOpen()) {
            <ion-input
              class="note"
              label="Note"
              labelPlacement="stacked"
              fill="outline"
              placeholder="e.g. Lunch with friends"
              [value]="note()"
              (ionInput)="note.set($event.detail.value ?? '')"
            ></ion-input>
          } @else {
            <button type="button" class="link" (click)="noteOpen.set(true)">Add a note</button>
          }

          <div class="keypad">
            @for (k of keys; track k) {
              <button type="button" class="key" (click)="press(k)" [attr.aria-label]="k === 'del' ? 'Delete last digit' : k">
                @if (k === 'del') {
                  <ion-icon name="backspace-outline" aria-hidden="true"></ion-icon>
                } @else {
                  {{ k }}
                }
              </button>
            }
          </div>

          <ion-button expand="block" class="save" [disabled]="amount() <= 0 || saving()" (click)="saveCustom()">
            Log {{ amount() | money: 'ledger' }}
          </ion-button>
          <button type="button" class="link more" (click)="details()">More details: date, method, map</button>
        </section>
      }
    </ion-content>
  `,
  styles: `
    .sheet {
      --padding-start: 16px;
      --padding-end: 16px;
      --padding-bottom: calc(24px + var(--ion-safe-area-bottom, 0px));
    }
    h3 {
      margin: 0 0 8px;
      font-size: 14px;
      font-weight: 600;
      color: var(--ft-muted);
    }
    button.link {
      appearance: none;
      min-height: 44px;
      padding: 0 8px;
      margin: 0 -8px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: var(--ion-color-primary);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button:focus-visible {
      outline: 2px solid var(--ion-color-primary);
      outline-offset: 2px;
    }

    .where {
      padding: 12px 4px 8px;
    }
    .where-title {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      line-height: 1.2;
      text-wrap: balance;
    }
    .where-title.quiet {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 18px;
      font-weight: 600;
    }
    .where-sub {
      margin: 4px 0 0;
      font-size: 14px;
      line-height: 1.45;
      color: var(--ft-muted);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    ion-button {
      height: 44px;
    }

    .pick {
      margin: 8px 0 16px;
      padding: 12px;
      border-radius: 16px;
      background: var(--ft-card);
      border: 1px solid var(--ft-border);
    }
    .pick ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .pick-row {
      appearance: none;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 48px;
      padding: 0 4px;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .pick li + li .pick-row {
      border-top: 1px solid var(--ft-border);
    }
    .pick-name {
      font-size: 15px;
      font-weight: 500;
    }
    .pick-meta {
      font-size: 13px;
      color: var(--ft-muted);
    }

    .usual {
      margin-top: 12px;
    }
    .tiles {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .tile {
      appearance: none;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
      min-height: 104px;
      padding: 14px;
      border: 1px solid var(--ft-border);
      border-radius: 18px;
      background: var(--ft-card);
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .tile:first-child {
      border: 2px solid var(--ion-color-primary);
    }
    .tile:active {
      background: rgba(var(--ion-color-primary-rgb), 0.08);
    }
    .tile:disabled {
      opacity: 0.5;
    }
    .tile-label {
      width: 100%;
      overflow: hidden;
      font-size: 14px;
      color: var(--ft-muted);
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .tile-amount {
      font-size: 26px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .tile-after {
      font-size: 13px;
      color: var(--ft-muted);
      font-variant-numeric: tabular-nums;
    }
    .other {
      margin-top: 8px;
    }

    .custom {
      margin-top: 16px;
    }
    .amount {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px 12px;
      padding: 4px 4px 12px;
    }
    .amount-value {
      font-size: 40px;
      font-weight: 700;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .amount-after {
      font-size: 14px;
      color: var(--ft-muted);
      font-variant-numeric: tabular-nums;
    }

    .cats {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      margin: 0 -16px 8px;
      padding: 0 16px 4px;
      scrollbar-width: none;
    }
    .cats::-webkit-scrollbar {
      display: none;
    }
    .cat {
      appearance: none;
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 14px 0 6px;
      border: 1px solid var(--ft-border);
      border-radius: 999px;
      background: var(--ft-card);
      color: inherit;
      font: inherit;
      font-size: 14px;
      cursor: pointer;
    }
    .cat .cat-bubble {
      width: 32px;
      height: 32px;
      margin: 0;
      border-radius: 50%;
    }
    .cat .cat-bubble ion-icon {
      font-size: 16px;
    }
    .cat.on {
      border-color: var(--ion-color-primary);
      background: rgba(var(--ion-color-primary-rgb), 0.1);
      font-weight: 600;
    }

    .note {
      margin: 4px 0 8px;
    }
    .keypad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin: 8px 0 12px;
    }
    .key {
      appearance: none;
      height: 52px;
      border: 1px solid var(--ft-border);
      border-radius: 14px;
      background: var(--ft-card);
      color: inherit;
      font: inherit;
      font-size: 22px;
      font-weight: 500;
      cursor: pointer;
    }
    .key:active {
      background: rgba(var(--ion-color-primary-rgb), 0.1);
    }
    .key ion-icon {
      font-size: 22px;
      vertical-align: middle;
    }
    .save {
      height: 52px;
      font-size: 16px;
    }
    .more {
      display: block;
      margin: 8px auto 0;
    }
  `,
})
export class LogSheetComponent implements OnInit {
  private modalCtrl = inject(ModalController);
  private tx = inject(TransactionService);
  private passbook = inject(AllowanceService);
  private location = inject(LocationService);
  readonly settings = inject(SettingsService);
  private feedback = inject(FeedbackService);

  readonly keys = KEYS;
  readonly categories = categoriesFor('expense');

  readonly state = signal<WhereState>('locating');
  readonly reason = signal('');
  readonly fix = signal<Fix | null>(null);
  readonly suggestion = signal<PlaceSuggestion | null>(null);
  /** A place picked from "Somewhere else", or `null` for "No place" once chosen. */
  readonly picked = signal<PlaceCluster | null>(null);
  readonly choosing = signal(false);
  readonly customOpen = signal(false);
  readonly amountText = signal('');
  readonly categoryId = signal('food');
  readonly note = signal('');
  readonly noteOpen = signal(false);
  readonly saving = signal(false);
  private categoryTouched = false;

  readonly left = computed(() => this.passbook.ledger()?.left ?? null);
  readonly amount = computed(() => {
    const n = Number.parseFloat(this.amountText());
    return Number.isFinite(n) ? n : 0;
  });
  readonly symbol = computed(() => formatMoney(0, this.settings.settings().currency, true).replace(/[\d.,\s]/g, ''));

  readonly placeName = computed(() => {
    const p = this.matchedPlace();
    return p && p.name !== UNNAMED ? p.name : (this.suggestion()?.placeName ?? '');
  });
  readonly placeDetail = computed(() => {
    const p = this.matchedPlace();
    if (p) return `${p.visits} ${p.visits === 1 ? 'visit' : 'visits'} so far.`;
    const s = this.suggestion();
    return s ? `${s.visits} ${s.visits === 1 ? 'payment' : 'payments'} logged around here.` : '';
  });

  /** The place this payment is at: the one picked, or the known place nearest the phone. */
  readonly matchedPlace = computed<PlaceCluster | null>(() => {
    const p = this.picked();
    if (p) return p;
    const fix = this.fix();
    const st = this.state();
    if (!fix || (st !== 'known' && st !== 'new')) return null;
    return this.nearestPlace(fix);
  });

  /**
   * What you pay most often at this place: one tile per payment (note), at its most common
   * amount, most frequent first. Only payments at this place count, never its neighbours.
   */
  readonly usual = computed<Usual[]>(() => {
    const place = this.matchedPlace();
    if (!place) return [];
    type Group = Usual & { amounts: Map<number, { n: number; last: string }> };
    const groups = new Map<string, Group>();
    // A place's transactions are newest first, so the first one seen per note is its latest.
    for (const t of place.transactions) {
      if (t.type !== 'expense') continue;
      const label = t.note || categoryById(t.categoryId).name;
      let g = groups.get(label);
      if (!g) {
        g = { label, note: t.note, amount: t.amount, categoryId: t.categoryId, method: t.method, count: 0, last: t.date, amounts: new Map() };
        groups.set(label, g);
      }
      g.count++;
      const seen = g.amounts.get(t.amount);
      if (seen) seen.n++;
      else g.amounts.set(t.amount, { n: 1, last: t.date });
    }
    return [...groups.values()]
      .map(({ amounts, ...g }) => {
        const [amount] = [...amounts.entries()].sort((x, y) => y[1].n - x[1].n || y[1].last.localeCompare(x[1].last))[0];
        return { ...g, amount };
      })
      .sort((x, y) => y.count - x.count || y.last.localeCompare(x.last))
      .slice(0, 4);
  });

  readonly recentPlaces = computed(() =>
    [...this.tx.places()].sort((a, b) => b.lastVisit.localeCompare(a.lastVisit)).slice(0, 6),
  );

  async ngOnInit(): Promise<void> {
    const s = this.settings.settings();
    if (!s.autoLocation) {
      this.toNone('Auto-stamping is off in Settings.');
      return;
    }
    if (!s.onboarded && (await this.location.permission()) === 'prompt') {
      this.state.set('ask');
      return;
    }
    void this.locate();
  }

  async locate(): Promise<void> {
    this.state.set('locating');
    try {
      const fix = await this.location.quickFix(this.settings.settings().highAccuracy);
      this.fix.set(fix);
      const s = this.tx.suggestFor(fix, Math.max(60, this.settings.settings().placeRadius));
      this.suggestion.set(s);
      const place = this.nearestPlace(fix);
      const category = place?.topCategoryId ?? s?.categoryId;
      if (category && !this.categoryTouched) this.categoryId.set(category);
      this.state.set((place && place.name !== UNNAMED) || s?.placeName ? 'known' : 'new');
    } catch (err) {
      this.toNone(this.location.describeError(err));
    }
  }

  async allow(): Promise<void> {
    await this.settings.update({ onboarded: true, autoLocation: true });
    void this.locate();
  }

  /** Respect the answer: stop auto-stamping until it is turned back on in Settings. */
  async decline(): Promise<void> {
    await this.settings.update({ onboarded: true, autoLocation: false });
    this.toNone('Stamping is off. You can turn it on in Settings.');
  }

  pickPlace(p: PlaceCluster): void {
    this.picked.set(p);
    this.choosing.set(false);
    this.state.set('known');
    if (!this.categoryTouched) this.categoryId.set(p.topCategoryId);
    void this.feedback.selection();
  }

  pickCategory(id: string): void {
    this.categoryTouched = true;
    this.categoryId.set(id);
    void this.feedback.selection();
  }

  pickNoPlace(): void {
    this.picked.set(null);
    this.fix.set(null);
    this.choosing.set(false);
    this.toNone('Logged without a stamp.');
  }

  press(k: string): void {
    let s = this.amountText();
    if (k === 'del') s = s.slice(0, -1);
    else if (k === '.') {
      if (s.includes('.')) return;
      s = (s || '0') + '.';
    } else {
      if (s.includes('.') && s.split('.')[1].length >= 2) return;
      if (s.replace('.', '').length >= 8) return;
      s = s === '0' ? k : s + k;
    }
    this.amountText.set(s);
    void this.feedback.tap();
  }

  /** "₱775 left after" or "₱104 over after". */
  afterText(amount: number): string {
    const left = this.left();
    return left === null ? '' : `${describeBalance(left - amount, this.settings.settings().currency)} after`;
  }

  tileLabel(u: Usual): string {
    const currency = this.settings.settings().currency;
    const after = this.left() === null ? '' : `, ${this.afterText(u.amount)}`;
    return `Log ${u.label}, ${formatMoneyLedger(u.amount, currency)}${after}`;
  }

  quickLog(u: Usual): Promise<void> {
    return this.save(u.amount, u.categoryId, u.note, u.method);
  }

  saveCustom(): Promise<void> {
    const method = this.usual()[0]?.method ?? 'cash';
    return this.save(Math.round(this.amount() * 100) / 100, this.categoryId(), this.note().trim(), method);
  }

  close(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }

  details(): void {
    void this.modalCtrl.dismiss(null, 'details');
  }

  /** The known place within the grouping radius closest to a point. */
  private nearestPlace(at: LatLng): PlaceCluster | null {
    const radius = Math.max(60, this.settings.settings().placeRadius);
    let best: PlaceCluster | null = null;
    let bestDist = Infinity;
    for (const c of this.tx.places()) {
      const d = distanceMeters(at, c.center);
      if (d <= radius && d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  }

  private toNone(reason: string): void {
    this.reason.set(reason);
    this.state.set('none');
    this.customOpen.set(true);
  }

  private async save(amount: number, categoryId: string, note: string, method: PaymentMethod): Promise<void> {
    if (this.saving() || amount <= 0) return;
    this.saving.set(true);
    try {
      const location = this.buildStamp();
      const created = await this.tx.add({
        type: 'expense',
        amount,
        categoryId,
        note,
        method,
        date: new Date().toISOString(),
        location,
      });
      void this.feedback.success();
      if (location?.geocodeStatus === 'pending') void this.tx.resolvePendingAddresses();
      await this.modalCtrl.dismiss({ id: created.id }, 'logged');
    } finally {
      this.saving.set(false);
    }
  }

  /** The location stamp for this payment, honest about where it came from. */
  private buildStamp(): GeoTag | null {
    const now = new Date().toISOString();
    const p = this.picked();
    if (p) {
      return {
        lat: p.center.lat,
        lng: p.center.lng,
        accuracy: null,
        capturedAt: now,
        source: 'manual',
        placeName: p.name,
        address: p.address,
        customName: true,
        geocodeStatus: 'ok',
      };
    }
    const fix = this.fix();
    const st = this.state();
    if (!fix || (st !== 'known' && st !== 'new')) return null;
    const s = this.suggestion();
    const name = this.placeName();
    if (st === 'known' && name) {
      return {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        capturedAt: now,
        source: fix.source,
        placeName: name,
        address: this.matchedPlace()?.address ?? s?.address,
        customName: s?.customName ?? false,
        geocodeStatus: 'ok',
      };
    }
    return {
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      capturedAt: now,
      source: fix.source,
      geocodeStatus: this.settings.settings().addressLookup ? 'pending' : 'off',
    };
  }
}
