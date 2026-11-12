import { Pipe, PipeTransform, inject } from '@angular/core';

import { SettingsService } from './services/settings.service';

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(value: number, currency: string, compact = false): string {
  const key = `${currency}|${compact}`;
  let fmt = formatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: compact ? 0 : 2,
      maximumFractionDigits: compact ? 0 : 2,
    });
    formatters.set(key, fmt);
  }
  return fmt.format(value);
}

const shortFormatters = new Map<string, Intl.NumberFormat>();

/** Very short form for tight spots such as chart labels: "₱705", "₱1.1K", "₩12M". */
export function formatMoneyShort(value: number, currency: string): string {
  let fmt = shortFormatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      maximumFractionDigits: 1,
    });
    shortFormatters.set(currency, fmt);
  }
  return fmt.format(value);
}

/**
 * Exact but uncluttered, for ledgers: "₱820", "₱13.50" (never rounds away centavos).
 * Negatives use a true minus sign: "−₱104".
 */
export function formatMoneyLedger(value: number, currency: string): string {
  const cents = Math.round(value * 100);
  const text = formatMoney(Math.abs(value), currency, cents % 100 === 0);
  return cents < 0 ? `−${text}` : text;
}

/** "₱775 left" or "₱104 over": what a balance means, said in words. */
export function describeBalance(value: number, currency: string): string {
  return value < 0 ? `${formatMoneyLedger(-value, currency)} over` : `${formatMoneyLedger(value, currency)} left`;
}

/**
 * `{{ 1234.5 | money }}` -> "₱1,234.50" using the currency from Settings.
 * `{{ 1234.5 | money: true }}` -> "₱1,235" (compact, for charts and map pins).
 * `{{ 1234.5 | money: 'ledger' }}` -> "₱1,234.50", but `{{ 820 | money: 'ledger' }}` -> "₱820".
 * Impure so it re-renders when the user changes currency.
 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private settings = inject(SettingsService);

  transform(value: number | null | undefined, mode: boolean | 'ledger' = false): string {
    const currency = this.settings.settings().currency;
    return mode === 'ledger' ? formatMoneyLedger(value ?? 0, currency) : formatMoney(value ?? 0, currency, mode);
  }
}

export const CURRENCIES = [
  { code: 'PHP', label: 'Philippine Peso (₱)' },
  { code: 'USD', label: 'US Dollar ($)' },
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'JPY', label: 'Japanese Yen (¥)' },
  { code: 'KRW', label: 'Korean Won (₩)' },
  { code: 'SGD', label: 'Singapore Dollar ($)' },
  { code: 'GBP', label: 'British Pound (£)' },
];

