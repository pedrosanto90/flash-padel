import { Component, OnInit, signal, computed } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TournamentService } from '../../../core/services/tournament.service';
import { TeamService } from '../../../core/services/team.service';
import { MatchService } from '../../../core/services/match.service';
import { BracketService } from '../../../core/services/bracket.service';
import { PlayerService } from '../../../core/services/player.service';
import { AuthService } from '../../../core/services/auth.service';
import { Tournament, Team, Match, MatchSetCreate, Standing, Group, Profile } from '../../../core/models';
import { BracketTreeComponent } from '../../../shared/components/bracket-tree/bracket-tree';

@Component({
  selector: 'app-tournament-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, FormsModule, BracketTreeComponent],
  templateUrl: './tournament-detail.html',
})
export default class TournamentDetailComponent implements OnInit {
  protected readonly tournament = signal<Tournament | null>(null);
  protected readonly teams = signal<Team[]>([]);
  protected readonly matches = signal<Match[]>([]);
  protected readonly standings = signal<Standing[]>([]);
  protected readonly groups = signal<Group[]>([]);
  protected readonly loading = signal(true);
  protected readonly activeTab = signal<'info' | 'teams' | 'matches' | 'standings' | 'bracket'>('info');

  // Team registration
  protected readonly showRegisterForm = signal(false);
  protected readonly partnerSearch = signal('');
  protected readonly partnerResults = signal<Profile[]>([]);
  protected readonly selectedPartner = signal<Profile | null>(null);
  protected readonly teamName = signal('');
  protected readonly registering = signal(false);
  protected readonly registerError = signal('');

  // Match score entry
  protected readonly scoringMatchId = signal<string | null>(null);
  protected readonly setScores = signal<{ team1: number; team2: number }[]>([]);
  protected readonly savingScore = signal(false);
  protected readonly scoreError = signal('');

  // Bracket generation
  protected readonly generatingBracket = signal(false);

  // Computed
  protected readonly isCreator = computed(() => {
    const userId = this.auth.currentUser()?.id;
    return !!userId && this.tournament()?.created_by === userId;
  });

  protected readonly isRegistered = computed(() => {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return false;
    return this.teams().some(t => t.player1_id === userId || t.player2_id === userId);
  });

  protected readonly canRegister = computed(() => {
    const t = this.tournament();
    if (!t) return false;
    if (t.status !== 'registration') return false;
    if (this.isCreator()) return false; // organizer can't play own tournament
    if (this.isRegistered()) return false;
    if (this.teams().length >= t.max_teams) return false;
    return true;
  });

  protected readonly groupMatches = computed(() => {
    return this.matches().filter(m => m.group_id != null);
  });

  protected readonly elimMatches = computed(() => {
    return this.matches().filter(m => m.group_id == null);
  });

  protected readonly hasBracket = computed(() => {
    const t = this.tournament();
    if (!t) return false;
    return t.format === 'single_elimination' || t.format === 'groups_elimination';
  });

  protected readonly bracketMatches = computed(() => {
    const t = this.tournament();
    if (!t) return [];
    if (t.format === 'single_elimination') {
      return this.matches();
    }
    if (t.format === 'groups_elimination') {
      // Only show elimination phase matches in bracket
      return this.elimMatches();
    }
    return [];
  });

