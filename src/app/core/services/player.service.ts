import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models';

@Injectable({ providedIn: 'root' })
export class PlayerService {
  constructor(private readonly supabase: SupabaseService) {}

  async getAll(): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('is_player', true)
      .order('full_name');

    if (error) throw error;
    return (data ?? []) as Profile[];
  }

  async getById(id: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Profile;
  }

  async search(query: string): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('is_player', true)
      .ilike('full_name', `%${query}%`)
      .order('full_name')
      .limit(20);

    if (error) throw error;
    return (data ?? []) as Profile[];
  }

  async getPlayerStats(playerId: string): Promise<{
    tournaments_played: number;
    matches_played: number;
    wins: number;
    losses: number;
  }> {
    const { data: teams } = await this.supabase
      .from('teams')
      .select('id, tournament_id')
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`);

    const teamIds = (teams ?? []).map((t: { id: string }) => t.id);
    const tournamentIds = [
      ...new Set((teams ?? []).map((t: { tournament_id: string }) => t.tournament_id)),
    ];

    if (teamIds.length === 0) {
      return { tournaments_played: 0, matches_played: 0, wins: 0, losses: 0 };
    }

    const { data: standings } = await this.supabase
      .from('standings')
      .select('wins, losses, matches_played')
      .in('team_id', teamIds);

    const stats = (standings ?? []).reduce(
      (acc: { matches_played: number; wins: number; losses: number }, s: { matches_played: number; wins: number; losses: number }) => ({
        matches_played: acc.matches_played + s.matches_played,
        wins: acc.wins + s.wins,
        losses: acc.losses + s.losses,
      }),
      { matches_played: 0, wins: 0, losses: 0 }
    );

    return {
      tournaments_played: tournamentIds.length,
      ...stats,
    };
  }
}
