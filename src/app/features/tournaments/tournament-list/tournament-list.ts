import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TournamentService } from '../../../core/services/tournament.service';
import { AuthService } from '../../../core/services/auth.service';
import { Tournament } from '../../../core/models';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-tournament-list',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './tournament-list.html',
})
export default class TournamentListComponent implements OnInit {
  protected readonly tournaments = signal<Tournament[]>([]);
  protected readonly loading = signal(true);
  protected readonly filter = signal<string>('all');

  constructor(
    private readonly tournamentService: TournamentService,
    protected readonly auth: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const data = await this.tournamentService.getAll();
      this.tournaments.set(data);
    } finally {
      this.loading.set(false);
    }
  }

  get filteredTournaments(): Tournament[] {
    const f = this.filter();
    if (f === 'all') return this.tournaments();
    if (f === 'mine') {
      const userId = this.auth.currentUser()?.id;
      return this.tournaments().filter((t) => t.created_by === userId);
    }
    return this.tournaments().filter((t) => t.status === f);
  }

  setFilter(filter: string): void {
    this.filter.set(filter);
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
