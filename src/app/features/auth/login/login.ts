import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export default class LoginComponent {
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly loading = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  async onSubmit(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);

    try {
      const { error } = await this.auth.signIn(
        this.email(),
        this.password()
      );

      if (error) {
        this.error.set(error.message);
      } else {
        this.router.navigate(['/']);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
