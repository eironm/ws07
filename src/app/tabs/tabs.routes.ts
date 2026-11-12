import type { Routes } from '@angular/router';

import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'home',
        loadComponent: () => import('../pages/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'history',
        loadComponent: () => import('../pages/history/history.page').then((m) => m.HistoryPage),
      },
      {
        path: 'map',
        loadComponent: () => import('../pages/map/map.page').then((m) => m.MapPage),
      },
      {
        path: 'places',
        loadComponent: () => import('../pages/places/places.page').then((m) => m.PlacesPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('../pages/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: '',
        redirectTo: '/tabs/home',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/home',
    pathMatch: 'full',
  },
];
