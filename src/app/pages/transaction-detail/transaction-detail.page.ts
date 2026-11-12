import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ImpactStyle } from '@capacitor/haptics';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
} from '@ionic/angular';

import { categoryById } from '../../core/categories';
import { openInMaps } from '../../core/external';
import { formatCoords } from '../../core/geo-utils';
import { PAYMENT_METHODS } from '../../core/models';
import { MoneyPipe } from '../../core/money.pipe';
import { FeedbackService } from '../../core/services/feedback.service';
import { TransactionService } from '../../core/services/transaction.service';
import { LocationPickerComponent, PickedLocation } from '../../shared/location-picker.component';
import { MiniMapComponent } from '../../shared/mini-map.component';
import { PlaceDetailComponent } from '../../shared/place-detail.component';

@Component({
  selector: 'app-transaction-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonButton, IonContent, IonIcon, MiniMapComponent, MoneyPipe],
  template: `
    <ion-header>
      <ion-toolbar class="ft-toolbar">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/tabs/history" text=""></ion-back-button>
        </ion-buttons>
        <ion-title>Details</ion-title>
        @if (tx()) {
          <ion-buttons slot="end">
            <ion-button (click)="edit()" aria-label="Edit">
              <ion-icon slot="icon-only" name="create-outline"></ion-icon>
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content class="ft-page">
      @if (tx(); as t) {
        <div class="hero">
          <div class="cat-bubble big" [style.--c]="cat().color"><ion-icon [name]="cat().icon"></ion-icon></div>
          <div class="amt" [class.income]="t.type === 'income'">{{ t.type === 'income' ? '+' : '−' }}{{ t.amount | money }}</div>
          <div class="note">{{ t.note || cat().name }}</div>
          <div class="chips">
            <span class="chip"><ion-icon [name]="cat().icon"></ion-icon>{{ cat().name }}</span>
            <span class="chip"><ion-icon [name]="method().icon"></ion-icon>{{ method().label }}</span>
          </div>
          <div class="when">{{ when() }}</div>
        </div>

        @if (t.location; as loc) {
          <div class="ft-card">
            <div class="ft-card-title">
              <span><ion-icon name="location"></ion-icon>Paid at</span>
              <span class="accuracy-badge" [class]="accClass()">{{ accText() }}</span>
            </div>
            <app-mini-map [lat]="loc.lat" [lng]="loc.lng" [accuracy]="loc.accuracy" [color]="cat().color" [height]="190"></app-mini-map>
            <div class="loc-text">
              <strong>{{ loc.placeName || 'Unnamed place' }}</strong>
              @if (loc.address) {
                <span>{{ loc.address }}</span>
              } @else if (loc.geocodeStatus === 'pending') {
                <span><ion-icon name="cloud-offline-outline"></ion-icon> Place name pending (filled in when you're back online)</span>
              }
              <span class="coords">{{ coords() }}</span>
            </div>
            <div class="actions">
              <ion-button size="small" fill="outline" (click)="maps()">
                <ion-icon slot="start" name="navigate"></ion-icon> Open in Maps
              </ion-button>
              <ion-button size="small" fill="outline" (click)="adjust()">
                <ion-icon slot="start" name="map"></ion-icon> Adjust
              </ion-button>
              <ion-button size="small" fill="clear" color="medium" (click)="removeLocation()">
                <ion-icon slot="start" name="close"></ion-icon> Remove
              </ion-button>
            </div>
          </div>

          @if (place(); as p) {
            @if (p.visits > 1) {
              <button class="ft-card place-insight" (click)="openPlace()">
                <ion-icon name="storefront"></ion-icon>
                <div>
                  <strong>{{ ordinal() }} payment at {{ p.name }}</strong>
                  <span>{{ p.visits }} visits · {{ p.totalSpent | money }} spent there in total</span>
                </div>
                <ion-icon name="chevron-forward" class="chev"></ion-icon>
              </button>
            }
          }
        } @else {
          <div class="ft-card no-loc">
            <ion-icon name="location-outline"></ion-icon>
            <div>
              <strong>No location recorded</strong>
              <span>Add where this payment happened to see it on the map.</span>
            </div>
            <ion-button size="small" (click)="adjust()">Add</ion-button>
          </div>
        }

        <div class="ft-card meta">
          <div><span>Logged</span><b>{{ created() }}</b></div>
          @if (t.location) {
            <div><span>Location stamped</span><b>{{ stamped() }}</b></div>
          }
          @if (t.updatedAt !== t.createdAt) {
            <div><span>Last edited</span><b>{{ updated() }}</b></div>
          }
        </div>

        <div class="danger-zone">
          <ion-button expand="block" fill="clear" color="danger" (click)="remove()">
            <ion-icon slot="start" name="trash-outline"></ion-icon> Delete transaction
          </ion-button>
        </div>
      } @else {
        <div class="ft-empty">
          <ion-icon name="receipt" class="big"></ion-icon>
          <h2>Transaction not found</h2>
          <p>It may have been deleted.</p>
        </div>
      }
    </ion-content>
  `,
  styles: `
    .hero {
      text-align: center;
      padding: 8px 20px 20px;
    }
    .cat-bubble.big {
      width: 60px;
      height: 60px;
      border-radius: 20px;
      margin: 0 auto 10px;
    }
    .cat-bubble.big ion-icon {
      font-size: 30px;
    }
    .amt {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .amt.income {
      color: var(--ion-color-success);
    }
    .note {
      font-size: 17px;
      font-weight: 600;
      margin-top: 2px;
    }
    .chips {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin: 10px 0 6px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12.5px;
      padding: 5px 10px;
      border-radius: 999px;
      background: var(--ft-card);
      border: 1px solid var(--ft-border);
    }
    .when {
      color: var(--ft-muted);
      font-size: 13.5px;
    }
    .loc-text {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .loc-text strong {
      font-size: 16px;
    }
    .loc-text span {
      color: var(--ft-muted);
      font-size: 13px;
    }
    .coords {
      font-family: monospace;
      font-size: 12px !important;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 10px;
    }
    .actions ion-button {
      margin: 0;
    }
    .place-insight,
    .no-loc {
      display: flex;
      align-items: center;
      gap: 12px;
      width: calc(100% - 32px);
      text-align: left;
      color: inherit;
      font-family: inherit;
    }
    .place-insight > ion-icon:first-child,
    .no-loc > ion-icon {
      font-size: 26px;
      color: var(--ion-color-primary);
      flex: none;
    }
    .place-insight div,
    .no-loc div {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .place-insight span,
    .no-loc span {
      font-size: 13px;
      color: var(--ft-muted);
    }
    .chev {
      color: var(--ft-muted);
    }
    .meta div {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 14px;
    }
    .meta span {
      color: var(--ft-muted);
    }
    .danger-zone {
      padding: 0 16px 24px;
    }
  `,
})
export class TransactionDetailPage implements OnInit {
  private route = inject(ActivatedRoute);
  private nav = inject(NavController);
  private alertCtrl = inject(AlertController);
  private modalCtrl = inject(ModalController);
  private txService = inject(TransactionService);
  private feedback = inject(FeedbackService);

