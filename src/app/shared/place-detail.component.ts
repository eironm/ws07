import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';

import { categoryById } from '../core/categories';
import { relativeTime, startOfMonth } from '../core/date-utils';
import { openInMaps } from '../core/external';
import { PlaceCluster } from '../core/geo-utils';
import { MoneyPipe } from '../core/money.pipe';
import { FeedbackService } from '../core/services/feedback.service';
import { TransactionService } from '../core/services/transaction.service';
import { MiniMapComponent } from './mini-map.component';
import { TxItemComponent } from './tx-item.component';

/** Bottom-sheet with everything you've spent at one place. */
@Component({
  selector: 'app-place-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonIcon, MiniMapComponent, TxItemComponent, MoneyPipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ name() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="rename()" aria-label="Rename place"><ion-icon slot="icon-only" name="pencil"></ion-icon></ion-button>
          <ion-button (click)="close()" aria-label="Close"><ion-icon slot="icon-only" name="close"></ion-icon></ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ft-page">
      <div class="wrap">
        <app-mini-map [lat]="place.center.lat" [lng]="place.center.lng" [color]="color()" [height]="170" [zoom]="17"></app-mini-map>
        @if (place.address) {
          <p class="addr"><ion-icon name="location"></ion-icon> {{ place.address }}</p>
        }
        <!-- This month first, so the sheet matches the Home row it was opened from. -->
        <div class="stats">
          <div>
            <span>This month</span><b>{{ month().spent | money: true }}</b>
            <small>{{ month().visits }} {{ month().visits === 1 ? 'visit' : 'visits' }}</small>
          </div>
          <div>
            <span>All time</span><b>{{ place.totalSpent | money: true }}</b>
            <small>{{ place.visits }} {{ place.visits === 1 ? 'visit' : 'visits' }}</small>
          </div>
          <div><span>Average per visit</span><b>{{ avg() | money: true }}</b></div>
          <div><span>Last visit</span><b>{{ last() }}</b></div>
        </div>
        @if (place.totalIncome) {
          <p class="ft-muted income-note">Also received {{ place.totalIncome | money }} here.</p>
        }
        <ion-button expand="block" fill="outline" (click)="maps()">
          <ion-icon name="navigate" slot="start"></ion-icon> Open in Maps
        </ion-button>
      </div>
      <div class="ft-section-label">Payments here</div>
      <div class="ft-card list">
        @for (t of place.transactions; track t.id) {
          <app-tx-item [tx]="t" [showDay]="true" (click)="close()"></app-tx-item>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .wrap {
      padding: 16px;
    }
    .addr {
      font-size: 13px;
      color: var(--ft-muted);
      margin: 10px 2px;
    }
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin: 12px 0;
    }
    .stats div {
      background: var(--ft-card);
      border: 1px solid var(--ft-border);
      border-radius: 14px;
      padding: 10px 12px;
    }
    .stats span {
      display: block;
      font-size: 12px;
      color: var(--ft-muted);
    }
    .stats b {
      font-size: 17px;
      font-variant-numeric: tabular-nums;
    }
    .stats small {
      display: block;
      margin-top: 2px;
      font-size: 12px;
      color: var(--ft-muted);
    }
    .income-note {
      font-size: 13px;
    }
    .list {
      padding: 4px;
    }
  `,
})
export class PlaceDetailComponent {
  @Input({ required: true }) place!: PlaceCluster;

  private modalCtrl = inject(ModalController);
  private alertCtrl = inject(AlertController);
  private txService = inject(TransactionService);
  private feedback = inject(FeedbackService);

  private renamed = signal<string | null>(null);
  readonly name = computed(() => this.renamed() ?? this.place.name);
  readonly color = computed(() => categoryById(this.place.topCategoryId).color);
  readonly avg = computed(() => (this.place.visits ? this.place.totalSpent / this.place.visits : 0));
  readonly last = computed(() => relativeTime(this.place.lastVisit));
  readonly month = computed(() => {
    const from = startOfMonth(this.txService.now()).toISOString();
    let spent = 0;
    let visits = 0;
    for (const t of this.place.transactions) {
      if (t.date < from) continue;
      visits++;
      if (t.type === 'expense') spent += t.amount;
    }
    return { spent, visits };
  });

  async rename() {
    const alert = await this.alertCtrl.create({
      header: 'Rename place',
      message: `Applies to all ${this.place.visits} payments here.`,
      inputs: [{ name: 'name', type: 'text', value: this.name(), attributes: { maxlength: 40 } }],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: async (v: { name: string }) => {
            const n = v.name?.trim();
            if (!n) return;
            await this.txService.renamePlace(
              this.place.transactions.map((t) => t.id),
              n,
            );
            this.renamed.set(n);
            void this.feedback.success();
          },
        },
      ],
    });
    await alert.present();
  }

  maps() {
    openInMaps(this.place.center, this.name());
  }

  close() {
    void this.modalCtrl.dismiss();
  }
}