  protected readonly matchesByRound = computed(() => {
    const rounds = new Map<number, Match[]>();
    for (const match of this.matches()) {
      const list = rounds.get(match.round) ?? [];
      list.push(match);
      rounds.set(match.round, list);
    }
    return [...rounds.entries()].sort((a, b) => a[0] - b[0]);
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly tournamentService: TournamentService,
    private readonly teamService: TeamService,
    private readonly matchService: MatchService,
    private readonly bracketService: BracketService,
    private readonly playerService: PlayerService,
    protected readonly auth: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    try {
      const [tournament, teams, matches] = await Promise.all([
        this.tournamentService.getById(id),
        this.teamService.getByTournament(id),
        this.matchService.getByTournament(id),
      ]);

      this.tournament.set(tournament);
      this.teams.set(teams);
      this.matches.set(matches);

      if (tournament) {
        // Load standings and groups if tournament is in progress or completed
        if (tournament.status === 'in_progress' || tournament.status === 'completed') {
          await this.loadStandingsAndGroups(tournament.id);
        }
      }
    } finally {
      this.loading.set(false);
    }
  }

  private async loadStandingsAndGroups(tournamentId: string): Promise<void> {
    try {
      const [standings, groups] = await Promise.all([
        this.bracketService.getStandings(tournamentId),
        this.bracketService.getGroups(tournamentId),
      ]);
      this.standings.set(standings);
      this.groups.set(groups);
    } catch {
      // Non-critical, standings/groups may not exist yet
    }
  }

  // ─── Status Management ──────────────────────────────────────────────

  async updateStatus(status: Tournament['status']): Promise<void> {
    const t = this.tournament();
    if (!t) return;

    try {
      if (status === 'in_progress') {
        // Generate bracket when starting tournament
        await this.startTournament();
        return;
      }

      await this.tournamentService.updateStatus(t.id, status);
      this.tournament.set({ ...t, status });
    } catch {
      // handle error
    }
  }

  private async startTournament(): Promise<void> {
    const t = this.tournament();
    if (!t) return;

    const teams = this.teams();
    if (teams.length < 2) {
      return; // Need at least 2 teams
    }

    this.generatingBracket.set(true);
    try {
      await this.tournamentService.updateStatus(t.id, 'in_progress');
      const result = await this.bracketService.generateBracket(t, teams);
      this.matches.set(result.matches);
      this.tournament.set({ ...t, status: 'in_progress' });

      if (result.groups) {
        this.groups.set(result.groups);
      }

      // Reload standings
      const standings = await this.bracketService.getStandings(t.id);
      this.standings.set(standings);
    } catch (err) {
      // Revert status on failure
      try {
        await this.tournamentService.updateStatus(t.id, 'registration');
      } catch {
        // ignore
      }
    } finally {
      this.generatingBracket.set(false);
    }
  }

  // ─── Team Registration ──────────────────────────────────────────────

  async searchPartner(): Promise<void> {
    const query = this.partnerSearch();
    if (query.length < 2) {
      this.partnerResults.set([]);
      return;
    }

    try {
      const results = await this.playerService.search(query);
      // Filter out: self, organizer, already registered players
      const userId = this.auth.currentUser()?.id;
      const tournament = this.tournament();
      const registeredIds = new Set<string>();
      this.teams().forEach(t => {
        registeredIds.add(t.player1_id);
        registeredIds.add(t.player2_id);
      });

      const filtered = results.filter(p =>
        p.id !== userId &&
        p.id !== tournament?.created_by &&
        !registeredIds.has(p.id)
      );
      this.partnerResults.set(filtered);
    } catch {
      this.partnerResults.set([]);
    }
  }

  selectPartner(player: Profile): void {
    this.selectedPartner.set(player);
    this.partnerSearch.set(player.full_name);
    this.partnerResults.set([]);
  }

  clearPartner(): void {
    this.selectedPartner.set(null);
    this.partnerSearch.set('');
    this.partnerResults.set([]);
  }

  async registerTeam(): Promise<void> {
    const userId = this.auth.currentUser()?.id;
    const partner = this.selectedPartner();
    const tournament = this.tournament();

    if (!userId || !partner || !tournament) return;

    this.registering.set(true);
    this.registerError.set('');

    try {
      const team = await this.teamService.create({
        tournament_id: tournament.id,
        player1_id: userId,
        player2_id: partner.id,
        name: this.teamName() || null,
      });

      this.teams.update(teams => [...teams, team]);
      this.showRegisterForm.set(false);
      this.clearPartner();
      this.teamName.set('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao registar equipa';
      this.registerError.set(message);
    } finally {
      this.registering.set(false);
    }
  }

  async removeTeam(teamId: string): Promise<void> {
    try {
      await this.teamService.delete(teamId);
      this.teams.update(teams => teams.filter(t => t.id !== teamId));
    } catch {
      // handle error
    }
  }

  canRemoveTeam(team: Team): boolean {
    const userId = this.auth.currentUser()?.id;
    if (!userId) return false;
    const t = this.tournament();
    if (!t || t.status !== 'registration') return false;
    return this.isCreator() || team.player1_id === userId || team.player2_id === userId;
  }

  // ─── Match Score Entry ──────────────────────────────────────────────

  openScoring(match: Match): void {
    const t = this.tournament();
    if (!t) return;

    const setsCount = t.settings.sets_per_match;
    const existingSets = match.sets ?? [];
    const scores: { team1: number; team2: number }[] = [];

    for (let i = 0; i < setsCount; i++) {
      const existing = existingSets.find(s => s.set_number === i + 1);
      scores.push({
        team1: existing?.team1_score ?? 0,
        team2: existing?.team2_score ?? 0,
      });
    }

    this.setScores.set(scores);
    this.scoringMatchId.set(match.id);
    this.scoreError.set('');
  }

  closeScoring(): void {
    this.scoringMatchId.set(null);
    this.setScores.set([]);
    this.scoreError.set('');
  }

  updateSetScore(setIndex: number, team: 'team1' | 'team2', value: number): void {
    this.setScores.update(scores => {
      const updated = [...scores];
      updated[setIndex] = { ...updated[setIndex], [team]: Math.max(0, value) };
      return updated;
    });
  }

  async saveScore(): Promise<void> {
    const matchId = this.scoringMatchId();
    const t = this.tournament();
    if (!matchId || !t) return;

    const match = this.matches().find(m => m.id === matchId);
    if (!match || !match.team1_id || !match.team2_id) return;

    const scores = this.setScores();

    // Determine winner: team that wins more sets
    let team1SetsWon = 0;
    let team2SetsWon = 0;
    for (const s of scores) {
      if (s.team1 > s.team2) team1SetsWon++;
      else if (s.team2 > s.team1) team2SetsWon++;
    }

    if (team1SetsWon === 0 && team2SetsWon === 0) {
      this.scoreError.set('Insira pelo menos um set com resultado valido');
      return;
    }

    const winnerId = team1SetsWon >= team2SetsWon ? match.team1_id : match.team2_id;

    this.savingScore.set(true);
    this.scoreError.set('');

    try {
      const setCreates: MatchSetCreate[] = scores
        .map((s, i) => ({
          match_id: matchId,
          set_number: i + 1,
          team1_score: s.team1,
          team2_score: s.team2,
        }))
        .filter(s => s.team1_score > 0 || s.team2_score > 0);

      await this.matchService.completeMatch(matchId, winnerId, setCreates);

      // Update standings
      const updatedMatch = await this.matchService.getById(matchId);
      if (updatedMatch && t) {
        await this.bracketService.updateStandings(t, updatedMatch);
        await this.bracketService.advanceWinner(t, updatedMatch);
      }

      // Reload data
      const tournamentId = t.id;
      const [matches, standings] = await Promise.all([
        this.matchService.getByTournament(tournamentId),
        this.bracketService.getStandings(tournamentId),
      ]);
      this.matches.set(matches);
      this.standings.set(standings);

      this.closeScoring();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao guardar resultado';
      this.scoreError.set(message);
    } finally {
      this.savingScore.set(false);
    }
  }

  canScore(match: Match): boolean {
    if (!this.isCreator()) return false;
    const t = this.tournament();
    if (!t || t.status !== 'in_progress') return false;
    return match.status !== 'completed' && !!match.team1_id && !!match.team2_id;
  }

  // ─── Display Helpers ────────────────────────────────────────────────

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

  getMatchStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      scheduled: 'Agendado',
      in_progress: 'A Decorrer',
      completed: 'Concluido',
    };
    return labels[status] ?? status;
  }

