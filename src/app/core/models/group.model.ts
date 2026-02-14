export interface Group {
  id: string;
  tournament_id: string;
  name: string;
  order: number;
  created_at: string;
  teams?: GroupTeam[];
}

export interface GroupTeam {
  id: string;
  group_id: string;
  team_id: string;
  team?: {
    name: string | null;
    player1: { full_name: string };
    player2: { full_name: string };
  };
}

export interface Standing {
  id: string;
  tournament_id: string;
  team_id: string;
  group_id: string | null;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  points: number;
  position: number;
  team?: {
    name: string | null;
    player1: { full_name: string };
    player2: { full_name: string };
  };
}
