-- Session H: Rename sessions.client_name → description
-- The client_name column on sessions was redundant with projects.client_name.
-- It now serves as an optional per-blueprint description (e.g. "Floor Plan", "Electrical").

ALTER TABLE sessions RENAME COLUMN client_name TO description;
ALTER TABLE sessions ALTER COLUMN description DROP NOT NULL;

-- Backfill: NULL out values that were empty strings or inherited from the project's client_name
UPDATE sessions s
SET description = NULL
WHERE description = ''
   OR description = (SELECT client_name FROM projects p WHERE p.id = s.project_id);
