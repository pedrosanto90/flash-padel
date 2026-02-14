import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Team, Tournament, Match, Group, GroupTeam, Standing } from '../models';

export interface BracketGenerationResult {
  matches: Match[];
  groups?: Group[];
  standings?: Standing[];
}

@Injectable({ providedIn: 'root' })
export class BracketService {
  constructor(private readonly supabase: SupabaseService) {}

  async generateBracket(tournament: Tournament, teams: Team[]): Promise<BracketGenerationResult> {
    switch (tournament.format) {
      case 'single_elimination':
        return this.generateSingleElimination(tournament, teams);
      case 'round_robin':
        return this.generateRoundRobin(tournament, teams);
      case 'groups_elimination':
        return this.generateGroupsElimination(tournament, teams);
      case 'americano':
        return this.generateAmericano(tournament, teams);
      default:
        throw new Error(`Formato desconhecido: ${tournament.format}`);
    }
  }

  // ─── Single Elimination ──────────────────────────────────────────────

  private async generateSingleElimination(
    tournament: Tournament,
    teams: Team[]
  ): Promise<BracketGenerationResult> {
    const seededTeams = this.seedTeams(teams);
    const totalSlots = this.nextPowerOf2(seededTeams.length);
    const totalRounds = Math.log2(totalSlots);
    const bracket = this.buildSingleEliminationBracket(seededTeams, totalSlots);

    // Create matches in Supabase
    const matchInserts = [];
    let matchNumber = 1;

    for (let round = 1; round <= totalRounds; round++) {
      const matchesInRound = totalSlots / Math.pow(2, round);

      for (let pos = 0; pos < matchesInRound; pos++) {
        const matchData: Record<string, unknown> = {
          tournament_id: tournament.id,
          round,
          match_number: matchNumber++,
          bracket_position: pos,
          status: 'scheduled',
          team1_id: null,
          team2_id: null,
        };

        if (round === 1) {
          const idx1 = pos * 2;
          const idx2 = pos * 2 + 1;
          matchData['team1_id'] = bracket[idx1]?.id ?? null;
          matchData['team2_id'] = bracket[idx2]?.id ?? null;

          // If one team has a bye (opponent is null), auto-advance
          if (matchData['team1_id'] && !matchData['team2_id']) {
            matchData['winner_id'] = matchData['team1_id'];
            matchData['status'] = 'completed';
          } else if (!matchData['team1_id'] && matchData['team2_id']) {
            matchData['winner_id'] = matchData['team2_id'];
            matchData['status'] = 'completed';
          }
        }

        matchInserts.push(matchData);
      }
    }

    // Add third place match if configured
    if (tournament.settings.third_place_match && totalRounds >= 2) {
      matchInserts.push({
        tournament_id: tournament.id,
        round: totalRounds,
        match_number: matchNumber++,
        bracket_position: 1, // second match in final round
        status: 'scheduled',
        team1_id: null,
        team2_id: null,
      });
    }

    const { data: matches, error } = await this.supabase
      .from('matches')
      .insert(matchInserts)
      .select();

    if (error) throw error;

    // Propagate byes to next rounds
    await this.propagateByeWinners(tournament.id, matches as Match[]);

    // Create initial standings
    await this.createStandings(tournament.id, teams);

    const { data: finalMatches } = await this.supabase
      .from('matches')
      .select(`*,
        team1:teams!team1_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        team2:teams!team2_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        sets:match_sets(*)`)
      .eq('tournament_id', tournament.id)
      .order('round')
      .order('match_number');

    return { matches: (finalMatches ?? []) as Match[] };
  }

  private seedTeams(teams: Team[]): Team[] {
    // Sort by seed (nulls last), then by creation order
    return [...teams].sort((a, b) => {
      if (a.seed != null && b.seed != null) return a.seed - b.seed;
      if (a.seed != null) return -1;
      if (b.seed != null) return 1;
      return 0;
    });
  }

