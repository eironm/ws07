import { Injectable } from '@angular/core';

import type { LatLng } from '../geo-utils';
import { offsetMeters } from '../geo-utils';
import type { Allowance, PaymentMethod, Transaction } from '../models';

interface DemoSpot {
  name: string;
  address: string;
  north: number;
  east: number;
  min: number;
  max: number;
  /** Amounts are rounded to this step (fares are exact pesos, most prices end in 0 or 5). */
  step: number;
  /** How often the student goes here, relative to the other spots. */
  weight: number;
  method: PaymentMethod;
  /** Notes per category, so a note always matches the category it is filed under. */
  notes: Record<string, string[]>;
}

/**
 * Places around a campus, as offsets (meters) from a base point. Amounts and visit
 * weights are tuned to a student on a ₱1,500 weekly allowance: daily fares and meals,
 * the occasional coffee, a grocery run about once a week.
 */
const SPOTS: DemoSpot[] = [
  { name: 'Campus Canteen', address: 'Main Building, Ground Floor', north: 40, east: -30, min: 55, max: 120, step: 5, weight: 5, method: 'cash', notes: { food: ['Lunch', 'Rice meal', 'Merienda', 'Breakfast'] } },
  { name: '7-Eleven', address: 'Corner of the main road', north: 210, east: 160, min: 25, max: 90, step: 5, weight: 5, method: 'ewallet', notes: { food: ['Snacks', 'Drinks', 'Siopao + coffee'], bills: ['Load'] } },
  { name: 'Jeepney Terminal', address: 'Transport hub', north: -320, east: 90, min: 13, max: 15, step: 1, weight: 6, method: 'cash', notes: { transport: ['Jeep fare', 'Fare home', 'Jeep to school'] } },
  { name: 'Coffee Project', address: 'Strip mall, 2nd floor', north: 480, east: -260, min: 110, max: 180, step: 5, weight: 0.8, method: 'card', notes: { food: ['Iced latte', 'Frappe'], fun: ['Study session'] } },
  { name: 'Campus Bookstore', address: 'Student Center', north: -60, east: 70, min: 20, max: 180, step: 5, weight: 2, method: 'cash', notes: { school: ['Bond paper', 'Printing', 'Lab manual', 'Blue book'] } },
  { name: 'Mercury Drug', address: 'Along the main avenue', north: 650, east: 400, min: 40, max: 200, step: 5, weight: 1, method: 'ewallet', notes: { health: ['Vitamins', 'Paracetamol', 'Face masks'] } },
  { name: 'Puregold', address: 'Commercial district', north: 1100, east: -700, min: 250, max: 500, step: 5, weight: 0.7, method: 'card', notes: { groceries: ['Weekly groceries', 'Dorm supplies', 'Toiletries'] } },
  { name: 'SM Mall', address: 'City center', north: -1900, east: 1500, min: 150, max: 350, step: 5, weight: 0.6, method: 'card', notes: { shopping: ['New shirt', 'Earphones'], fun: ['Movie'], food: ['Dinner with friends'] } },
  { name: 'Dorm', address: 'Residential area', north: -150, east: -420, min: 80, max: 250, step: 5, weight: 1, method: 'ewallet', notes: { bills: ['Water bill share', 'WiFi share'], food: ['Food delivery'] } },
];

const JEEPNEY = SPOTS[2];
const SAMPLE_DAYS = 34;

/**
 * Generates realistic geotagged sample data around a given point: a student's daily
 * spending plus the occasional top-up. The allowance itself comes from the sample
 * allowance setting, not from logged income.
 */
@Injectable({ providedIn: 'root' })
export class DemoDataService {
  /** The allowance the sample data is built around: ₱1,500 every Monday. */
  sampleAllowance(days = SAMPLE_DAYS): Allowance {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);
    return { amount: 1500, cadence: 'weekly', weekday: 1, monthDay: 1, since: since.toISOString(), opening: null, sample: true };
  }

  generate(base: LatLng, days = SAMPLE_DAYS): Transaction[] {
    const rand = mulberry32(Math.floor(base.lat * 1000 + base.lng * 1000));
    const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
    const totalWeight = SPOTS.reduce((s, x) => s + x.weight, 0);
    const pickSpot = () => {
      let r = rand() * totalWeight;
      for (const s of SPOTS) {
        r -= s.weight;
        if (r <= 0) return s;
      }
      return SPOTS[0];
    };
    const out: Transaction[] = [];
    const now = new Date();

    for (let dayOffset = days; dayOffset >= 0; dayOffset--) {
      const day = new Date(now);
      day.setDate(now.getDate() - dayOffset);

      // Top-ups: a relative sends a little on some Wednesdays, tutoring pays on some Saturdays.
      if (day.getDay() === 3 && rand() < 0.4) {
        this.pushAt(out, day, 12, 15, now, () => this.tx('income', 'gift', pick([200, 300]), 'From Tita Rose', 'ewallet', null));
      }
      if (day.getDay() === 6 && rand() < 0.3) {
        this.pushAt(out, day, 16, 0, now, () => this.tx('income', 'salary', 400, 'Tutoring', 'cash', null));
      }

      // Two payments most days, a third on about one day in three.
      const count = rand() < 0.35 ? 3 : 2;
      const hours = [7, 10, 12, 15, 18, 20].sort(() => rand() - 0.5).slice(0, count).sort((a, b) => a - b);
      for (const hour of hours) {
        const spot = (hour === 7 || hour === 18) && rand() > 0.4 ? JEEPNEY : pickSpot();
        const cat = pick(Object.keys(spot.notes));
        const amount = Math.round((spot.min + rand() * (spot.max - spot.min)) / spot.step) * spot.step;
        // Jitter ±15 m so pins look like real GPS readings.
        const p = offsetMeters(base, spot.north + (rand() - 0.5) * 30, spot.east + (rand() - 0.5) * 30);
        const accuracy = 5 + Math.round(rand() * 20);
        const note = pick(spot.notes[cat]);
        this.pushAt(out, day, hour, Math.floor(rand() * 59), now, () =>
          this.tx('expense', cat, amount, note, spot.method, { ...p, name: spot.name, address: spot.address, accuracy }),
        );
      }
    }
    return out;
  }

  /** Adds a transaction at a time on `day`, unless that time is still in the future. */
  private pushAt(
    out: Transaction[],
    day: Date,
    hour: number,
    minute: number,
    now: Date,
    make: () => Omit<Transaction, 'date' | 'createdAt' | 'updatedAt' | 'id'>,
  ): void {
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    if (d > now) return;
    const iso = d.toISOString();
    const base = make();
    out.push({
      ...base,
      location: base.location ? { ...base.location, capturedAt: iso } : null,
      id: `demo-${d.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      date: iso,
      createdAt: iso,
      updatedAt: iso,
    });
  }

  private tx(
    type: 'expense' | 'income',
    categoryId: string,
    amount: number,
    note: string,
    method: PaymentMethod,
    loc: (LatLng & { name: string; address: string; accuracy: number }) | null,
  ): Omit<Transaction, 'date' | 'createdAt' | 'updatedAt' | 'id'> {
    return {
      type,
      categoryId,
      amount,
      note,
      method,
      location: loc
        ? {
            lat: loc.lat,
            lng: loc.lng,
            accuracy: loc.accuracy,
            // Filled with the payment's own time when the transaction is placed.
            capturedAt: '',
            source: 'gps',
            placeName: loc.name,
            address: loc.address,
            customName: true,
            geocodeStatus: 'ok',
          }
        : null,
    };
  }
}

/** Small seeded PRNG so the same base point always yields the same demo data. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