  getTeamDisplay(team: { name?: string | null; player1?: { full_name: string }; player2?: { full_name: string } }): string {
    if (team.name) return team.name;
    const p1 = team.player1?.full_name ?? '?';
    const p2 = team.player2?.full_name ?? '?';
    return `${p1} / ${p2}`;
  }

  getMatchTeamDisplay(match: Match, teamSide: 'team1' | 'team2'): string {
    const team = match[teamSide];
    if (!team) return 'A definir';
    return this.getTeamDisplay(team);
  }

  getRoundLabel(round: number): string {
    const t = this.tournament();
    if (!t) return `Ronda ${round}`;

    if (t.format === 'single_elimination') {
      const totalMatches = this.elimMatches().length || this.matches().length;
      const maxRound = this.matches().reduce((max, m) => Math.max(max, m.round), 0);

      if (round === maxRound) return 'Final';
      if (round === maxRound - 1) return 'Meias-finais';
      if (round === maxRound - 2) return 'Quartos-de-final';
      return `Ronda ${round}`;
    }

    if (t.format === 'groups_elimination') {
      const groupMatchRounds = this.groupMatches().map(m => m.round);
      const maxGroupRound = groupMatchRounds.length > 0 ? Math.max(...groupMatchRounds) : 0;

      if (round <= maxGroupRound) return `Fase Grupos - Ronda ${round}`;

      const elimRound = round - maxGroupRound;
      const maxElimRound = this.elimMatches().reduce((max, m) => Math.max(max, m.round), 0) - maxGroupRound;
      if (elimRound === maxElimRound) return 'Final';
      if (elimRound === maxElimRound - 1) return 'Meias-finais';
      return `Eliminacao - Ronda ${elimRound}`;
    }

    return `Ronda ${round}`;
  }

  getStandingsDiff(standing: Standing, type: 'sets' | 'games'): string {
    if (type === 'sets') {
      const diff = standing.sets_won - standing.sets_lost;
      return diff >= 0 ? `+${diff}` : `${diff}`;
    }
    const diff = standing.games_won - standing.games_lost;
    return diff >= 0 ? `+${diff}` : `${diff}`;
  }

  getGroupStandings(groupId: string): Standing[] {
    return this.standings()
      .filter(s => s.group_id === groupId)
      .sort((a, b) => b.points - a.points || (b.games_won - b.games_lost) - (a.games_won - a.games_lost));
  }
}
