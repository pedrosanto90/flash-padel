export type PreferredSide = 'left' | 'right' | 'both';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_player: boolean;
  is_organizer: boolean;
  skill_level: number | null;
  preferred_side: PreferredSide | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdate {
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
  is_player?: boolean;
  is_organizer?: boolean;
  skill_level?: number | null;
  preferred_side?: PreferredSide | null;
}