  private readonly id = signal('');
  /** Reactive: updates automatically after edits / location adjustments. */
  readonly tx = computed(() => this.txService.transactions().find((t) => t.id === this.id()));
  readonly cat = computed(() => categoryById(this.tx()?.categoryId ?? 'other'));
  readonly method = computed(() => PAYMENT_METHODS.find((m) => m.id === this.tx()?.method) ?? PAYMENT_METHODS[0]);
  readonly when = computed(() => (this.tx() ? fullDate(this.tx()!.date) : ''));
  readonly created = computed(() => (this.tx() ? fullDate(this.tx()!.createdAt) : ''));
  readonly updated = computed(() => (this.tx() ? fullDate(this.tx()!.updatedAt) : ''));
  readonly stamped = computed(() => (this.tx()?.location ? fullDate(this.tx()!.location!.capturedAt) : ''));
  readonly coords = computed(() => (this.tx()?.location ? formatCoords(this.tx()!.location!) : ''));

  readonly accClass = computed(() => {
    const l = this.tx()?.location;
    if (!l) return 'accuracy-badge';
    const q = l.source === 'manual' || l.accuracy == null ? 'manual' : l.accuracy <= 25 ? 'good' : l.accuracy <= 100 ? 'ok' : 'poor';
    return `accuracy-badge ${q}`;
  });
  readonly accText = computed(() => {
    const l = this.tx()?.location;
    if (!l) return '';
    if (l.source === 'manual' || l.accuracy == null) return 'Set on map';
    return `±${l.accuracy} m · ${l.source === 'gps' ? 'GPS' : 'Network'}`;
  });

  /** The place cluster this payment belongs to. */
  readonly place = computed(() => this.txService.places().find((p) => p.transactions.some((t) => t.id === this.id())));
  readonly ordinal = computed(() => {
    const p = this.place();
    if (!p) return '';
    // p.transactions is newest-first
    const idx = p.transactions.length - p.transactions.findIndex((t) => t.id === this.id());
    return ordinalOf(idx);
  });

  ngOnInit() {
    this.id.set(this.route.snapshot.paramMap.get('id') ?? '');
  }

  edit() {
    this.nav.navigateForward(['/transaction', this.id(), 'edit']);
  }

  maps() {
    const loc = this.tx()?.location;
    if (loc) openInMaps(loc, loc.placeName ?? 'Payment');
  }

  async adjust() {
    const loc = this.tx()?.location ?? null;
    const modal = await this.modalCtrl.create({
      component: LocationPickerComponent,
      componentProps: {
        initial: loc ? { lat: loc.lat, lng: loc.lng } : null,
        initialName: loc?.placeName ?? '',
        initialCustom: !!loc?.customName,
      },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<PickedLocation>();
    if (role !== 'confirm' || !data) return;
    await this.txService.update(this.id(), {
      location: {
        lat: data.lat,
        lng: data.lng,
        accuracy: null,
        capturedAt: new Date().toISOString(),
        source: 'manual',
        placeName: data.placeName,
        address: data.address,
        customName: data.customName,
        geocodeStatus: data.geocodeStatus,
      },
    });
    void this.feedback.toast('Location updated', { icon: 'location', color: 'success' });
  }

  async removeLocation() {
    const alert = await this.alertCtrl.create({
      header: 'Remove location?',
      message: 'The payment stays, but it will no longer appear on the map or in Places.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Remove', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    await this.txService.update(this.id(), { location: null });
    void this.feedback.tap(ImpactStyle.Medium);
  }

  async openPlace() {
    const place = this.place();
    if (!place) return;
    const modal = await this.modalCtrl.create({
      component: PlaceDetailComponent,
      componentProps: { place },
      breakpoints: [0, 0.6, 1],
      initialBreakpoint: 0.6,
    });
    await modal.present();
  }

  async remove() {
    const alert = await this.alertCtrl.create({
      header: 'Delete transaction?',
      message: 'This cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Delete', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    await this.txService.remove(this.id());
    void this.feedback.tap(ImpactStyle.Heavy);
    void this.feedback.toast('Transaction deleted', { icon: 'trash' });
    this.nav.back();
  }
}

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ordinalOf(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

