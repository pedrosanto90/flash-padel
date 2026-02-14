import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { TournamentService } from '../../core/services/tournament.service';
import { MatchService } from '../../core/services/match.service';
import { Tournament, Match } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './dashboard.html',
})
export default class DashboardComponent implements OnInit {
  protected readonly tournaments = signal<Tournament[]>([]);
  protected readonly upcomingMatches = signal<Match[]>([]);
  protected readonly loading = signal(true);

  constructor(
    protected readonly auth: AuthService,
    private readonly tournamentService: TournamentService,
    private readonly matchService: MatchService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const [tournaments] = await Promise.all([
        this.tournamentService.getAll(),
        this.loadUpcomingMatches(),
      ]);
      this.tournaments.set(tournaments.slice(0, 5));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadUpcomingMatches(): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return;

    try {
      const matches = await this.matchService.getPlayerMatches(userId);
      this.upcomingMatches.set(
        matches
          .filter((m) => m.status !== 'completed')
          .slice(0, 5)
      );
    } catch {
      // Player may not have any matches yet
    }
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Rascunho',
      registration: 'Inscricoes Abertas',
      in_progress: 'Em Curso',
      completed: 'Concluido',
      cancelled: 'Cancelado',
    };
    return labels[status] ?? status;
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      registration: 'bg-green-100 text-green-700',
      in_progress: 'bg-blue-100 text-blue-700',
      completed: 'bg-purple-100 text-purple-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return classes[status] ?? 'bg-gray-100 text-gray-700';
  }

  getFormatLabel(format: string): string {
    const labels: Record<string, string> = {
      single_elimination: 'Eliminacao Direta',
      round_robin: 'Round Robin',
      groups_elimination: 'Grupos + Eliminacao',
      americano: 'Americano',
    };
    return labels[format] ?? format;
  }
}
