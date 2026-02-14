import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PlayerService } from '../../../core/services/player.service';
import { Profile } from '../../../core/models';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [RouterLink, FormsModule],
  templateUrl: './player-list.html',
})
export default class PlayerListComponent implements OnInit {
  protected readonly players = signal<Profile[]>([]);
  protected readonly filteredPlayers = signal<Profile[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly loading = signal(true);

  constructor(private readonly playerService: PlayerService) {}

  async ngOnInit(): Promise<void> {
    try {
      const data = await this.playerService.getAll();
      this.players.set(data);
      this.filteredPlayers.set(data);
    } finally {
      this.loading.set(false);
    }
  }

  onSearch(): void {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) {
      this.filteredPlayers.set(this.players());
    } else {
      this.filteredPlayers.set(
        this.players().filter((p) =>
          p.full_name.toLowerCase().includes(query)
        )
      );
    }
  }

  getSideLabel(side: string | null): string {
    if (!side) return '-';
    const labels: Record<string, string> = {
      left: 'Esquerda',
      right: 'Direita',
      both: 'Ambos',
    };
    return labels[side] ?? side;
  }
}
