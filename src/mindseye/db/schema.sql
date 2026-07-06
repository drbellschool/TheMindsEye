CREATE TABLE IF NOT EXISTS town_packages (
    package_id TEXT PRIMARY KEY,
    town_name TEXT NOT NULL,
    state_region TEXT NOT NULL,
    start_year INTEGER NOT NULL,
    end_year INTEGER NOT NULL,
    time_window_label TEXT NOT NULL,
    source_manifest TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft', 'pilot', 'production')),
    notes TEXT,
    raw_record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_records (
    source_id TEXT PRIMARY KEY,
    town_package_id TEXT NOT NULL REFERENCES town_packages(package_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    repository TEXT,
    url TEXT,
    citation TEXT NOT NULL,
    rights_status TEXT NOT NULL,
    access_level TEXT NOT NULL,
    accessed_date DATE,
    notes TEXT,
    raw_record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_source_records_town_package_id
    ON source_records(town_package_id);

CREATE TABLE IF NOT EXISTS locations (
    location_id TEXT PRIMARY KEY,
    town_package_id TEXT NOT NULL REFERENCES town_packages(package_id) ON DELETE CASCADE,
    map_id TEXT NOT NULL,
    label TEXT NOT NULL,
    street TEXT,
    location_type TEXT,
    source_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    certainty TEXT,
    notes TEXT,
    raw_record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locations_town_package_id
    ON locations(town_package_id);

CREATE INDEX IF NOT EXISTS idx_locations_map_id
    ON locations(map_id);

CREATE TABLE IF NOT EXISTS claims (
    claim_id TEXT PRIMARY KEY,
    town_package_id TEXT NOT NULL REFERENCES town_packages(package_id) ON DELETE CASCADE,
    claim_text TEXT NOT NULL,
    claim_type TEXT NOT NULL CHECK (
        claim_type IN ('verified_fact', 'source_based_inference', 'fictional_gameplay')
    ),
    confidence TEXT NOT NULL CHECK (
        confidence IN ('high', 'medium', 'low', 'fictional')
    ),
    reasoning_note TEXT NOT NULL,
    student_visible BOOLEAN NOT NULL DEFAULT true,
    teacher_visible BOOLEAN NOT NULL DEFAULT true,
    raw_record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT claims_provenance_boundary CHECK (
        (claim_type = 'fictional_gameplay' AND confidence = 'fictional')
        OR
        (claim_type IN ('verified_fact', 'source_based_inference') AND confidence <> 'fictional')
    )
);

CREATE INDEX IF NOT EXISTS idx_claims_town_package_id
    ON claims(town_package_id);

CREATE INDEX IF NOT EXISTS idx_claims_claim_type
    ON claims(claim_type);

CREATE TABLE IF NOT EXISTS claim_sources (
    claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
    source_id TEXT NOT NULL REFERENCES source_records(source_id) ON DELETE RESTRICT,
    PRIMARY KEY (claim_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_sources_source_id
    ON claim_sources(source_id);

CREATE TABLE IF NOT EXISTS claim_locations (
    claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
    location_id TEXT NOT NULL REFERENCES locations(location_id) ON DELETE RESTRICT,
    PRIMARY KEY (claim_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_locations_location_id
    ON claim_locations(location_id);

CREATE TABLE IF NOT EXISTS mission_seeds (
    mission_id TEXT PRIMARY KEY,
    town_package_id TEXT NOT NULL REFERENCES town_packages(package_id) ON DELETE CASCADE,
    title TEXT,
    teacher_goal TEXT,
    student_hook TEXT NOT NULL,
    teacher_notes TEXT NOT NULL,
    fictional_elements JSONB NOT NULL DEFAULT '[]'::JSONB,
    raw_record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_seeds_town_package_id
    ON mission_seeds(town_package_id);

CREATE TABLE IF NOT EXISTS mission_claims (
    mission_id TEXT NOT NULL REFERENCES mission_seeds(mission_id) ON DELETE CASCADE,
    claim_id TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE RESTRICT,
    PRIMARY KEY (mission_id, claim_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_claims_claim_id
    ON mission_claims(claim_id);

CREATE TABLE IF NOT EXISTS mission_locations (
    mission_id TEXT NOT NULL REFERENCES mission_seeds(mission_id) ON DELETE CASCADE,
    location_id TEXT NOT NULL REFERENCES locations(location_id) ON DELETE RESTRICT,
    PRIMARY KEY (mission_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_locations_location_id
    ON mission_locations(location_id);
