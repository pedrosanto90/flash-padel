export type TournamentFormat =
  | 'single_elimination'
  | 'round_robin'
  | 'groups_elimination'
  | 'americano';

export type TournamentStatus =
  | 'draft'
  | 'registration'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface TournamentSettings {
  sets_per_match: number;
  games_per_set: number;
  tiebreak_at: number | null;
  third_place_match: boolean;
  groups_count: number | null;
  teams_per_group: number | null;
  qualify_per_group: number | null;
  americano_rounds: number | null;
  points_win: number;
  points_loss: number;
  points_draw: number;
}

export const DEFAULT_TOURNAMENT_SETTINGS: TournamentSettings = {
  sets_per_match: 3,
  games_per_set: 6,
  tiebreak_at: 6,
  third_place_match: false,
  groups_count: null,
  teams_per_group: null,
  qualify_per_group: 2,
  americano_rounds: null,
  points_win: 3,
  points_loss: 0,
  points_draw: 1,
};

export interface Tournament {
  id: string;
  name: string;
  description: string | null;
  format: TournamentFormat;
  status: TournamentStatus;
  max_teams: number;
  start_date: string;
  end_date: string | null;
  location: string | null;
  settings: TournamentSettings;
  created_by: string;
  created_at: string;
  updated_at: string;
  organizer?: { full_name: string };
}

export interface TournamentCreate {
  name: string;
  description?: string | null;
  format: TournamentFormat;
  max_teams: number;
  start_date: string;
  end_date?: string | null;
  location?: string | null;
  settings?: Partial<TournamentSettings>;
}

export interface TournamentUpdate {
  name?: string;
  description?: string | null;
  format?: TournamentFormat;
  status?: TournamentStatus;
  max_teams?: number;
  start_date?: string;
  end_date?: string | null;
  location?: string | null;
  settings?: Partial<TournamentSettings>;
}