  private nextPowerOf2(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  private buildSingleEliminationBracket(teams: Team[], totalSlots: number): (Team | null)[] {
    // Place teams in bracket positions using standard seeding order
    // to ensure top seeds are on opposite sides of the bracket
    const bracket: (Team | null)[] = new Array(totalSlots).fill(null);
    const positions = this.getSeededPositions(totalSlots);

    for (let i = 0; i < teams.length; i++) {
      bracket[positions[i]] = teams[i];
    }

    return bracket;
  }

  private getSeededPositions(size: number): number[] {
    if (size === 1) return [0];
    if (size === 2) return [0, 1];

    const positions: number[] = [0, 1];
    let groupSize = 2;

    while (groupSize < size) {
      const newPositions: number[] = [];
      for (const pos of positions) {
        newPositions.push(pos);
        newPositions.push(groupSize * 2 - 1 - pos);
      }
      positions.length = 0;
      positions.push(...newPositions);
      groupSize *= 2;
    }

    return positions;
  }

  private async propagateByeWinners(tournamentId: string, matches: Match[]): Promise<void> {
    // Find completed matches (byes) in round 1 and advance winners to round 2
    const byeMatches = matches.filter(m => m.round === 1 && m.status === 'completed' && m.winner_id);

    for (const byeMatch of byeMatches) {
      const nextRound = byeMatch.round + 1;
      const nextPosition = Math.floor(byeMatch.bracket_position! / 2);

      const nextMatch = matches.find(
        m => m.round === nextRound && m.bracket_position === nextPosition
      );

      if (nextMatch) {
        const isTeam1Slot = byeMatch.bracket_position! % 2 === 0;
        const updateData: Record<string, string | null> = isTeam1Slot
          ? { team1_id: byeMatch.winner_id }
          : { team2_id: byeMatch.winner_id };

        await this.supabase
          .from('matches')
          .update(updateData)
          .eq('id', nextMatch.id);
      }
    }
  }

  // ─── Round Robin ─────────────────────────────────────────────────────

  private async generateRoundRobin(
    tournament: Tournament,
    teams: Team[]
  ): Promise<BracketGenerationResult> {
    const matchInserts = this.createRoundRobinMatches(tournament.id, teams, null);

    const { data: matches, error } = await this.supabase
      .from('matches')
      .insert(matchInserts)
      .select();

    if (error) throw error;

    // Create standings
    await this.createStandings(tournament.id, teams);

    const { data: finalMatches } = await this.supabase
      .from('matches')
      .select(`*,
        team1:teams!team1_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        team2:teams!team2_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        sets:match_sets(*)`)
      .eq('tournament_id', tournament.id)
      .order('round')
      .order('match_number');

    return { matches: (finalMatches ?? []) as Match[] };
  }

  private createRoundRobinMatches(
    tournamentId: string,
    teams: Team[],
    groupId: string | null
  ): Record<string, unknown>[] {
    const n = teams.length;
    const matchInserts: Record<string, unknown>[] = [];

    // Use circle method for round-robin scheduling
    // If odd number of teams, add a "bye" placeholder
    const teamList = [...teams];
    const hasBye = n % 2 !== 0;
    if (hasBye) {
      teamList.push(null as unknown as Team); // bye placeholder
    }

    const numTeams = teamList.length;
    const rounds = numTeams - 1;
    const halfSize = numTeams / 2;
    let matchNumber = 1;

    // Indices for rotation (skip index 0 which stays fixed)
    const indices = teamList.map((_, i) => i);

    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < halfSize; i++) {
        const home = indices[i];
        const away = indices[numTeams - 1 - i];

        const team1 = teamList[home];
        const team2 = teamList[away];

        // Skip matches involving the "bye" placeholder
        if (!team1 || !team2) continue;

        matchInserts.push({
          tournament_id: tournamentId,
          round: round + 1,
          match_number: matchNumber++,
          bracket_position: i,
          status: 'scheduled',
          team1_id: team1.id,
          team2_id: team2.id,
          group_id: groupId,
        });
      }

      // Rotate: keep index 0 fixed, rotate the rest
      const last = indices.pop()!;
      indices.splice(1, 0, last);
    }

