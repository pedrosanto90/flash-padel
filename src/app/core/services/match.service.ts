import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Match, MatchUpdate, MatchSet, MatchSetCreate } from '../models';

@Injectable({ providedIn: 'root' })
export class MatchService {
  constructor(private readonly supabase: SupabaseService) {}

  async getByTournament(tournamentId: string): Promise<Match[]> {
    const { data, error } = await this.supabase
      .from('matches')
      .select(
        `*,
        team1:teams!team1_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        team2:teams!team2_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        sets:match_sets(*)`
      )
      .eq('tournament_id', tournamentId)
      .order('round')
      .order('match_number');

    if (error) throw error;
    return (data ?? []) as Match[];
  }

  async getById(id: string): Promise<Match | null> {
    const { data, error } = await this.supabase
      .from('matches')
      .select(
        `*,
        team1:teams!team1_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        team2:teams!team2_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        sets:match_sets(*)`
      )
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Match;
  }

  async update(id: string, updates: MatchUpdate): Promise<void> {
    const { error } = await this.supabase
      .from('matches')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
  }

  async saveSetScore(setData: MatchSetCreate): Promise<void> {
    const { error } = await this.supabase
      .from('match_sets')
      .upsert(setData, { onConflict: 'match_id,set_number' });

    if (error) throw error;
  }

  async completeMatch(
    matchId: string,
    winnerId: string,
    sets: MatchSetCreate[]
  ): Promise<void> {
    for (const set of sets) {
      await this.saveSetScore(set);
    }

    await this.update(matchId, {
      winner_id: winnerId,
      status: 'completed',
    });
  }

  async getPlayerMatches(playerId: string): Promise<Match[]> {
    const { data: teams } = await this.supabase
      .from('teams')
      .select('id')
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`);

    const teamIds = (teams ?? []).map((t: { id: string }) => t.id);
    if (teamIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from('matches')
      .select(
        `*,
        team1:teams!team1_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        team2:teams!team2_id(name, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)),
        sets:match_sets(*)`
      )
      .or(teamIds.map((id: string) => `team1_id.eq.${id},team2_id.eq.${id}`).join(','))
      .order('scheduled_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Match[];
  }
}
