-- 001_create_user_maps.sql
-- Creates the user_maps table for storing community-created district plans.
-- Supports anonymous and authenticated users, soft deletion, and public gallery.

CREATE TABLE user_maps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    author_id TEXT NOT NULL,              -- anonymous session ID or auth user ID
    author_name TEXT DEFAULT 'Anonymous',
    title TEXT NOT NULL DEFAULT 'Untitled Plan',
    description TEXT,
    geojson JSONB NOT NULL,               -- district assignments as FeatureCollection
    metrics JSONB DEFAULT '{}',           -- pre-computed scores for gallery display
    is_public BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ
);

-- Index for gallery queries: public maps sorted by date
CREATE INDEX idx_user_maps_public_created
    ON user_maps (is_public, created_at DESC)
    WHERE deleted_at IS NULL;

-- Index for loading a specific user's maps
CREATE INDEX idx_user_maps_author
    ON user_maps (author_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Row Level Security: users can only edit their own maps, anyone can read public maps
ALTER TABLE user_maps ENABLE ROW LEVEL SECURITY;

-- Policy: anyone can read public, non-deleted maps
CREATE POLICY "Public maps are viewable by everyone"
    ON user_maps FOR SELECT
    USING (is_public = true AND deleted_at IS NULL);

-- Policy: authors can read all their own maps (including private)
CREATE POLICY "Authors can view their own maps"
    ON user_maps FOR SELECT
    USING (author_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: authors can insert their own maps
CREATE POLICY "Authors can create maps"
    ON user_maps FOR INSERT
    WITH CHECK (author_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- Policy: authors can update their own maps
CREATE POLICY "Authors can update their own maps"
    ON user_maps FOR UPDATE
    USING (author_id = current_setting('request.jwt.claims', true)::json->>'sub');
