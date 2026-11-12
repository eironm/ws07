import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IonIcon, IonItem, IonLabel, NavController } from '@ionic/angular';

import { categoryById } from '../core/categories';
import { timeOf, friendlyDay } from '../core/date-utils';
import { Transaction } from '../core/models';
import { MoneyPipe } from '../core/money.pipe';

/** One row in a transaction list: category bubble, note, place, time, amount. */
@Component({
  selector: 'app-tx-item',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonItem, IonLabel, IonIcon, MoneyPipe],
  template: `
    <ion-item [button]="true" [detail]="false" lines="none" class="tx" (click)="open()">
      <div slot="start" class="cat-bubble" [style.--c]="cat().color">
        <ion-icon [name]="cat().icon" aria-hidden="true"></ion-icon>
      </div>
      <ion-label>
        <span class="tx-title">{{ tx().note || cat().name }}</span>
        <p class="meta">
          @if (tx().location; as loc) {
            <ion-icon name="location" class="loc on" aria-hidden="true"></ion-icon>
            <span class="place">{{ loc.placeName || (loc.geocodeStatus === 'pending' ? 'Place name pending…' : 'Unnamed place') }}</span>
          } @else {
            <ion-icon name="location-outline" class="loc off" aria-hidden="true"></ion-icon>
            <span class="place muted">No place</span>
          }
        </p>
      </ion-label>
      <div slot="end" class="end">
        <span class="amt" [class.income]="tx().type === 'income'">
          {{ tx().type === 'income' ? '+' : '−' }}{{ tx().amount | money }}
        </span>
        <span class="when">{{ when() }}</span>
      </div>
    </ion-item>
  `,
  styles: `
    .tx {
      --padding-start: 12px;
      --inner-padding-end: 12px;
      --background: transparent;
      --min-height: 64px;
    }
    .tx-title {
      display: block;
      font-weight: 500;
      font-size: 15px;
      margin: 0 0 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
    }
    /* The place is the point of the row: it gets the whole line and only truncates when it must. */
    .place {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .end {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
      margin-inline-start: 8px;
    }
    .when {
      font-size: 12px;
      color: var(--ft-muted);
      white-space: nowrap;
    }
    .loc {
      flex: none;
      font-size: 13px;
    }
    .loc.on {
      color: var(--ion-color-primary);
    }
    .loc.off,
    .muted {
      color: var(--ion-color-medium);
    }
    .amt {
      font-weight: 600;
      font-size: 15px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      color: var(--ion-text-color);
    }
    .amt.income {
      color: var(--ft-money-in);
    }
  `,
})
export class TxItemComponent {
  private nav = inject(NavController);

  readonly tx = input.required<Transaction>();
  readonly showDay = input(false);

  readonly cat = computed(() => categoryById(this.tx().categoryId));
  readonly time = computed(() => timeOf(this.tx().date));
  readonly day = computed(() => friendlyDay(this.tx().date));
  /** Lists grouped by day show the time; mixed lists show the time today and the day otherwise. */
  readonly when = computed(() => {
    if (!this.showDay()) return this.time();
    const day = this.day();
    return day === 'Today' ? this.time() : day;
  });

  open() {
    this.nav.navigateForward(['/transaction', this.tx().id]);
  }
}

