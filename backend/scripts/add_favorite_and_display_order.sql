-- Phase 2.5: Add is_favorite and display_order to refrigerator_members, display_order to storage_boxes

ALTER TABLE refrigerator_members ADD COLUMN is_favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE refrigerator_members ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE storage_boxes ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
