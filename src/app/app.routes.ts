import { Routes } from '@angular/router';
import { LayoutComponent } from './shared/components/layout/layout';
import { authGuard } from './core/guards/auth.guard';
import { organizerGuard } from './core/guards/organizer.guard';

export const routes: Routes = [
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login/login'),
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./features/auth/register/register'),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard'),
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile'),
      },
      {
        path: 'tournaments',
        loadComponent: () =>
          import(
            './features/tournaments/tournament-list/tournament-list'
          ),
      },
      {
        path: 'tournaments/new',
        loadComponent: () =>
          import(
            './features/tournaments/tournament-create/tournament-create'
          ),
        canActivate: [organizerGuard],
      },
      {
        path: 'tournaments/:id',
        loadComponent: () =>
          import(
            './features/tournaments/tournament-detail/tournament-detail'
          ),
      },
      {
        path: 'players',
        loadComponent: () =>
          import('./features/players/player-list/player-list'),
      },
      {
        path: 'players/:id',
        loadComponent: () =>
          import('./features/players/player-profile/player-profile'),
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
