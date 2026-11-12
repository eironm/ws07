import { startOfDay } from './date-utils';
import type { Allowance } from './models';

const DAY_MS = 86_400_000;

/** One allowance period: from the day it arrives until the next one. */
export interface AllowancePeriod {
  start: Date;
  next: Date;
  /** Length of the period in days. */
  days: number;
  /** Days still to go, today included. */
  daysLeft: number;
  /** How far through the period `now` is, 0–1. */
  elapsed: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The allowance day in a given month, clamped to the month's length. */
function monthlyDate(a: Allowance, year: number, month: number): Date {
  return new Date(year, month, Math.min(Math.max(1, a.monthDay), daysInMonth(year, month)));
}

/** The allowance day on or before `at` (local midnight). */
export function periodStart(a: Allowance, at: Date): Date {
  const day = startOfDay(at);
  if (a.cadence === 'weekly') {
    day.setDate(day.getDate() - ((day.getDay() - a.weekday + 7) % 7));
    return day;
  }
  const thisMonth = monthlyDate(a, day.getFullYear(), day.getMonth());
  return thisMonth <= day ? thisMonth : monthlyDate(a, day.getFullYear(), day.getMonth() - 1);
}

/** The allowance day after the one that started a period. */
export function nextStart(a: Allowance, start: Date): Date {
  if (a.cadence === 'weekly') {
    const next = new Date(start);
    next.setDate(next.getDate() + 7);
    return next;
  }
  return monthlyDate(a, start.getFullYear(), start.getMonth() + 1);
}

export function periodAt(a: Allowance, now: Date): AllowancePeriod {
  const start = periodStart(a, now);
  const next = nextStart(a, start);
  const span = next.getTime() - start.getTime();
  return {
    start,
    next,
    days: Math.round(span / DAY_MS),
    daysLeft: Math.max(1, Math.round((next.getTime() - startOfDay(now).getTime()) / DAY_MS)),
    elapsed: Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / span)),
  };
}

/** The period that ended when `period` began. */
export function previousPeriod(a: Allowance, period: AllowancePeriod): { start: Date; next: Date } {
  const start = periodStart(a, new Date(period.start.getTime() - 1));
  return { start, next: period.start };
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday" for weekly allowances, "Dec 1" for monthly ones. */
export function nextAllowanceLabel(a: Allowance, next: Date): string {
  return a.cadence === 'weekly'
    ? WEEKDAYS[next.getDay()]
    : next.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
