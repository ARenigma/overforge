# Database schema & seed (Supabase)

These SQL files are the **source of truth for the parts of the schema that are
applied manually to Supabase**. They are *not* run by `sequelize-cli` — the
sequelize migrations in `backend/migrations/` only cover users, rooms, and
interview sessions. The questions system and problem-solutions tables live here.

Apply (psql / Supabase SQL editor) in this order against a fresh database:

1. `create-questions-system-tables.sql` — core questions-system tables
2. `create-questions-system-addon.sql` — additional tables/columns
3. `create-problem-solutions-table.sql` — problem_solutions (backs the
   comparative-approach questioning in `problemSolutionsService`)
4. `create-indexes-and-functions.sql` — indexes + stored functions (needs tables)
5. `seed-questions-data.sql` — seed data
6. `seed-questions-data-addon.sql` — additional seed data

Notes
- Idempotency is not guaranteed; review before re-running on a populated DB.
- New schema changes should be added here (with the apply order updated) or, for
  the sequelize-managed tables, as a migration in `backend/migrations/`.
