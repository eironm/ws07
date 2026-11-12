import { Category, TxType } from './models';

export const CATEGORIES: Category[] = [
  // Expenses
  { id: 'food', name: 'Food & Drinks', icon: 'fast-food', color: '#f97316', type: 'expense' },
  { id: 'transport', name: 'Transport', icon: 'bus', color: '#3b82f6', type: 'expense' },
  { id: 'groceries', name: 'Groceries', icon: 'cart', color: '#22c55e', type: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: 'bag-handle', color: '#ec4899', type: 'expense' },
  { id: 'bills', name: 'Bills & Load', icon: 'receipt', color: '#eab308', type: 'expense' },
  { id: 'school', name: 'School', icon: 'school', color: '#8b5cf6', type: 'expense' },
  { id: 'health', name: 'Health', icon: 'medkit', color: '#ef4444', type: 'expense' },
  { id: 'fun', name: 'Leisure', icon: 'game-controller', color: '#14b8a6', type: 'expense' },
  { id: 'other', name: 'Other', icon: 'ellipsis-horizontal', color: '#64748b', type: 'expense' },
  // Income
  { id: 'allowance', name: 'Allowance', icon: 'wallet', color: '#10b981', type: 'income' },
  { id: 'salary', name: 'Salary / Pay', icon: 'briefcase', color: '#0ea5e9', type: 'income' },
  { id: 'gift', name: 'Gift', icon: 'gift', color: '#f43f5e', type: 'income' },
  { id: 'other-income', name: 'Other income', icon: 'cash', color: '#84cc16', type: 'income' },
];

const FALLBACK: Category = CATEGORIES.find((c) => c.id === 'other')!;

export function categoryById(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? FALLBACK;
}

export function categoriesFor(type: TxType): Category[] {
  return CATEGORIES.filter((c) => c.type === type);
}

