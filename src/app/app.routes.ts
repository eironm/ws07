import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'transaction/new',
    loadComponent: () => import('./pages/transaction-form/transaction-form.page').then((m) => m.TransactionFormPage),
  },
  {
    path: 'transaction/:id/edit',
    loadComponent: () => import('./pages/transaction-form/transaction-form.page').then((m) => m.TransactionFormPage),
  },
  {
    path: 'transaction/:id',
    loadComponent: () =>
      import('./pages/transaction-detail/transaction-detail.page').then((m) => m.TransactionDetailPage),
  },
  { path: '**', redirectTo: '/tabs/home' },
];
