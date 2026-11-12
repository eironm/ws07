import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { RefresherCustomEvent, ScrollCustomEvent } from '@ionic/angular';
import {
  AlertController,
  IonButton,
  IonContent,
  IonFab,
  IonHeader,
  IonIcon,
  IonInput,
  IonLabel,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
} from '@ionic/angular';

import { WEEKDAYS, nextAllowanceLabel, periodStart } from '../../core/allowance';
import { categoryById } from '../../core/categories';
import { dayKey, friendlyDay, isSameDay, timeOf } from '../../core/date-utils';
import { DEFAULT_CENTER } from '../../core/map-utils';
import type { Allowance, AllowanceCadence, Transaction } from '../../core/models';
import { MoneyPipe, describeBalance, formatMoneyLedger } from '../../core/money.pipe';
import { AllowanceService } from '../../core/services/allowance.service';
import type { LedgerLine, PaceState } from '../../core/services/allowance.service';
import { DemoDataService } from '../../core/services/demo-data.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { LocationService } from '../../core/services/location.service';
import { SettingsService } from '../../core/services/settings.service';
import { TransactionService } from '../../core/services/transaction.service';
import { TxItemComponent } from '../../shared/tx-item.component';

const SAMPLE_PREFIX = 'demo-';
/** Monday first, the way a student's week reads. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface PassbookLine {
  id: string;
  tx: Transaction;
  title: string;
  where: string;
  time: string;
  pin: number | null;
  income: boolean;
  balanceAfter: number;
  state: PaceState;
  aria: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonButton,
    IonFab,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
    IonInput,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonSelect,
    IonSelectOption,
    MoneyPipe,
    TxItemComponent,
  ],
})
export class HomePage {
  readonly tx = inject(TransactionService);
  readonly settings = inject(SettingsService);
  private passbook = inject(AllowanceService);
  private location = inject(LocationService);
  private feedback = inject(FeedbackService);
  private nav = inject(NavController);
  private demo = inject(DemoDataService);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);

  readonly allowance = this.passbook.allowance;
  readonly ledger = this.passbook.ledger;
  readonly previous = this.passbook.previous;

  readonly loadingSample = signal(false);
  /** The line just logged from the sheet, for its slide-in. */
  readonly justLogged = signal<string | null>(null);

  /** The add button: labeled at the top, away while scrolling down, a circle on the way back up. */
  readonly fabState = signal<'extended' | 'compact' | 'hidden'>('extended');
  private lastScrollY = 0;

  /** Sample transactions are generated with a recognizable id prefix. */
  readonly sampleCount = computed(() => this.tx.transactions().filter((t) => t.id.startsWith(SAMPLE_PREFIX)).length);
  readonly recent = computed(() => this.tx.transactions().slice(0, 5));

  // ---------------------------------------------------------------- setup form

  readonly weekdays = WEEK_ORDER.map((d) => ({ day: d, name: WEEKDAYS[d], short: WEEKDAYS[d].slice(0, 3) }));
  readonly monthDays = Array.from({ length: 31 }, (_, i) => i + 1);
  readonly setupAmount = signal('');
  readonly setupCadence = signal<AllowanceCadence>('weekly');
  readonly setupWeekday = signal(1);
  readonly setupMonthDay = signal(1);
  readonly setupLeft = signal('');
  readonly setupValid = computed(() => {
    const amount = Number.parseFloat(this.setupAmount());
    const left = this.setupLeft().trim() === '' ? amount : Number.parseFloat(this.setupLeft());
    return Number.isFinite(amount) && amount > 0 && Number.isFinite(left) && left >= 0;
  });

  // ---------------------------------------------------------------- passbook

  readonly balanceLabel = computed(() => {
    const a = this.allowance();
    const l = this.ledger();
    if (!a || !l) return '';
    const next = nextAllowanceLabel(a, l.period.next);
    return a.cadence === 'weekly' ? `Left until ${next}'s allowance` : `Left until your ${next} allowance`;
  });

  readonly nextDate = computed(() => this.longDate(this.ledger()?.period.next));
  readonly startDate = computed(() => this.longDate(this.ledger()?.period.start));

  /** "62% spent · 46% of the week gone": what "on pace" and "ahead of pace" mean, in numbers. */
  readonly paceDetail = computed(() => {
    const a = this.allowance();
    const l = this.ledger();
    if (!a || !l) return '';
    const unit = a.cadence === 'weekly' ? 'week' : 'month';
    return `${Math.round(l.ratio * 100)}% spent · ${Math.round(l.period.elapsed * 100)}% of the ${unit} gone`;
  });

  readonly previousText = computed(() => {
    const a = this.allowance();
    const p = this.previous();
    if (!a || !p) return null;
    const unit = a.cadence === 'weekly' ? 'week' : 'month';
    const money = formatMoneyLedger(Math.abs(p.left), this.settings.settings().currency);
    return p.left >= 0 ? `Last ${unit} ended with ${money} left.` : `Last ${unit} went ${money} over.`;
  });

  /** Newest day first, newest line first within a day; balances were accumulated oldest first. */
  readonly days = computed(() => {
    const l = this.ledger();
    if (!l) return [];
    const pins = this.passbook.placeRanks().byTx;
    const groups: { key: string; label: string; spent: number; lines: PassbookLine[] }[] = [];
    for (let i = l.lines.length - 1; i >= 0; i--) {
      const line = l.lines[i];
      const key = dayKey(line.tx.date);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: this.dayLabel(line.tx.date), spent: 0, lines: [] };
        groups.push(group);
      }
      if (line.tx.type === 'expense') group.spent += line.tx.amount;
      group.lines.push(this.toLine(line, pins.get(line.tx.id) ?? null));
    }
    return groups;
  });

  /**
   * Column widths that fit the longest amount and balance in this passbook, so the
   * columns line up from row to row in any currency and at any size.
   */
  readonly columnVars = computed(() => {
    const l = this.ledger();
    if (!l) return {};
    const currency = this.settings.settings().currency;
    const amounts = [l.opening, ...l.lines.map((x) => x.tx.amount), this.allowance()?.amount ?? 0];
    const balances = [l.opening, ...l.lines.map((x) => x.balanceAfter)];
    const width = (values: number[], sign: number) =>
      Math.max(...values.map((v) => formatMoneyLedger(Math.abs(v), currency).length)) + sign;
    return { '--amt-ch': String(width(amounts, 1)), '--left-ch': String(width(balances, 1)) };
  });

  ionViewWillEnter(): void {
    this.tx.now.set(new Date());
  }

  onScroll(ev: ScrollCustomEvent): void {
    const y = ev.detail.scrollTop;
    const dy = y - this.lastScrollY;
    if (y < 24) this.fabState.set('extended');
    else if (dy > 6) this.fabState.set('hidden');
    else if (dy < -6) this.fabState.set('compact');
    this.lastScrollY = y;
  }

  plural(n: number, one: string, many: string): string {
    return n === 1 ? one : many;
  }

  async refresh(ev: RefresherCustomEvent): Promise<void> {
    this.tx.now.set(new Date());
    await this.tx.resolvePendingAddresses();
    await ev.target.complete();
  }

  async retryPending(): Promise<void> {
    const n = await this.tx.resolvePendingAddresses();
    void this.feedback.toast(
      n ? `Found ${n} place ${this.plural(n, 'name', 'names')}` : 'Still offline. Try again when you have a connection.',
      { color: n ? 'success' : 'warning' },
    );
  }

  open(t: Transaction): void {
    this.nav.navigateForward(['/transaction', t.id]);
  }

  go(path: string): void {
    this.nav.navigateRoot(path);
  }

  addMoney(): void {
    void this.feedback.tap();
    this.nav.navigateForward(['/transaction/new'], { queryParams: { type: 'income' } });
  }

  /** The log sheet: one tap at a known place, a keypad anywhere else. */
  async logPayment(): Promise<void> {
    void this.feedback.tap();
    const { LogSheetComponent } = await import('../../shared/log-sheet.component');
    const modal = await this.modalCtrl.create({
      component: LogSheetComponent,
      breakpoints: [0, 0.92],
      initialBreakpoint: 0.92,
      handle: true,
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<{ id: string }>();
    if (role === 'details') {
      this.nav.navigateForward(['/transaction/new']);
      return;
    }
    if (role !== 'logged' || !data) return;
    const logged = this.tx.getById(data.id);
    if (!logged) return;
    this.justLogged.set(logged.id);
    setTimeout(() => this.justLogged.set(null), 2600);
    const currency = this.settings.settings().currency;
    const left = this.ledger()?.left;
    const where = logged.location?.placeName ? ` at ${logged.location.placeName}` : '';
    const tail = left === undefined ? '' : ` · ${describeBalance(left, currency)}`;
    void this.feedback.toast(`${formatMoneyLedger(logged.amount, currency)}${where}${tail}`, {
      actionText: 'Undo',
      duration: 5000,
      onAction: () => void this.undo(logged),
    });
  }

  private async undo(t: Transaction): Promise<void> {
    await this.tx.remove(t.id);
    void this.feedback.toast('Payment removed');
  }

  // ---------------------------------------------------------------- setup

  setCadence(value: unknown): void {
    this.setupCadence.set(value === 'monthly' ? 'monthly' : 'weekly');
  }

  async saveAllowance(): Promise<void> {
    if (!this.setupValid()) return;
    const amount = Math.round(Number.parseFloat(this.setupAmount()) * 100) / 100;
    const leftText = this.setupLeft().trim();
    const left = leftText === '' ? amount : Math.round(Number.parseFloat(leftText) * 100) / 100;
    const draft: Allowance = {
      amount,
      cadence: this.setupCadence(),
      weekday: this.setupWeekday(),
      monthDay: this.setupMonthDay(),
      since: new Date().toISOString(),
      opening: null,
    };
    draft.opening = { periodStart: periodStart(draft, new Date()).toISOString(), left };
    await this.settings.update({ allowance: draft });
    void this.feedback.success();
  }

  async loadDemo(): Promise<void> {
    if (this.loadingSample()) return;
    this.loadingSample.set(true);
    let base = DEFAULT_CENTER;
    let aroundYou = false;
    try {
      base = await this.location.quickFix(false);
      aroundYou = true;
    } catch {
      /* fall back to Manila */
    }
    try {
      await this.tx.replaceAll(this.demo.generate(base));
      if (!this.allowance()) await this.settings.update({ allowance: this.demo.sampleAllowance() });
      void this.feedback.success();
      void this.feedback.toast(aroundYou ? 'Sample data loaded around your location' : 'Sample data loaded around Manila', {
        icon: 'flask',
      });
    } finally {
      this.loadingSample.set(false);
    }
  }

  async clearSample(): Promise<void> {
    const n = this.sampleCount();
    const sampleAllowance = this.allowance()?.sample === true;
    const alert = await this.alertCtrl.create({
      header: 'Clear sample data?',
      message: `This removes the ${n} sample ${this.plural(n, 'payment', 'payments')}${
        sampleAllowance ? ' and the sample allowance' : ''
      }. Payments you logged yourself stay.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Clear sample data', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    await this.tx.replaceAll(this.tx.transactions().filter((t) => !t.id.startsWith(SAMPLE_PREFIX)));
    if (sampleAllowance) await this.settings.update({ allowance: null });
    void this.feedback.toast('Sample data cleared');
  }

  // ---------------------------------------------------------------- helpers

  private longDate(d: Date | undefined): string {
    return d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  }

  private dayLabel(iso: string): string {
    const d = new Date(iso);
    return isSameDay(d, new Date()) ? `Today · ${this.longDate(d)}` : friendlyDay(iso);
  }

  private toLine(line: LedgerLine, pin: number | null): PassbookLine {
    const t = line.tx;
    const cat = categoryById(t.categoryId);
    const income = t.type === 'income';
    const loc = t.location;
    const where = income
      ? cat.name
      : loc
        ? loc.placeName || (loc.geocodeStatus === 'pending' ? 'Place name pending…' : 'Unnamed place')
        : 'No place';
    const title = t.note || cat.name;
    const time = timeOf(t.date);
    const currency = this.settings.settings().currency;
    const amount = `${income ? 'plus' : 'minus'} ${formatMoneyLedger(t.amount, currency)}`;
    const pace = line.state === 'over' ? ', over the allowance' : line.state === 'fast' ? ', ahead of pace' : '';
    return {
      id: t.id,
      tx: t,
      title,
      where,
      time,
      pin: income ? null : pin,
      income,
      balanceAfter: line.balanceAfter,
      state: line.state,
      aria: `${title}, ${where}, ${time}, ${amount}, ${describeBalance(line.balanceAfter, currency)}${pace}`,
    };
  }
}
