import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.loading()) {
    return new Promise<boolean>((resolve) => {
      const check = () => {
        if (!auth.loading()) {
          resolve(auth.isAuthenticated() || router.createUrlTree(['/auth/login']) as unknown as boolean);
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  }

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/auth/login']);
};
