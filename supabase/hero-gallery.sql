-- Hero Gallery table for homepage image carousel (10 slots)
CREATE TABLE IF NOT EXISTS hero_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 10),
  image_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hero_gallery_position ON hero_gallery (position);

ALTER TABLE hero_gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated insert hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated update hero gallery" ON hero_gallery;
DROP POLICY IF EXISTS "Authenticated delete hero gallery" ON hero_gallery;

CREATE POLICY "Public read hero gallery" ON hero_gallery FOR SELECT USING (true);
CREATE POLICY "Authenticated insert hero gallery" ON hero_gallery FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update hero gallery" ON hero_gallery FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated delete hero gallery" ON hero_gallery FOR DELETE USING (auth.role() = 'authenticated');

GRANT ALL ON hero_gallery TO authenticated;
GRANT SELECT ON hero_gallery TO anon;
