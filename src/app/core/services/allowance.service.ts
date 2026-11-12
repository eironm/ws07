import { Injectable, computed, inject } from '@angular/core';

import { periodAt, previousPeriod } from '../allowance';
import type { AllowancePeriod } from '../allowance';
import { startOfDay } from '../date-utils';
import type { Transaction } from '../models';

import { SettingsService } from './settings.service';
import { TransactionService } from './transaction.service';

export type PaceState = 'ok' | 'fast' | 'over';

export interface LedgerLine {
  tx: Transaction;
  /** What was left right after this line. */
  balanceAfter: number;
  /** Pace at the moment of this line: ahead of an even split, or below zero. */
  state: PaceState;
}

export interface Ledger {
  period: AllowancePeriod;
  /** The amount the period started with: the allowance, or what was left when the student set up mid-period. */
  opening: number;
  /** True when `opening` is the setup amount rather than a full allowance. */
  openedMidPeriod: boolean;
  /** Oldest first, so balances accumulate in order. */
  lines: LedgerLine[];
  moneyIn: number;
  spent: number;
  left: number;
  /** What's left, spread evenly over the days to go (today included). */
  perDay: number;
  state: PaceState;
  /** Share of the money in that has been spent, 0–1+. */
  ratio: number;
}

/**
 * The allowance passbook: the current period's payments and top-ups with the balance
 * after each, computed from the allowance setting and the stored transactions.
 */
@Injectable({ providedIn: 'root' })
export class AllowanceService {
  private tx = inject(TransactionService);
  private settings = inject(SettingsService);

  readonly allowance = computed(() => this.settings.settings().allowance);

  readonly period = computed(() => {
    const a = this.allowance();
    return a ? periodAt(a, this.tx.now()) : null;
  });

  readonly ledger = computed<Ledger | null>(() => {
    const a = this.allowance();
    const period = this.period();
    if (!a || !period) return null;

    const from = period.start.toISOString();
    const to = period.next.toISOString();
    const openedMidPeriod = a.opening?.periodStart === from;
    const opening = openedMidPeriod ? a.opening!.left : a.amount;
    const span = period.next.getTime() - period.start.getTime();

    // transactions() is newest first; the ledger runs oldest first.
    const items = this.tx
      .transactions()
      .filter((t) => t.date >= from && t.date < to)
      .reverse();

    let balance = opening;
    let moneyIn = opening;
    let spent = 0;
    const lines: LedgerLine[] = items.map((t) => {
      if (t.type === 'income') {
        balance += t.amount;
        moneyIn += t.amount;
      } else {
        balance -= t.amount;
        spent += t.amount;
      }
      const elapsed = Math.min(1, Math.max(0, (new Date(t.date).getTime() - period.start.getTime()) / span));
      const evenLeft = moneyIn * (1 - elapsed);
      const state: PaceState =
        balance < 0 ? 'over' : t.type === 'expense' && balance < evenLeft - 0.1 * moneyIn ? 'fast' : 'ok';
      return { tx: t, balanceAfter: balance, state };
    });

    const left = moneyIn - spent;
    const ratio = moneyIn > 0 ? spent / moneyIn : 0;
    return {
      period,
      opening,
      openedMidPeriod,
      lines,
      moneyIn,
      spent,
      left,
      perDay: Math.max(0, left) / period.daysLeft,
      state: left < 0 ? 'over' : ratio > period.elapsed + 0.1 ? 'fast' : 'ok',
      ratio,
    };
  });

  /**
   * How the last full period ended. Only periods that began after the allowance was set
   * up are summarized, so a partial first period never reports a made-up leftover.
   */
  readonly previous = computed(() => {
    const a = this.allowance();
    const period = this.period();
    if (!a || !period) return null;
    const prev = previousPeriod(a, period);
    if (prev.start.getTime() < startOfDay(new Date(a.since)).getTime()) return null;

    const from = prev.start.toISOString();
    const to = prev.next.toISOString();
    let moneyIn = a.amount;
    let spent = 0;
    let count = 0;
    for (const t of this.tx.transactions()) {
      if (t.date < from || t.date >= to) continue;
      count++;
      if (t.type === 'income') moneyIn += t.amount;
      else spent += t.amount;
    }
    if (!count) return null;
    return { start: prev.start, moneyIn, spent, left: moneyIn - spent };
  });

  /**
   * Pin numbers for places, ranked by what was spent there this period (1 = most).
   * The same numbering marks the places on the map.
   */
  readonly placeRanks = computed(() => {
    const period = this.period();
    const ranks = new Map<string, number>();
    const byTx = new Map<string, number>();
    if (!period) return { ranks, byTx };
    const from = period.start.toISOString();
    const to = period.next.toISOString();

    const spentAt = this.tx
      .places()
      .map((p) => ({
        place: p,
        spent: p.transactions.reduce((s, t) => (t.type === 'expense' && t.date >= from && t.date < to ? s + t.amount : s), 0),
      }))
      .filter((p) => p.spent > 0)
      .sort((x, y) => y.spent - x.spent);

    spentAt.forEach((p, i) => {
      ranks.set(p.place.id, i + 1);
      for (const t of p.place.transactions) byTx.set(t.id, i + 1);
    });
    return { ranks, byTx };
  });
}
