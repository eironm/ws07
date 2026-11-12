import { Injectable, inject } from '@angular/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ToastController } from '@ionic/angular';

/**
 * Central place for user feedback: haptic vibration patterns + toasts,
 * so every action in the app "feels" consistent.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private toastCtrl = inject(ToastController);

  async success() {
    await this.safe(() => Haptics.notification({ type: NotificationType.Success }));
  }

  async warning() {
    await this.safe(() => Haptics.notification({ type: NotificationType.Warning }));
  }

  async error() {
    await this.safe(() => Haptics.notification({ type: NotificationType.Error }));
  }

  async tap(style: ImpactStyle = ImpactStyle.Light) {
    await this.safe(() => Haptics.impact({ style }));
  }

  async selection() {
    await this.safe(() => Haptics.selectionStart().then(() => Haptics.selectionChanged()).then(() => Haptics.selectionEnd()));
  }

  async toast(
    message: string,
    opts: { color?: string; icon?: string; duration?: number; actionText?: string; onAction?: () => void } = {},
  ) {
    const existing = await this.toastCtrl.getTop();
    if (existing) await existing.dismiss();
    const toast = await this.toastCtrl.create({
      message,
      color: opts.color ?? 'dark',
      icon: opts.icon,
      duration: opts.duration ?? 2500,
      position: 'bottom',
      // Float above the tab bar when it is visible.
      positionAnchor: document.getElementById('app-tab-bar')?.offsetParent ? 'app-tab-bar' : undefined,
      swipeGesture: 'vertical',
      buttons: opts.actionText ? [{ text: opts.actionText, role: 'action', handler: () => opts.onAction?.() }] : [],
    });
    await toast.present();
  }

  private async safe(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch {
      // Haptics are a nice-to-have; ignore devices/browsers that don't support them.
    }
  }
}
