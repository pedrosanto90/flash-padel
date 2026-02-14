import { Component, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../../../core/services/tournament.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  TournamentFormat,
  TournamentCreate,
  DEFAULT_TOURNAMENT_SETTINGS,
} from '../../../core/models';

@Component({
  selector: 'app-tournament-create',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './tournament-create.html',
})
export default class TournamentCreateComponent {
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly format = signal<TournamentFormat>('single_elimination');
  protected readonly maxTeams = signal(16);
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');
  protected readonly location = signal('');
  protected readonly setsPerMatch = signal(DEFAULT_TOURNAMENT_SETTINGS.sets_per_match);
  protected readonly gamesPerSet = signal(DEFAULT_TOURNAMENT_SETTINGS.games_per_set);
  protected readonly thirdPlaceMatch = signal(DEFAULT_TOURNAMENT_SETTINGS.third_place_match);
  protected readonly groupsCount = signal<number | null>(null);
  protected readonly teamsPerGroup = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor(
    private readonly tournamentService: TournamentService,
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  async onSubmit(): Promise<void> {
    this.error.set(null);

    const userId = this.auth.currentUser()?.id;
    if (!userId) {
      this.error.set('Necessario estar autenticado.');
      return;
    }

    if (!this.name().trim()) {
      this.error.set('O nome do torneio e obrigatorio.');
      return;
    }

    if (!this.startDate()) {
      this.error.set('A data de inicio e obrigatoria.');
      return;
    }

    this.saving.set(true);

    try {
      const tournament: TournamentCreate = {
        name: this.name(),
        description: this.description() || null,
        format: this.format(),
        max_teams: this.maxTeams(),
        start_date: new Date(this.startDate()).toISOString(),
        end_date: this.endDate()
          ? new Date(this.endDate()).toISOString()
          : null,
        location: this.location() || null,
        settings: {
          sets_per_match: this.setsPerMatch(),
          games_per_set: this.gamesPerSet(),
          third_place_match: this.thirdPlaceMatch(),
          groups_count: this.groupsCount(),
          teams_per_group: this.teamsPerGroup(),
        },
      };

      const created = await this.tournamentService.create(tournament, userId);
      this.router.navigate(['/tournaments', created.id]);
    } catch (err) {
      this.error.set('Erro ao criar torneio. Verifica os dados e tenta novamente.');
    } finally {
      this.saving.set(false);
    }
  }
}
