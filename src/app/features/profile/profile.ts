import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ProfileUpdate, PreferredSide } from '../../core/models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './profile.html',
})
export default class ProfileComponent implements OnInit {
  protected readonly fullName = signal('');
  protected readonly phone = signal('');
  protected readonly skillLevel = signal<number | null>(null);
  protected readonly preferredSide = signal<PreferredSide | null>(null);
  protected readonly isOrganizer = signal(false);
  protected readonly saving = signal(false);
  protected readonly success = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor(protected readonly auth: AuthService) {}

  ngOnInit(): void {
    const profile = this.auth.profile();
    if (profile) {
      this.fullName.set(profile.full_name);
      this.phone.set(profile.phone ?? '');
      this.skillLevel.set(profile.skill_level);
      this.preferredSide.set(profile.preferred_side);
      this.isOrganizer.set(profile.is_organizer);
    }
  }

  async onSubmit(): Promise<void> {
    this.error.set(null);
    this.success.set(false);
    this.saving.set(true);

    try {
      const updates: ProfileUpdate = {
        full_name: this.fullName(),
        phone: this.phone() || null,
        skill_level: this.skillLevel(),
        preferred_side: this.preferredSide(),
        is_organizer: this.isOrganizer(),
      };

      const { error } = await this.auth.updateProfile(updates);

      if (error) {
        this.error.set('Erro ao guardar perfil.');
      } else {
        this.success.set(true);
        setTimeout(() => this.success.set(false), 3000);
      }
    } finally {
      this.saving.set(false);
    }
  }
}
