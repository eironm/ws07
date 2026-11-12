import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ImpactStyle } from '@capacitor/haptics';
import {
  IonButton,
  IonChip,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItemDivider,
  IonItemGroup,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  NavController,
} from '@ionic/angular';

import { categoryById } from '../../core/categories';
import { dayKey, friendlyDay } from '../../core/date-utils';
import { Transaction } from '../../core/models';
import { MoneyPipe } from '../../core/money.pipe';
import { FeedbackService } from '../../core/services/feedback.service';
import { TransactionService } from '../../core/services/transaction.service';
import { TxItemComponent } from '../../shared/tx-item.component';

type TypeFilter = 'all' | 'expense' | 'income';

@Component({
  selector: 'app-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonItemGroup,
    IonItemDivider,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonIcon,
    IonFab,
    IonFabButton,
    IonChip,
    IonButton,
    MoneyPipe,
    TxItemComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar class="ft-toolbar">
        <ion-title>History</ion-title>
      </ion-toolbar>
      <ion-toolbar class="ft-toolbar">
        <ion-searchbar
          placeholder="Search note, category or place"
          [debounce]="250"
          (ionInput)="query.set($event.detail.value ?? '')"
          aria-label="Search transactions"
        ></ion-searchbar>
      </ion-toolbar>
      <ion-toolbar class="ft-toolbar">
        <ion-segment [value]="type()" (ionChange)="setType($event.detail.value)">
          <ion-segment-button value="all"><ion-label>All</ion-label></ion-segment-button>
          <ion-segment-button value="expense"><ion-label>Expenses</ion-label></ion-segment-button>
          <ion-segment-button value="income"><ion-label>Income</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ft-page">
      <div class="ft-chip-row filters">
        @if (category(); as cat) {
          <ion-chip color="primary" (click)="clearCategory()" [attr.aria-label]="'Showing ' + categoryName(cat) + ' only. Tap to show all categories.'">
            <ion-label>{{ categoryName(cat) }}</ion-label>
            <ion-icon name="close-circle" aria-hidden="true"></ion-icon>
          </ion-chip>
        }
        <ion-chip [outline]="!taggedOnly()" [color]="taggedOnly() ? 'primary' : 'medium'" (click)="taggedOnly.set(!taggedOnly())">
          <ion-icon name="location"></ion-icon>
          <ion-label>With location</ion-label>
        </ion-chip>
        <ion-chip [outline]="!untaggedOnly()" [color]="untaggedOnly() ? 'warning' : 'medium'" (click)="untaggedOnly.set(!untaggedOnly())">
          <ion-icon name="location-outline"></ion-icon>
          <ion-label>Missing location</ion-label>
        </ion-chip>
      </div>

      @if (filtered().length) {
        <p class="summary">
          {{ filtered().length }} transaction{{ filtered().length === 1 ? '' : 's' }} ·
          <span class="out">−{{ totals().out | money }}</span>
          @if (totals().in) {
            · <span class="in">+{{ totals().in | money }}</span>
          }
        </p>

        <ion-list class="list" lines="none">
          @for (group of groups(); track group.key) {
            <ion-item-group>
              <ion-item-divider sticky class="divider">
                <ion-label>{{ group.label }}</ion-label>
                <span slot="end" class="day-total">−{{ group.spent | money }}</span>
              </ion-item-divider>
              @for (t of group.items; track t.id) {
                <ion-item-sliding #slider>
                  <app-tx-item [tx]="t"></app-tx-item>
                  <ion-item-options side="end">
                    <ion-item-option color="primary" (click)="edit(t); slider.close()">
                      <ion-icon slot="icon-only" name="create" aria-label="Edit"></ion-icon>
                    </ion-item-option>
                    <ion-item-option color="danger" expandable (click)="remove(t)">
                      <ion-icon slot="icon-only" name="trash" aria-label="Delete"></ion-icon>
                    </ion-item-option>
                  </ion-item-options>
                </ion-item-sliding>
              }
            </ion-item-group>
          }
        </ion-list>
        <p class="hint ft-muted">Tip: swipe a transaction left to edit or delete it.</p>
      } @else if (tx.transactions().length) {
        <div class="ft-empty">
          <ion-icon name="search" class="big"></ion-icon>
          <h2>No matches</h2>
          <p>Try a different search or filter.</p>
        </div>
      } @else {
        <div class="ft-empty">
          <ion-icon name="receipt" class="big"></ion-icon>
          <h2>Nothing here yet</h2>
          <p>Your payments will show up here, each stamped with where it happened.</p>
          <ion-button (click)="add()">
            <ion-icon name="add" slot="start"></ion-icon>
            Add expense
          </ion-button>
        </div>
      }

      <div style="height: 80px"></div>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button (click)="add()" aria-label="Add transaction">
          <ion-icon name="add"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
  styles: `
    .filters {
      padding-top: 10px;
    }
    .summary {
      margin: 8px 20px 4px;
      font-size: 13px;
      color: var(--ft-muted);
    }
    .summary .in {
      color: var(--ion-color-success);
      font-weight: 600;
    }
    .summary .out {
      font-weight: 600;
      color: var(--ion-text-color);
    }
    .list {
      background: transparent;
      padding: 0 8px;
    }
    .divider {
      --background: var(--ft-page);
      --color: var(--ft-muted);
      font-size: 12.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border: none;
    }
    .day-total {
      font-size: 12.5px;
      font-weight: 700;
      margin-right: 12px;
      text-transform: none;
    }
    ion-item-sliding {
      border-radius: 16px;
      margin-bottom: 4px;
      background: var(--ft-card);
    }
    .hint {
      text-align: center;
      font-size: 12px;
    }
  `,
})
export class HistoryPage {
  readonly tx = inject(TransactionService);
  private feedback = inject(FeedbackService);
  private nav = inject(NavController);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly query = signal('');
  readonly type = signal<TypeFilter>('all');
  readonly taggedOnly = signal(false);
  readonly untaggedOnly = signal(false);
  /** Set when arriving from a category row on Home (`?cat=food`). */
  readonly category = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => this.category.set(params.get('cat')));
  }

  categoryName(id: string): string {
    return categoryById(id).name;
  }

  clearCategory(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { cat: null }, replaceUrl: true });
  }

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const type = this.type();
    const cat = this.category();
    return this.tx.transactions().filter((t) => {
      if (type !== 'all' && t.type !== type) return false;
      if (cat && t.categoryId !== cat) return false;
      if (this.taggedOnly() && !t.location) return false;
      if (this.untaggedOnly() && t.location) return false;
      if (!q) return true;
      const haystack = [t.note, categoryById(t.categoryId).name, t.location?.placeName, t.location?.address, String(t.amount)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  });

  readonly totals = computed(() => {
    let out = 0;
    let inc = 0;
    for (const t of this.filtered()) t.type === 'expense' ? (out += t.amount) : (inc += t.amount);
    return { out, in: inc };
  });

  /** Groups transactions by calendar day with a per-day spending total. */
  readonly groups = computed(() => {
    const map = new Map<string, { key: string; label: string; spent: number; items: Transaction[] }>();
    for (const t of this.filtered()) {
      const key = dayKey(t.date);
      let g = map.get(key);
      if (!g) {
        g = { key, label: friendlyDay(t.date), spent: 0, items: [] };
        map.set(key, g);
      }
      g.items.push(t);
      if (t.type === 'expense') g.spent += t.amount;
    }
    return [...map.values()];
  });

  setType(value: unknown) {
    this.type.set((value as TypeFilter) ?? 'all');
    void this.feedback.selection();
  }

  add() {
    const type = this.type() === 'income' ? 'income' : 'expense';
    this.nav.navigateForward(['/transaction/new'], { queryParams: { type } });
  }

  edit(t: Transaction) {
    this.nav.navigateForward(['/transaction', t.id, 'edit']);
  }

  /** Deletes immediately, but offers an Undo for a few seconds (no blocking confirm dialog). */
  async remove(t: Transaction) {
    const removed = await this.tx.remove(t.id);
    if (!removed) return;
    void this.feedback.tap(ImpactStyle.Medium);
    void this.feedback.toast(`Deleted "${removed.note || categoryById(removed.categoryId).name}"`, {
      icon: 'trash',
      duration: 4500,
      actionText: 'Undo',
      onAction: () => {
        void this.tx.restore(removed);
        void this.feedback.success();
      },
    });
  }
}

