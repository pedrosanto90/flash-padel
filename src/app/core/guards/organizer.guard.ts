import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const organizerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.loading()) {
    return new Promise<boolean>((resolve) => {
      const check = () => {
        if (!auth.loading()) {
          if (auth.isAuthenticated() && auth.isOrganizer()) {
            resolve(true);
          } else if (!auth.isAuthenticated()) {
            resolve(router.createUrlTree(['/auth/login']) as unknown as boolean);
          } else {
            resolve(router.createUrlTree(['/']) as unknown as boolean);
          }
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/auth/login']);
  }

  if (!auth.isOrganizer()) {
    return router.createUrlTree(['/']);
  }

  return true;
};
