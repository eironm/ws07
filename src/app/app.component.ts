import { Component, OnInit, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  alertCircle,
  analytics,
  backspaceOutline,
  bagHandle,
  book,
  briefcase,
  bus,
  businessOutline,
  calendar,
  cardOutline,
  cart,
  cash,
  cashOutline,
  checkmark,
  checkmarkCircle,
  chevronBack,
  chevronForward,
  close,
  closeCircle,
  cloudOfflineOutline,
  compass,
  create,
  createOutline,
  documentText,
  download,
  ellipsisHorizontal,
  expand,
  eyeOff,
  fastFood,
  flask,
  footsteps,
  gameController,
  gift,
  globe,
  home,
  informationCircle,
  layers,
  locate,
  location,
  locationOutline,
  map,
  medkit,
  navigate,
  navigateCircle,
  pencil,
  phonePortraitOutline,
  pieChart,
  pin,
  receipt,
  refresh,
  school,
  search,
  settings,
  shieldCheckmark,
  sparkles,
  storefront,
  swapVertical,
  time,
  trash,
  trashOutline,
  trendingDown,
  trendingUp,
  wallet,
  warning,
  resize,
  speedometer,
  radio,
} from 'ionicons/icons';

import { SettingsService } from './core/services/settings.service';
import { TransactionService } from './core/services/transaction.service';


@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  private settings = inject(SettingsService);
  private transactions = inject(TransactionService);

  constructor() {
    // Every icon used anywhere in the app, registered once globally.
    addIcons({
      add,
      alertCircle,
      analytics,
      backspaceOutline,
      bagHandle,
      book,
      briefcase,
      bus,
      businessOutline,
      calendar,
      cardOutline,
      cart,
      cash,
      cashOutline,
      checkmark,
      checkmarkCircle,
      chevronBack,
      chevronForward,
      close,
      closeCircle,
      cloudOfflineOutline,
      compass,
      create,
      createOutline,
      documentText,
      download,
      ellipsisHorizontal,
      expand,
      eyeOff,
      fastFood,
      flask,
      footsteps,
      gameController,
      gift,
      globe,
      home,
      informationCircle,
      layers,
      locate,
      location,
      locationOutline,
      map,
      medkit,
      navigate,
      navigateCircle,
      pencil,
      phonePortraitOutline,
      pieChart,
      pin,
      receipt,
      refresh,
      school,
      search,
      settings,
      shieldCheckmark,
      sparkles,
      storefront,
      swapVertical,
      time,
      trash,
      trashOutline,
      trendingDown,
      trendingUp,
      wallet,
      warning,
      resize,
      speedometer,
      radio,
    });
  }

  async ngOnInit() {
    await this.settings.load();
    await this.transactions.load();
    void this.transactions.resolvePendingAddresses();

    // Fill in addresses for payments logged offline once we're back online.
    window.addEventListener('online', () => void this.transactions.resolvePendingAddresses());

    // When the app comes back to the foreground: refresh "today/this month" and pending addresses.
    void App.addListener('resume', () => {
      this.transactions.now.set(new Date());
      void this.transactions.resolvePendingAddresses();
    });
  }
}
