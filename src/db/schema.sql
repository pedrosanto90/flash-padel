-- ============================================
-- Flash Padel - Database Schema
-- Execute this in Supabase SQL Editor
-- ============================================

-- ============================================
-- TABLES
-- ============================================

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_player BOOLEAN NOT NULL DEFAULT true,
  is_organizer BOOLEAN NOT NULL DEFAULT false,
  skill_level INTEGER CHECK (skill_level >= 1 AND skill_level <= 10),
  preferred_side TEXT CHECK (preferred_side IN ('left', 'right', 'both')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tournaments
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  format TEXT NOT NULL CHECK (format IN ('single_elimination', 'round_robin', 'groups_elimination', 'americano')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registration', 'in_progress', 'completed', 'cancelled')),
  max_teams INTEGER NOT NULL CHECK (max_teams >= 2),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT,
  settings JSONB NOT NULL DEFAULT '{
    "sets_per_match": 3,
    "games_per_set": 6,
    "tiebreak_at": 6,
    "third_place_match": false,
    "groups_count": null,
    "teams_per_group": null,
    "qualify_per_group": 2,
    "americano_rounds": null,
    "points_win": 3,
    "points_loss": 0,
    "points_draw": 1
  }'::jsonb,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Teams (pairs of players)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player1_id UUID NOT NULL REFERENCES profiles(id),
  player2_id UUID NOT NULL REFERENCES profiles(id),
  name TEXT,
  seed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (player1_id != player2_id)
);

-- Groups (for group stage format)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group Teams (teams assigned to groups)
CREATE TABLE group_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  UNIQUE(group_id, team_id)
);

-- Matches
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  court TEXT,
  team1_id UUID REFERENCES teams(id),
  team2_id UUID REFERENCES teams(id),
  winner_id UUID REFERENCES teams(id),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  bracket_position INTEGER,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Match Sets (scores per set)
CREATE TABLE match_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  team1_score INTEGER NOT NULL DEFAULT 0,
  team2_score INTEGER NOT NULL DEFAULT 0,
  UNIQUE(match_id, set_number)
);

-- Standings (calculated standings per team)
CREATE TABLE standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  sets_won INTEGER NOT NULL DEFAULT 0,
  sets_lost INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_lost INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tournament_id, team_id)
);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_created_by ON tournaments(created_by);
CREATE INDEX idx_teams_tournament_id ON teams(tournament_id);
CREATE INDEX idx_teams_player1_id ON teams(player1_id);
CREATE INDEX idx_teams_player2_id ON teams(player2_id);
CREATE INDEX idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX idx_matches_group_id ON matches(group_id);
CREATE INDEX idx_match_sets_match_id ON match_sets(match_id);
CREATE INDEX idx_standings_tournament_id ON standings(tournament_id);
CREATE INDEX idx_group_teams_group_id ON group_teams(group_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Tournaments
CREATE POLICY "Tournaments are viewable by authenticated users"
  ON tournaments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Organizers can create tournaments"
  ON tournaments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_organizer = true)
  );

CREATE POLICY "Tournament creator can update"
  ON tournaments FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Tournament creator can delete"
  ON tournaments FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Teams
CREATE POLICY "Teams are viewable by authenticated users"
  ON teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Players can create teams"
  ON teams FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_player = true)
    AND NOT EXISTS (
      SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "Team members or tournament creator can update"
  ON teams FOR UPDATE TO authenticated
  USING (
    player1_id = auth.uid()
    OR player2_id = auth.uid()
    OR EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "Team members or tournament creator can delete"
  ON teams FOR DELETE TO authenticated
  USING (
    player1_id = auth.uid()
    OR player2_id = auth.uid()
    OR EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

-- Groups
CREATE POLICY "Groups viewable by authenticated"
  ON groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tournament creator manages groups"
  ON groups FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "Tournament creator updates groups"
  ON groups FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "Tournament creator deletes groups"
  ON groups FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

-- Group Teams
CREATE POLICY "Group teams viewable by authenticated"
  ON group_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tournament creator manages group teams"
  ON group_teams FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups g
      JOIN tournaments t ON t.id = g.tournament_id
      WHERE g.id = group_id AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Tournament creator updates group teams"
  ON group_teams FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      JOIN tournaments t ON t.id = g.tournament_id
      WHERE g.id = group_id AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Tournament creator deletes group teams"
  ON group_teams FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      JOIN tournaments t ON t.id = g.tournament_id
      WHERE g.id = group_id AND t.created_by = auth.uid()
    )
  );

-- Matches
CREATE POLICY "Matches viewable by authenticated"
  ON matches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tournament creator manages matches"
  ON matches FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "Tournament creator updates matches"
  ON matches FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "Tournament creator deletes matches"
  ON matches FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

-- Match Sets
CREATE POLICY "Match sets viewable by authenticated"
  ON match_sets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tournament creator manages match sets"
  ON match_sets FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN tournaments t ON t.id = m.tournament_id
      WHERE m.id = match_id AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Tournament creator updates match sets"
  ON match_sets FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN tournaments t ON t.id = m.tournament_id
      WHERE m.id = match_id AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Tournament creator deletes match sets"
  ON match_sets FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM matches m
      JOIN tournaments t ON t.id = m.tournament_id
      WHERE m.id = match_id AND t.created_by = auth.uid()
    )
  );

-- Standings
CREATE POLICY "Standings viewable by authenticated"
  ON standings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tournament creator manages standings"
  ON standings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "Tournament creator updates standings"
  ON standings FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );

CREATE POLICY "Tournament creator deletes standings"
  ON standings FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM tournaments WHERE id = tournament_id AND created_by = auth.uid())
  );
