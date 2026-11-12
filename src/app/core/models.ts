/** Whether money left (expense) or came in (income). */
export type TxType = 'expense' | 'income';

export type PaymentMethod = 'cash' | 'card' | 'ewallet' | 'bank';

/** How the coordinates of a transaction were obtained. */
export type GeoSource = 'gps' | 'network' | 'manual';

/** State of the reverse-geocoding (coordinates -> human readable address). */
export type GeocodeStatus = 'ok' | 'pending' | 'failed' | 'off';

/**
 * The location "stamp" attached to a transaction at the moment it was logged.
 */
export interface GeoTag {
  lat: number;
  lng: number;
  /** Radius of uncertainty in meters (null when picked manually on the map). */
  accuracy: number | null;
  capturedAt: string;
  source: GeoSource;
  /** Short label, e.g. "Jollibee" or "Katipunan Ave". */
  placeName?: string;
  /** Longer address line, e.g. "Loyola Heights, Quezon City". */
  address?: string;
  /** True when the user typed the place name themselves. */
  customName?: boolean;
  geocodeStatus: GeocodeStatus;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  categoryId: string;
  note: string;
  method: PaymentMethod;
  /** When the payment happened (ISO string). */
  date: string;
  createdAt: string;
  updatedAt: string;
  location: GeoTag | null;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TxType;
}

export type AllowanceCadence = 'weekly' | 'monthly';

/** The money the student lives on: a set amount that arrives on a schedule. */
export interface Allowance {
  amount: number;
  cadence: AllowanceCadence;
  /** Weekly: the day it arrives, 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Monthly: the day of the month it arrives (1–31); shorter months use their last day. */
  monthDay: number;
  /** When it was set up (ISO). Periods that started before this are not summarized. */
  since: string;
  /**
   * What was actually left in the period the student started in, so starting mid-week
   * doesn't show the whole allowance as unspent.
   */
  opening: { periodStart: string; left: number } | null;
  /** Set when the sample data created this allowance, so clearing the sample removes it too. */
  sample?: boolean;
}

export interface AppSettings {
  currency: string;
  /** Null until the student sets up their allowance. */
  allowance: Allowance | null;
  /** Automatically capture the location when logging a new transaction. */
  autoLocation: boolean;
  /** Use GPS (more accurate, more battery) instead of network location. */
  highAccuracy: boolean;
  /** Send coordinates to OpenStreetMap Nominatim to get street/place names. */
  addressLookup: boolean;
  /** Payments closer than this (meters) are grouped into the same "place". */
  placeRadius: number;
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  currency: 'PHP',
  allowance: null,
  autoLocation: true,
  highAccuracy: true,
  addressLookup: true,
  placeRadius: 80,
  onboarded: false,
};

export const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'cash', label: 'Cash', icon: 'cash-outline' },
  { id: 'ewallet', label: 'E-wallet', icon: 'phone-portrait-outline' },
  { id: 'card', label: 'Card', icon: 'card-outline' },
  { id: 'bank', label: 'Bank', icon: 'business-outline' },
];

