import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  Tournament,
  TournamentCreate,
  TournamentUpdate,
  DEFAULT_TOURNAMENT_SETTINGS,
} from '../models';

@Injectable({ providedIn: 'root' })
export class TournamentService {
  constructor(private readonly supabase: SupabaseService) {}

  async getAll(): Promise<Tournament[]> {
    const { data, error } = await this.supabase
      .from('tournaments')
      .select('*, organizer:profiles!created_by(full_name)')
      .order('start_date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Tournament[];
  }

  async getById(id: string): Promise<Tournament | null> {
    const { data, error } = await this.supabase
      .from('tournaments')
      .select('*, organizer:profiles!created_by(full_name)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Tournament;
  }

  async getByOrganizer(organizerId: string): Promise<Tournament[]> {
    const { data, error } = await this.supabase
      .from('tournaments')
      .select('*, organizer:profiles!created_by(full_name)')
      .eq('created_by', organizerId)
      .order('start_date', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Tournament[];
  }

  async create(
    tournament: TournamentCreate,
    createdBy: string
  ): Promise<Tournament> {
    const settings = {
      ...DEFAULT_TOURNAMENT_SETTINGS,
      ...(tournament.settings ?? {}),
    };

    const { data, error } = await this.supabase
      .from('tournaments')
      .insert({
        ...tournament,
        settings,
        created_by: createdBy,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Tournament;
  }

  async update(
    id: string,
    updates: TournamentUpdate
  ): Promise<Tournament> {
    const { data, error } = await this.supabase
      .from('tournaments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Tournament;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('tournaments')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async updateStatus(
    id: string,
    status: Tournament['status']
  ): Promise<void> {
    const { error } = await this.supabase
      .from('tournaments')
      .update({ status })
      .eq('id', id);

    if (error) throw error;
  }
}
