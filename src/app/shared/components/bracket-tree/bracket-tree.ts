import { Component, Input, computed, signal } from '@angular/core';
import { Match } from '../../../core/models';

export interface BracketMatch {
  id: string;
  round: number;
  position: number;
  team1Name: string;
  team2Name: string;
  team1Score: string;
  team2Score: string;
  winnerId: string | null;
  team1Id: string | null;
  team2Id: string | null;
  status: string;
}

export interface BracketRound {
  label: string;
  matches: BracketMatch[];
}

@Component({
  selector: 'app-bracket-tree',
  standalone: true,
  templateUrl: './bracket-tree.html',
})
export class BracketTreeComponent {
  @Input() set matches(value: Match[]) {
    this._matches.set(value);
  }

  @Input() thirdPlaceMatch = false;

  private readonly _matches = signal<Match[]>([]);

  readonly rounds = computed<BracketRound[]>(() => {
    const matches = this._matches();
    if (matches.length === 0) return [];

    // Group by round
    const roundMap = new Map<number, Match[]>();
    for (const m of matches) {
      const list = roundMap.get(m.round) ?? [];
      list.push(m);
      roundMap.set(m.round, list);
    }

    const sortedRounds = [...roundMap.entries()].sort((a, b) => a[0] - b[0]);
    const totalRounds = sortedRounds.length;

    return sortedRounds.map(([roundNum, roundMatches], idx) => {
      // Sort matches within round by bracket_position
      const sorted = [...roundMatches].sort(
        (a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0)
      );

      let label: string;
      if (idx === totalRounds - 1) label = 'Final';
      else if (idx === totalRounds - 2) label = 'Meias-finais';
      else if (idx === totalRounds - 3) label = 'Quartos';
      else label = `Ronda ${idx + 1}`;

      return {
        label,
        matches: sorted.map(m => this.toBracketMatch(m)),
      };
    });
  });

  private toBracketMatch(m: Match): BracketMatch {
    const team1Name = m.team1
      ? (m.team1.name || `${m.team1.player1?.full_name ?? '?'} / ${m.team1.player2?.full_name ?? '?'}`)
      : 'A definir';
    const team2Name = m.team2
      ? (m.team2.name || `${m.team2.player1?.full_name ?? '?'} / ${m.team2.player2?.full_name ?? '?'}`)
      : 'A definir';

    // Build score string from sets
    let team1Score = '';
    let team2Score = '';
    if (m.sets && m.sets.length > 0) {
      const t1Sets = m.sets.filter(s => s.team1_score > s.team2_score).length;
      const t2Sets = m.sets.filter(s => s.team2_score > s.team1_score).length;
      team1Score = String(t1Sets);
      team2Score = String(t2Sets);
    }

    return {
      id: m.id,
      round: m.round,
      position: m.bracket_position ?? 0,
      team1Name,
      team2Name,
      team1Score,
      team2Score,
      winnerId: m.winner_id,
      team1Id: m.team1_id,
      team2Id: m.team2_id,
      status: m.status,
    };
  }

  getRoundTopPadding(roundIndex: number): number {
    if (roundIndex === 0) return 0;
    // Each subsequent round needs more top padding to center vertically
    const matchHeight = 64; // approx height of a match card
    const baseGap = 8;
    // offset = (2^roundIndex - 1) * (matchHeight + baseGap) / 2
    return (Math.pow(2, roundIndex) - 1) * (matchHeight + baseGap) / 2;
  }

  getMatchSpacing(roundIndex: number, matchIndex: number): number {
    const matchHeight = 64;
    const baseGap = 8;
    // Gap between matches in a round grows with each round
    return Math.pow(2, roundIndex) * (matchHeight + baseGap) - matchHeight;
  }
}
