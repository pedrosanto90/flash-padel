export interface Team {
  id: string;
  tournament_id: string;
  player1_id: string;
  player2_id: string;
  name: string | null;
  seed: number | null;
  created_at: string;
  player1?: { full_name: string };
  player2?: { full_name: string };
}

export interface TeamCreate {
  tournament_id: string;
  player1_id: string;
  player2_id: string;
  name?: string | null;
  seed?: number | null;
}
