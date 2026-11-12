import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
} from '@ionic/angular';

import { categoryById } from '../../core/categories';
import { relativeTime } from '../../core/date-utils';
import { PlaceCluster, distanceMeters, formatDistance } from '../../core/geo-utils';
import { MoneyPipe } from '../../core/money.pipe';
import { FeedbackService } from '../../core/services/feedback.service';
import { LocationService } from '../../core/services/location.service';
import { SettingsService } from '../../core/services/settings.service';
import { TransactionService } from '../../core/services/transaction.service';
import { PlaceDetailComponent } from '../../shared/place-detail.component';

type SortBy = 'spent' | 'visits' | 'recent' | 'near';

@Component({
  selector: 'app-places',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel, IonIcon, IonButton, MoneyPipe],
  template: `
    <ion-header>
      <ion-toolbar class="ft-toolbar">
        <ion-title>Places</ion-title>
      </ion-toolbar>
      <ion-toolbar class="ft-toolbar">
        <ion-segment [value]="sortBy()" (ionChange)="setSort($event.detail.value)" [scrollable]="true">
          <ion-segment-button value="spent"><ion-label>Top spend</ion-label></ion-segment-button>
          <ion-segment-button value="visits"><ion-label>Most visits</ion-label></ion-segment-button>
          <ion-segment-button value="recent"><ion-label>Recent</ion-label></ion-segment-button>
          <ion-segment-button value="near"><ion-label>Nearest</ion-label></ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ft-page">
      @if (places().length) {
        <div class="intro">
          <p>
            You've paid at <b>{{ places().length }}</b> place{{ places().length === 1 ? '' : 's' }}. Payments within
            {{ settings.settings().placeRadius }} m of each other count as the same place.
          </p>
          @if (untagged() > 0) {
            <p class="ft-muted small">{{ untagged() }} payment{{ untagged() === 1 ? ' has' : 's have' }} no location and {{ untagged() === 1 ? 'is' : 'are' }} not included.</p>
          }
        </div>

        @for (p of sorted(); track p.id; let i = $index) {
          <button class="ft-card place" (click)="open(p)">
            <div class="rank">{{ i + 1 }}</div>
            <div class="cat-bubble" [style.--c]="color(p)"><ion-icon [name]="icon(p)"></ion-icon></div>
            <div class="info">
              <strong>{{ p.name }}</strong>
              <span class="sub">
                {{ p.visits }} visit{{ p.visits === 1 ? '' : 's' }} · {{ last(p) }}
                @if (distanceTo(p); as d) {
                  · {{ d }} away
                }
              </span>
              <div class="bar"><div [style.width.%]="share(p)" [style.background]="color(p)"></div></div>
            </div>
            <div class="amt">{{ p.totalSpent | money: true }}</div>
          </button>
        }
      } @else {
        <div class="ft-empty">
          <ion-icon name="storefront" class="big"></ion-icon>
          <h2>No places yet</h2>
          <p>Every geotagged payment is grouped into places — your canteen, the jeep terminal, the mall — so you can see which spots drain your wallet.</p>
          <ion-button (click)="add()">
            <ion-icon name="add" slot="start"></ion-icon>
            Log a payment
          </ion-button>
        </div>
      }
      <div style="height: 16px"></div>
    </ion-content>
  `,
  styles: `
    .intro {
      padding: 4px 20px 10px;
      font-size: 14px;
      line-height: 1.45;
    }
    .intro p {
      margin: 6px 0;
    }
    .small {
      font-size: 12.5px;
    }
    .place {
      display: flex;
      align-items: center;
      gap: 4px;
      width: calc(100% - 32px);
      text-align: left;
      color: inherit;
      font-family: inherit;
      padding: 12px 14px;
      margin-bottom: 10px;
    }
    .rank {
      width: 22px;
      font-weight: 800;
      color: var(--ft-muted);
      font-size: 14px;
      flex: none;
    }
    .info {
      flex: 1;
      min-width: 0;
    }
    .info strong {
      display: block;
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sub {
      font-size: 12px;
      color: var(--ft-muted);
    }
    .bar {
      height: 5px;
      border-radius: 999px;
      background: var(--ft-border);
      margin-top: 6px;
    }
    .bar div {
      height: 100%;
      border-radius: 999px;
    }
    .amt {
      font-weight: 800;
      font-size: 15px;
      margin-left: 8px;
      white-space: nowrap;
    }
  `,
})
export class PlacesPage {
  private txService = inject(TransactionService);
  readonly settings = inject(SettingsService);
  private location = inject(LocationService);
  private modalCtrl = inject(ModalController);
  private nav = inject(NavController);
  private feedback = inject(FeedbackService);

  readonly sortBy = signal<SortBy>('spent');
  readonly places = this.txService.places;
  readonly untagged = computed(() => this.txService.transactions().filter((t) => !t.location).length);
  private readonly maxSpent = computed(() => Math.max(...this.places().map((p) => p.totalSpent), 1));

  readonly sorted = computed(() => {
    const list = [...this.places()];
    const me = this.location.lastFix();
    switch (this.sortBy()) {
      case 'visits':
        return list.sort((a, b) => b.visits - a.visits || b.totalSpent - a.totalSpent);
      case 'recent':
        return list.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
      case 'near':
        return me ? list.sort((a, b) => distanceMeters(me, a.center) - distanceMeters(me, b.center)) : list;
      default:
        return list.sort((a, b) => b.totalSpent - a.totalSpent);
    }
  });

  async setSort(value: unknown) {
    const sort = (value as SortBy) ?? 'spent';
    this.sortBy.set(sort);
    void this.feedback.selection();
    if (sort === 'near') {
      try {
        await this.location.quickFix(this.settings.settings().highAccuracy);
      } catch (err) {
        void this.feedback.toast(this.location.describeError(err), { color: 'warning' });
      }
    }
  }

  color(p: PlaceCluster) {
    return categoryById(p.topCategoryId).color;
  }
  icon(p: PlaceCluster) {
    return categoryById(p.topCategoryId).icon;
  }
  share(p: PlaceCluster) {
    return (p.totalSpent / this.maxSpent()) * 100;
  }
  last(p: PlaceCluster) {
    return relativeTime(p.lastVisit);
  }
  distanceTo(p: PlaceCluster): string | null {
    const me = this.location.lastFix();
    return me ? formatDistance(distanceMeters(me, p.center)) : null;
  }

  async open(place: PlaceCluster) {
    void this.feedback.tap();
    const modal = await this.modalCtrl.create({
      component: PlaceDetailComponent,
      componentProps: { place },
      breakpoints: [0, 0.6, 1],
      initialBreakpoint: 0.6,
    });
    await modal.present();
  }

  add() {
    this.nav.navigateForward(['/transaction/new']);
  }
}

