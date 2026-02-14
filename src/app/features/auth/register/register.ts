import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
})
export default class RegisterComponent {
  protected readonly fullName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal(false);
  protected readonly loading = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  async onSubmit(): Promise<void> {
    this.error.set(null);

    if (this.password() !== this.confirmPassword()) {
      this.error.set('As passwords nao coincidem.');
      return;
    }

    if (this.password().length < 6) {
      this.error.set('A password deve ter pelo menos 6 caracteres.');
      return;
    }

    if (!this.fullName().trim()) {
      this.error.set('O nome e obrigatorio.');
      return;
    }

    this.loading.set(true);

    try {
      const { error } = await this.auth.signUp(
        this.email(),
        this.password(),
        this.fullName()
      );

      if (error) {
        this.error.set(error.message);
      } else {
        this.success.set(true);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
