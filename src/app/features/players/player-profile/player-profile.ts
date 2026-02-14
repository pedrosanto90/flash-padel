import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PlayerService } from '../../../core/services/player.service';
import { Profile } from '../../../core/models';

@Component({
  selector: 'app-player-profile',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './player-profile.html',
})
export default class PlayerProfileComponent implements OnInit {
  protected readonly player = signal<Profile | null>(null);
  protected readonly stats = signal<{
    tournaments_played: number;
    matches_played: number;
    wins: number;
    losses: number;
  } | null>(null);
  protected readonly loading = signal(true);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly playerService: PlayerService
  ) {}

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    try {
      const [player, stats] = await Promise.all([
        this.playerService.getById(id),
        this.playerService.getPlayerStats(id),
      ]);
      this.player.set(player);
      this.stats.set(stats);
    } finally {
      this.loading.set(false);
    }
  }

  getSideLabel(side: string | null): string {
    if (!side) return 'Sem preferencia';
    const labels: Record<string, string> = {
      left: 'Esquerda',
      right: 'Direita',
      both: 'Ambos',
    };
    return labels[side] ?? side;
  }

  get winRate(): number {
    const s = this.stats();
    if (!s || s.matches_played === 0) return 0;
    return Math.round((s.wins / s.matches_played) * 100);
  }
}
