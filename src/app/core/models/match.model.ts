export type MatchStatus = 'scheduled' | 'in_progress' | 'completed';

export interface Match {
  id: string;
  tournament_id: string;
  round: number;
  match_number: number;
  court: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_id: string | null;
  status: MatchStatus;
  group_id: string | null;
  bracket_position: number | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  team1?: {
    name: string | null;
    player1: { full_name: string };
    player2: { full_name: string };
  };
  team2?: {
    name: string | null;
    player1: { full_name: string };
    player2: { full_name: string };
  };
  sets?: MatchSet[];
}

export interface MatchSet {
  id: string;
  match_id: string;
  set_number: number;
  team1_score: number;
  team2_score: number;
}

export interface MatchSetCreate {
  match_id: string;
  set_number: number;
  team1_score: number;
  team2_score: number;
}

export interface MatchUpdate {
  court?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  winner_id?: string | null;
  status?: MatchStatus;
  scheduled_at?: string | null;
}
