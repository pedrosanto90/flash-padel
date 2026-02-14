import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Team, TeamCreate } from '../models';

@Injectable({ providedIn: 'root' })
export class TeamService {
  constructor(private readonly supabase: SupabaseService) {}

  async getByTournament(tournamentId: string): Promise<Team[]> {
    const { data, error } = await this.supabase
      .from('teams')
      .select(
        '*, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)'
      )
      .eq('tournament_id', tournamentId)
      .order('seed');

    if (error) throw error;
    return (data ?? []) as Team[];
  }

  async create(team: TeamCreate): Promise<Team> {
    const { data, error } = await this.supabase
      .from('teams')
      .insert(team)
      .select(
        '*, player1:profiles!player1_id(full_name), player2:profiles!player2_id(full_name)'
      )
      .single();

    if (error) throw error;
    return data as Team;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('teams')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async updateSeed(id: string, seed: number): Promise<void> {
    const { error } = await this.supabase
      .from('teams')
      .update({ seed })
      .eq('id', id);

    if (error) throw error;
  }
}
