import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';

import { WEEKDAYS } from '../../core/allowance';
import { DEFAULT_CENTER, TILE_CREDIT } from '../../core/map-utils';
import type { Allowance, AllowanceCadence } from '../../core/models';
import { CURRENCIES } from '../../core/money.pipe';
import { DemoDataService } from '../../core/services/demo-data.service';
import { ExportService } from '../../core/services/export.service';
import { FeedbackService } from '../../core/services/feedback.service';
import { LocationService, PermissionInfo } from '../../core/services/location.service';
import { SettingsService } from '../../core/services/settings.service';
import { TransactionService } from '../../core/services/transaction.service';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonToggle,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonNote,
    IonIcon,
    IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="ft-toolbar">
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ft-page">
      <!-- Allowance: the money the passbook counts down from -->
      <ion-list [inset]="true">
        <ion-list-header><ion-label>Allowance</ion-label></ion-list-header>
        <ion-item>
          <ion-icon name="wallet" slot="start" color="primary" aria-hidden="true"></ion-icon>
          <ion-input
            label="Amount each time"
            type="number"
            inputmode="decimal"
            min="0"
            [value]="s().allowance?.amount ?? ''"
            [debounce]="600"
            (ionInput)="setAllowance({ amount: $event.detail.value })"
            helperText="What arrives each time your allowance comes"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-icon name="calendar" slot="start" color="primary" aria-hidden="true"></ion-icon>
          <ion-select
            label="Comes"
            interface="popover"
            [value]="s().allowance?.cadence ?? 'weekly'"
            (ionChange)="setAllowance({ cadence: $event.detail.value })"
          >
            <ion-select-option value="weekly">Every week</ion-select-option>
            <ion-select-option value="monthly">Every month</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-icon name="time" slot="start" color="primary" aria-hidden="true"></ion-icon>
          @if ((s().allowance?.cadence ?? 'weekly') === 'weekly') {
            <ion-select
              label="On"
              interface="popover"
              [value]="s().allowance?.weekday ?? 1"
              (ionChange)="setAllowance({ weekday: $event.detail.value })"
            >
              @for (d of weekdays; track d.day) {
                <ion-select-option [value]="d.day">{{ d.name }}</ion-select-option>
              }
            </ion-select>
          } @else {
            <ion-select
              label="On day"
              interface="popover"
              [value]="s().allowance?.monthDay ?? 1"
              (ionChange)="setAllowance({ monthDay: $event.detail.value })"
            >
              @for (n of monthDays; track n) {
                <ion-select-option [value]="n">{{ n }}</ion-select-option>
              }
            </ion-select>
          }
        </ion-item>
        <ion-item>
          <ion-icon name="cash" slot="start" color="primary" aria-hidden="true"></ion-icon>
          <ion-select
            label="Currency"
            interface="action-sheet"
            [value]="s().currency"
            (ionChange)="update({ currency: $event.detail.value })"
          >
            @for (c of currencies; track c.code) {
              <ion-select-option [value]="c.code">{{ c.label }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </ion-list>

      <!-- Location -->
      <ion-list [inset]="true">
        <ion-list-header><ion-label>Location stamping</ion-label></ion-list-header>
        <ion-item lines="full">
          <ion-icon name="information-circle" slot="start" color="medium" aria-hidden="true"></ion-icon>
          <ion-label class="explain">
            <p>
              Each payment can be stamped with where you made it, so Home, Map and Places can show where your money
              goes. Stamps stay on this phone. To name places, their coordinates are sent to OpenStreetMap (turn off
              "Look up place names" below to stop that).
            </p>
          </ion-label>
        </ion-item>
        <ion-item>
          <ion-icon name="location" slot="start" color="primary"></ion-icon>
          <ion-toggle [checked]="s().autoLocation" (ionChange)="update({ autoLocation: $event.detail.checked })">
            <ion-label>
              Auto-stamp location
              <p>Capture where you are every time you log a payment</p>
            </ion-label>
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-icon name="radio" slot="start" color="primary"></ion-icon>
          <ion-toggle [checked]="s().highAccuracy" (ionChange)="update({ highAccuracy: $event.detail.checked })">
            <ion-label>
              Precise GPS
              <p>More accurate (±5–20 m) but uses more battery</p>
            </ion-label>
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-icon name="globe" slot="start" color="primary"></ion-icon>
          <ion-toggle [checked]="s().addressLookup" (ionChange)="update({ addressLookup: $event.detail.checked })">
            <ion-label>
              Look up place names
              <p>Sends coordinates to OpenStreetMap to get street / store names</p>
            </ion-label>
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-icon name="storefront" slot="start" color="primary"></ion-icon>
          <ion-select
            label="Group places within"
            interface="popover"
            [value]="s().placeRadius"
            (ionChange)="update({ placeRadius: $event.detail.value })"
          >
            <ion-select-option [value]="40">40 m</ion-select-option>
            <ion-select-option [value]="80">80 m</ion-select-option>
            <ion-select-option [value]="150">150 m</ion-select-option>
            <ion-select-option [value]="300">300 m</ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item [button]="true" [detail]="false" (click)="checkPermission()">
          <ion-icon name="shield-checkmark" slot="start" [color]="permColor()"></ion-icon>
          <ion-label>
            Permission
            <p>{{ permText() }}</p>
          </ion-label>
          @if (checking()) {
            <ion-spinner slot="end" name="dots"></ion-spinner>
          } @else {
            <ion-note slot="end">Check</ion-note>
          }
        </ion-item>
        @if (tx.pendingGeocodeCount() > 0) {
          <ion-item [button]="true" [detail]="false" (click)="resolvePending()">
            <ion-icon name="cloud-offline-outline" slot="start" color="warning"></ion-icon>
            <ion-label>
              {{ tx.pendingGeocodeCount() }} address{{ tx.pendingGeocodeCount() === 1 ? '' : 'es' }} pending
              <p>Logged offline. Tap to look them up now.</p>
            </ion-label>
          </ion-item>
        }
      </ion-list>

      <!-- Data -->
      <ion-list [inset]="true">
        <ion-list-header><ion-label>Your data</ion-label></ion-list-header>
        <ion-item>
          <ion-icon name="document-text" slot="start" color="medium"></ion-icon>
          <ion-label>
            {{ tx.transactions().length }} transactions stored on this phone
            <p>{{ taggedCount() }} with location · {{ tx.places().length }} places</p>
          </ion-label>
        </ion-item>
        <ion-item [button]="true" (click)="exportCsv()" [disabled]="!tx.transactions().length">
          <ion-icon name="download" slot="start" color="primary"></ion-icon>
          <ion-label>
            Export as CSV
            <p>Spreadsheet with amounts, places and coordinates</p>
          </ion-label>
        </ion-item>
        <ion-item [button]="true" (click)="loadDemo()">
          <ion-icon name="flask" slot="start" color="secondary"></ion-icon>
          <ion-label>
            Load sample data
            <p>A realistic month of geotagged spending, for testing</p>
          </ion-label>
        </ion-item>
        <ion-item [button]="true" [detail]="false" (click)="clearAll()">
          <ion-icon name="trash" slot="start" color="danger"></ion-icon>
          <ion-label color="danger">Delete all data</ion-label>
        </ion-item>
      </ion-list>

      <div class="about">
        <strong>Finance<span>;</span> Tracker</strong> v1.0.0<br />
        Map data © OpenStreetMap contributors · {{ tileCredit }}<br />
        Place names by Nominatim (OpenStreetMap)<br />
        All data is stored locally on your device.
      </div>
    </ion-content>
  `,
  styles: `
    ion-list {
      border-radius: 18px;
    }
    ion-item p {
      font-size: 12.5px;
      color: var(--ft-muted);
      margin-top: 2px;
      white-space: normal;
    }
    .about {
      text-align: center;
      color: var(--ft-muted);
      font-size: 12px;
      line-height: 1.6;
      padding: 8px 24px 32px;
    }
    .about strong {
      color: var(--ion-text-color);
    }
    .about span {
      color: var(--ion-color-primary);
    }
  `,
})
export class SettingsPage {
  private settings = inject(SettingsService);
  readonly tx = inject(TransactionService);
  private location = inject(LocationService);
  private exporter = inject(ExportService);
  private demo = inject(DemoDataService);
  private feedback = inject(FeedbackService);
  private alertCtrl = inject(AlertController);
  private actionSheet = inject(ActionSheetController);

  readonly currencies = CURRENCIES;
  readonly weekdays = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, name: WEEKDAYS[day] }));
  readonly monthDays = Array.from({ length: 31 }, (_, i) => i + 1);
  readonly tileCredit = TILE_CREDIT;
  readonly s = this.settings.settings;
  readonly checking = signal(false);
  readonly perm = this.location.permissionState;
  readonly taggedCount = computed(() => this.tx.transactions().filter((t) => t.location).length);

  readonly permText = computed(() => {
    const texts: Record<PermissionInfo, string> = {
      granted: 'Precise location allowed',
      approximate: 'Approximate only — enable "Precise" in app permissions',
      prompt: 'Not asked yet — tap to allow',
      denied: 'Denied — enable in Android Settings › Apps › Finance; Tracker',
      disabled: 'Device location is turned off',
      unsupported: 'Not supported on this device',
    };
    return texts[this.perm()];
  });
  readonly permColor = computed(() =>
    this.perm() === 'granted' ? 'success' : this.perm() === 'approximate' || this.perm() === 'prompt' ? 'warning' : 'danger',
  );

  ionViewWillEnter() {
    void this.location.permission();
  }

  async update(patch: Parameters<SettingsService['update']>[0]) {
    await this.settings.update(patch);
    void this.feedback.selection();
  }

  /** Creates or edits the allowance; a schedule change resets the mid-period opening it no longer matches. */
  async setAllowance(patch: { amount?: string | number | null; cadence?: AllowanceCadence; weekday?: number; monthDay?: number }) {
    const cur = this.s().allowance;
    let amount = cur?.amount ?? 0;
    if (patch.amount !== undefined) {
      const n = Number.parseFloat(String(patch.amount ?? ''));
      if (!Number.isFinite(n) || n <= 0) return;
      amount = Math.round(n * 100) / 100;
    }
    if (amount <= 0) return;
    const scheduleChanged = patch.cadence !== undefined || patch.weekday !== undefined || patch.monthDay !== undefined;
    const next: Allowance = {
      amount,
      cadence: patch.cadence ?? cur?.cadence ?? 'weekly',
      weekday: patch.weekday ?? cur?.weekday ?? 1,
      monthDay: patch.monthDay ?? cur?.monthDay ?? 1,
      since: cur?.since ?? new Date().toISOString(),
      opening: scheduleChanged ? null : (cur?.opening ?? null),
      // Edited by hand, it is the student's own allowance now, not the sample's.
      sample: false,
    };
    await this.settings.update({ allowance: next });
    void this.feedback.selection();
  }

  async checkPermission() {
    this.checking.set(true);
    try {
      const state = await this.location.ensurePermission();
      if (state === 'granted') void this.feedback.success();
      else void this.feedback.warning();
    } finally {
      this.checking.set(false);
    }
  }

  async resolvePending() {
    const n = await this.tx.resolvePendingAddresses();
    void this.feedback.toast(n ? `Found ${n} address${n === 1 ? '' : 'es'}` : 'Still offline — try again later', {
      color: n ? 'success' : 'warning',
    });
  }

  async exportCsv() {
    try {
      await this.exporter.exportCsv();
    } catch (err) {
      // Share sheet dismissed by the user also throws; only report real failures.
      if (!String((err as Error)?.message ?? '').toLowerCase().includes('cancel')) {
        void this.feedback.toast('Export failed', { color: 'danger' });
      }
    }
  }

  async loadDemo() {
    const sheet = await this.actionSheet.create({
      header: 'Load sample data',
      subHeader: 'This replaces your current transactions.',
      buttons: [
        { text: 'Around my current location', icon: 'locate', data: 'here' },
        { text: 'Around Manila', icon: 'map', data: 'manila' },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    let base = DEFAULT_CENTER;
    if (data === 'here') {
      try {
        base = await this.location.quickFix(false);
      } catch (err) {
        void this.feedback.toast(`${this.location.describeError(err)} Using Manila instead.`, { color: 'warning' });
      }
    }
    await this.tx.replaceAll(this.demo.generate(base));
    if (!this.s().allowance) await this.settings.update({ allowance: this.demo.sampleAllowance() });
    void this.feedback.success();
    void this.feedback.toast('Sample data loaded', { icon: 'sparkles', color: 'success' });
  }

  async clearAll() {
    const alert = await this.alertCtrl.create({
      header: 'Delete everything?',
      message: 'All transactions and locations will be permanently removed from this phone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete all', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    await this.tx.replaceAll([]);
    void this.feedback.warning();
    void this.feedback.toast('All data deleted');
  }
}
