-- ============================================
-- Flash Padel - Fix: Profile creation on signup
-- Execute this in Supabase SQL Editor
-- ============================================

-- Fix 1: Re-create the trigger function with explicit search_path
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

-- Fix 2: Add INSERT policy for profiles (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can insert their own profile'
  ) THEN
    CREATE POLICY "Users can insert their own profile"
      ON profiles FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Fix 3: Ensure the function is owned by postgres to bypass RLS
ALTER FUNCTION handle_new_user() OWNER TO postgres;

-- Fix 4: Delete orphaned auth users from previous failed attempts
DELETE FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles);