    return matchInserts;
  }

  // ─── Groups + Elimination ───────────────────────────────────────────

  private async generateGroupsElimination(
    tournament: Tournament,
    teams: Team[]
  ): Promise<BracketGenerationResult> {
    const groupsCount = tournament.settings.groups_count ?? 2;
    const seededTeams = this.seedTeams(teams);

    // Distribute teams to groups using snake seeding
    const groupTeamLists: Team[][] = Array.from({ length: groupsCount }, () => []);
    seededTeams.forEach((team, i) => {
      const round = Math.floor(i / groupsCount);
      const groupIdx = round % 2 === 0 ? i % groupsCount : groupsCount - 1 - (i % groupsCount);
      groupTeamLists[groupIdx].push(team);
    });

    // Create groups in Supabase
    const groupInserts = Array.from({ length: groupsCount }, (_, i) => ({
      tournament_id: tournament.id,
      name: `Grupo ${String.fromCharCode(65 + i)}`,
      order: i + 1,
    }));

    const { data: groups, error: groupError } = await this.supabase
      .from('groups')
      .insert(groupInserts)
      .select();

    if (groupError) throw groupError;

    // Create group_teams entries
    const groupTeamInserts: Record<string, string>[] = [];
    (groups as Group[]).forEach((group, i) => {
      groupTeamLists[i].forEach(team => {
        groupTeamInserts.push({
          group_id: group.id,
          team_id: team.id,
        });
      });
    });

    const { error: gtError } = await this.supabase
      .from('group_teams')
      .insert(groupTeamInserts);

    if (gtError) throw gtError;

    // Create round-robin matches within each group
    const allMatchInserts: Record<string, unknown>[] = [];
    (groups as Group[]).forEach((group, i) => {
      const groupMatches = this.createRoundRobinMatches(
        tournament.id,
        groupTeamLists[i],
        group.id
      );
      allMatchInserts.push(...groupMatches);
    });

    // Re-number matches sequentially
    allMatchInserts.forEach((m, i) => {
      m['match_number'] = i + 1;
    });

    const { error: matchError } = await this.supabase
      .from('matches')
      .insert(allMatchInserts);

    if (matchError) throw matchError;

    // Create elimination phase placeholder matches
    // These will be populated after group stage completes
    const qualifyPerGroup = tournament.settings.qualify_per_group ?? 2;
    const elimTeams = qualifyPerGroup * groupsCount;
    const elimSlots = this.nextPowerOf2(elimTeams);
    const elimRounds = Math.log2(elimSlots);
    const groupRounds = allMatchInserts.length > 0
      ? Math.max(...allMatchInserts.map(m => m['round'] as number))
      : 0;

    let elimMatchNumber = allMatchInserts.length + 1;
    const elimMatchInserts: Record<string, unknown>[] = [];

    for (let round = 1; round <= elimRounds; round++) {
      const matchesInRound = elimSlots / Math.pow(2, round);
      for (let pos = 0; pos < matchesInRound; pos++) {
        elimMatchInserts.push({
          tournament_id: tournament.id,
          round: groupRounds + round,
          match_number: elimMatchNumber++,
          bracket_position: pos,
          status: 'scheduled',
          team1_id: null,
          team2_id: null,
          group_id: null, // elimination phase, no group
        });
      }
    }

    if (elimMatchInserts.length > 0) {
      const { error: elimError } = await this.supabase
        .from('matches')
        .insert(elimMatchInserts);

      if (elimError) throw elimError;
    }

    // Create standings for each team (with group_id)
    const standingInserts = teams.map(team => {
      const group = (groups as Group[]).find((g, i) =>
        groupTeamLists[i].some(t => t.id === team.id)
      );
      return {
        tournament_id: tournament.id,
        team_id: team.id,
        group_id: group?.id ?? null,
        matches_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        sets_won: 0,
        sets_lost: 0,
        games_won: 0,
        games_lost: 0,
        points: 0,
        position: 0,
      };
    });

    const { error: standError } = await this.supabase
      .from('standings')
      .insert(standingInserts);

    if (standError) throw standError;

    // Fetch final state
    const { data: finalMatches } = await this.supabase
      .from('matches')
      .select(`*,
        team1:teams!team1_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        team2:teams!team2_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        sets:match_sets(*)`)
      .eq('tournament_id', tournament.id)
      .order('round')
      .order('match_number');

    return {
      matches: (finalMatches ?? []) as Match[],
      groups: groups as Group[],
    };
  }

  // ─── Americano / Mexicano ───────────────────────────────────────────

  private async generateAmericano(
    tournament: Tournament,
    teams: Team[]
  ): Promise<BracketGenerationResult> {
    // Americano: rotative pairings, all teams play a fixed number of rounds
    // Each round tries to pair teams that haven't played each other yet
    const totalRounds = tournament.settings.americano_rounds ?? teams.length - 1;
    const matchInserts: Record<string, unknown>[] = [];
    let matchNumber = 1;

    // Track which team pairs have been scheduled
    const playedPairs = new Set<string>();
    const makeKey = (a: string, b: string) => [a, b].sort().join(':');

    for (let round = 1; round <= totalRounds; round++) {
      const paired = new Set<string>();
      const roundMatches: { team1: Team; team2: Team }[] = [];

      // Greedy pairing: prefer teams that haven't played each other
      const available = [...teams];

      while (available.length >= 2) {
        const team1 = available.shift()!;
        let bestIdx = -1;
        let bestPlayed = true;

        for (let j = 0; j < available.length; j++) {
          const key = makeKey(team1.id, available[j].id);
          if (!playedPairs.has(key)) {
            bestIdx = j;
            bestPlayed = false;
            break;
          }
          if (bestIdx === -1) bestIdx = j;
        }

        if (bestIdx >= 0) {
          const team2 = available.splice(bestIdx, 1)[0];
          const key = makeKey(team1.id, team2.id);
          playedPairs.add(key);
          roundMatches.push({ team1, team2 });
        }
      }

      for (const rm of roundMatches) {
        matchInserts.push({
          tournament_id: tournament.id,
          round,
          match_number: matchNumber++,
          bracket_position: roundMatches.indexOf(rm),
          status: 'scheduled',
          team1_id: rm.team1.id,
          team2_id: rm.team2.id,
        });
      }
    }

    const { data: matches, error } = await this.supabase
      .from('matches')
      .insert(matchInserts)
      .select();

    if (error) throw error;

    await this.createStandings(tournament.id, teams);

    const { data: finalMatches } = await this.supabase
      .from('matches')
      .select(`*,
        team1:teams!team1_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        team2:teams!team2_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        sets:match_sets(*)`)
      .eq('tournament_id', tournament.id)
      .order('round')
      .order('match_number');

    return { matches: (finalMatches ?? []) as Match[] };
  }

  // ─── Shared helpers ──────────────────────────────────────────────────

  private async createStandings(tournamentId: string, teams: Team[]): Promise<void> {
    const inserts = teams.map(team => ({
      tournament_id: tournamentId,
      team_id: team.id,
      group_id: null,
      matches_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      sets_won: 0,
      sets_lost: 0,
      games_won: 0,
      games_lost: 0,
      points: 0,
      position: 0,
    }));

    const { error } = await this.supabase.from('standings').insert(inserts);
    if (error) throw error;
  }

  // ─── Match completion + advancement ──────────────────────────────────

  async advanceWinner(tournament: Tournament, completedMatch: Match): Promise<void> {
    if (tournament.format === 'single_elimination') {
      await this.advanceSingleElimination(tournament, completedMatch);
    } else if (tournament.format === 'groups_elimination') {
      await this.advanceGroupsElimination(tournament, completedMatch);
    }
    // Round robin and americano don't have advancement
  }

  private async advanceSingleElimination(tournament: Tournament, completedMatch: Match): Promise<void> {
    if (!completedMatch.winner_id || completedMatch.bracket_position == null) return;

    // Find next round match
    const nextRound = completedMatch.round + 1;
    const nextPosition = Math.floor(completedMatch.bracket_position / 2);

    const { data: nextMatches } = await this.supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('round', nextRound)
      .eq('bracket_position', nextPosition)
      .is('group_id', null);

    if (nextMatches && nextMatches.length > 0) {
      const nextMatch = nextMatches[0];
      const isTeam1Slot = completedMatch.bracket_position % 2 === 0;
      const updateData: Record<string, string> = isTeam1Slot
        ? { team1_id: completedMatch.winner_id }
        : { team2_id: completedMatch.winner_id };

      await this.supabase
        .from('matches')
        .update(updateData)
        .eq('id', nextMatch.id);
    }

    // Handle third place match: losers of semi-finals go to third place match
    if (tournament.settings.third_place_match) {
      const { data: allMatches } = await this.supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournament.id)
        .order('round', { ascending: false })
        .order('match_number', { ascending: false });

      if (allMatches && allMatches.length > 0) {
        const maxRound = allMatches[0].round;
        const semiFinalRound = maxRound; // semi-finals are one round before final, but final has bracket_position 0, 3rd place has bracket_position 1

        // The third place match is the one in the final round with bracket_position = 1
        const thirdPlaceMatch = allMatches.find(
          (m: Match) => m.round === maxRound && m.bracket_position === 1
        );

        // Check if this completed match is a semi-final (round = maxRound - 1)
        if (thirdPlaceMatch && completedMatch.round === maxRound - 1) {
          const loserId = completedMatch.team1_id === completedMatch.winner_id
            ? completedMatch.team2_id
            : completedMatch.team1_id;

          if (loserId) {
            const isTeam1Slot = completedMatch.bracket_position % 2 === 0;
            const updateData: Record<string, string> = isTeam1Slot
              ? { team1_id: loserId }
              : { team2_id: loserId };

            await this.supabase
              .from('matches')
              .update(updateData)
              .eq('id', thirdPlaceMatch.id);
          }
        }
      }
    }
  }

  private async advanceGroupsElimination(tournament: Tournament, completedMatch: Match): Promise<void> {
    // If match is in a group, check if all group matches are done
    if (completedMatch.group_id) {
      await this.checkGroupCompletion(tournament, completedMatch.group_id);
    } else {
      // Elimination phase: advance like single elimination
      await this.advanceSingleElimination(tournament, completedMatch);
    }
  }

  private async checkGroupCompletion(tournament: Tournament, groupId: string): Promise<void> {
    // Get all matches in this group
    const { data: groupMatches } = await this.supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('group_id', groupId);

    if (!groupMatches) return;

    const allCompleted = groupMatches.every((m: Match) => m.status === 'completed');
    if (!allCompleted) return;

    // Check if ALL groups are completed
    const { data: allGroupMatches } = await this.supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournament.id)
      .not('group_id', 'is', null);

    if (!allGroupMatches) return;

    const allGroupsCompleted = allGroupMatches.every((m: Match) => m.status === 'completed');
    if (!allGroupsCompleted) return;

    // All groups are done — populate elimination bracket
    await this.populateEliminationFromGroups(tournament);
  }

  private async populateEliminationFromGroups(tournament: Tournament): Promise<void> {
    const qualifyPerGroup = tournament.settings.qualify_per_group ?? 2;

    // Get groups
    const { data: groups } = await this.supabase
      .from('groups')
      .select('*')
      .eq('tournament_id', tournament.id)
      .order('order');

    if (!groups || groups.length === 0) return;

    // Get standings per group, sorted by points (desc), then set/game diff
    const qualifiedTeams: { teamId: string; groupOrder: number; position: number }[] = [];

    for (const group of groups as Group[]) {
      const { data: standings } = await this.supabase
        .from('standings')
        .select('*')
        .eq('tournament_id', tournament.id)
        .eq('group_id', group.id)
        .order('points', { ascending: false })
        .order('games_won', { ascending: false })
        .limit(qualifyPerGroup);

      if (standings) {
        standings.forEach((s: Standing, idx: number) => {
          qualifiedTeams.push({
            teamId: s.team_id,
            groupOrder: group.order,
            position: idx + 1,
          });
        });
      }
    }

    // Seed qualified teams into elimination bracket
    // Standard cross-seeding: 1st of Group A vs 2nd of Group B, etc.
    const elimTeams: string[] = [];
    const groupCount = groups.length;

    // First place from each group, then second place, etc.
    for (let pos = 1; pos <= qualifyPerGroup; pos++) {
      const teamsAtPos = qualifiedTeams
        .filter(t => t.position === pos)
        .sort((a, b) => a.groupOrder - b.groupOrder);

      if (pos % 2 === 0) {
        teamsAtPos.reverse(); // cross-seed
      }

      elimTeams.push(...teamsAtPos.map(t => t.teamId));
    }

    // Get elimination matches (no group_id, sorted by round/match_number)
    const { data: elimMatches } = await this.supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournament.id)
      .is('group_id', null)
      .order('round')
      .order('match_number');

    if (!elimMatches || elimMatches.length === 0) return;

    // Find first round of elimination (lowest round among elim matches)
    const firstElimRound = Math.min(...elimMatches.map((m: Match) => m.round));
    const firstRoundMatches = elimMatches.filter((m: Match) => m.round === firstElimRound);

    // Assign teams to first round
    for (let i = 0; i < firstRoundMatches.length; i++) {
      const team1Id = elimTeams[i * 2] ?? null;
      const team2Id = elimTeams[i * 2 + 1] ?? null;

      const updateData: Record<string, string | null> = {
        team1_id: team1Id,
        team2_id: team2Id,
      };

      // Auto-advance if only one team
      if (team1Id && !team2Id) {
        updateData['winner_id'] = team1Id;
        updateData['status'] = 'completed';
      } else if (!team1Id && team2Id) {
        updateData['winner_id'] = team2Id;
        updateData['status'] = 'completed';
      }

      await this.supabase
        .from('matches')
        .update(updateData)
        .eq('id', firstRoundMatches[i].id);
    }
  }

  // ─── Update standings after match ────────────────────────────────────

  async updateStandings(tournament: Tournament, match: Match): Promise<void> {
    if (!match.team1_id || !match.team2_id || !match.winner_id || !match.sets) return;

    const team1Sets = match.sets.filter(s => s.team1_score > s.team2_score).length;
    const team2Sets = match.sets.filter(s => s.team2_score > s.team1_score).length;
    const team1Games = match.sets.reduce((sum, s) => sum + s.team1_score, 0);
    const team2Games = match.sets.reduce((sum, s) => sum + s.team2_score, 0);

    const team1Won = match.winner_id === match.team1_id;

    // Update team 1 standings
    await this.incrementStandings(tournament, match.team1_id, match.group_id, {
      won: team1Won,
      setsWon: team1Sets,
      setsLost: team2Sets,
      gamesWon: team1Games,
      gamesLost: team2Games,
    });

    // Update team 2 standings
    await this.incrementStandings(tournament, match.team2_id, match.group_id, {
      won: !team1Won,
      setsWon: team2Sets,
      setsLost: team1Sets,
      gamesWon: team2Games,
      gamesLost: team1Games,
    });
  }

  private async incrementStandings(
    tournament: Tournament,
    teamId: string,
    groupId: string | null,
    result: { won: boolean; setsWon: number; setsLost: number; gamesWon: number; gamesLost: number }
  ): Promise<void> {
    // Get current standings
    const { data: existing } = await this.supabase
      .from('standings')
      .select('*')
      .eq('tournament_id', tournament.id)
      .eq('team_id', teamId)
      .single();

    if (!existing) return;

    const points = result.won ? tournament.settings.points_win : tournament.settings.points_loss;

    await this.supabase
      .from('standings')
      .update({
        matches_played: existing.matches_played + 1,
        wins: existing.wins + (result.won ? 1 : 0),
        losses: existing.losses + (result.won ? 0 : 1),
        sets_won: existing.sets_won + result.setsWon,
        sets_lost: existing.sets_lost + result.setsLost,
        games_won: existing.games_won + result.gamesWon,
        games_lost: existing.games_lost + result.gamesLost,
        points: existing.points + points,
      })
      .eq('id', existing.id);
  }

  // ─── Fetch groups with teams ─────────────────────────────────────────

  async getGroups(tournamentId: string): Promise<Group[]> {
    const { data, error } = await this.supabase
      .from('groups')
      .select(`*,
        teams:group_teams(*,
          team:teams(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name))
        )`)
      .eq('tournament_id', tournamentId)
      .order('order');

    if (error) throw error;
    return (data ?? []) as Group[];
  }

  // ─── Fetch standings ─────────────────────────────────────────────────

  async getStandings(tournamentId: string, groupId?: string): Promise<Standing[]> {
    let query = this.supabase
      .from('standings')
      .select(`*,
        team:teams(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name))`)
      .eq('tournament_id', tournamentId)
      .order('points', { ascending: false })
      .order('games_won', { ascending: false });

    if (groupId) {
      query = query.eq('group_id', groupId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Standing[];
  }
}
