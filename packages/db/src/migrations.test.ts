import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyFlaremoMigrations } from "./test-migrations";

let mf: Miniflare;

describe("D1 populated migration rehearsal", () => {
  beforeEach(async () => {
    mf = new Miniflare({
      script: "export default { fetch() { return new Response('ok') } }",
      modules: true,
      compatibilityDate: "2026-07-10",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { DB: "flaremo-migration-rehearsal" },
    });
  });

  afterEach(async () => {
    await mf.dispose();
  });

  it("preserves tasks and task_activity rows through 0025 table recreation", async () => {
    const db = await mf.getD1Database("DB");

    // 1. Run migrations up to strictly before 0025
    await applyFlaremoMigrations(db, { beforeTag: "0025_" });

    // Enable foreign keys explicitly to simulate real SQLite/D1 constraints
    await db.prepare("PRAGMA foreign_keys = ON;").run();

    // 2. Seed populated data in the pre-0025 schema
    const now = new Date().toISOString();
    await db
      .prepare(
        "INSERT INTO users (id, email, name, status, created_at, updated_at) VALUES ('users/u1', 'test@example.com', 'Tester', 'active', ?, ?)",
      )
      .bind(now, now)
      .run();

    await db
      .prepare(
        "INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES ('projects/p1', 'users/u1', 'Alpha Project', ?, ?)",
      )
      .bind(now, now)
      .run();

    await db
      .prepare(
        "INSERT INTO tasks (id, user_id, project_id, title, notes, status, priority, due_at, sort_order, created_at, updated_at) VALUES (?, 'users/u1', 'projects/p1', ?, NULL, 'todo', 'none', NULL, 0, ?, ?)",
      )
      .bind("tasks/t1", "Task One", now, now)
      .run();

    await db
      .prepare(
        "INSERT INTO tasks (id, user_id, project_id, title, notes, status, priority, due_at, sort_order, created_at, updated_at) VALUES (?, 'users/u1', 'projects/p1', ?, NULL, 'done', 'high', NULL, 1, ?, ?)",
      )
      .bind("tasks/t2", "Task Two", now, now)
      .run();

    // 4 task activities: 3 bound to tasks, 1 project-level unbound (task_id IS NULL)
    await db
      .prepare(
        "INSERT INTO task_activity (task_id, user_id, actor_type, action, changes, created_at) VALUES ('tasks/t1', 'users/u1', 'user', 'created', '{}', ?)",
      )
      .bind(now)
      .run();

    await db
      .prepare(
        "INSERT INTO task_activity (task_id, user_id, actor_type, action, changes, created_at) VALUES ('tasks/t1', 'users/u1', 'user', 'status_changed', '{\"status\":\"in_progress\"}', ?)",
      )
      .bind(now)
      .run();

    await db
      .prepare(
        "INSERT INTO task_activity (task_id, user_id, actor_type, action, changes, created_at) VALUES ('tasks/t2', 'users/u1', 'user', 'created', '{}', ?)",
      )
      .bind(now)
      .run();

    await db
      .prepare(
        "INSERT INTO task_activity (task_id, user_id, actor_type, action, changes, created_at) VALUES (NULL, 'users/u1', 'user', 'reordered', '{}', ?)",
      )
      .bind(now)
      .run();

    const beforeTasksCount = await db
      .prepare("SELECT count(*) as count FROM tasks")
      .first<{ count: number }>();
    const beforeActivityCount = await db
      .prepare("SELECT count(*) as count FROM task_activity")
      .first<{ count: number }>();

    expect(beforeTasksCount?.count).toBe(2);
    expect(beforeActivityCount?.count).toBe(4);

    // 3. Apply 0025 and all subsequent migrations
    await applyFlaremoMigrations(db, { fromTag: "0025_" });

    // 4. Assert row-count conservation
    const afterTasksCount = await db
      .prepare("SELECT count(*) as count FROM tasks")
      .first<{ count: number }>();
    const afterActivityCount = await db
      .prepare("SELECT count(*) as count FROM task_activity")
      .first<{ count: number }>();

    expect(afterTasksCount?.count).toBe(2);
    // Task activity MUST NOT be cascade deleted by 0025 tasks recreation
    expect(afterActivityCount?.count).toBe(4);

    const activityRows = await db
      .prepare("SELECT id, task_id, action FROM task_activity ORDER BY id ASC")
      .all<{ id: number; task_id: string | null; action: string }>();
    expect(activityRows.results).toEqual([
      { id: 1, task_id: "tasks/t1", action: "created" },
      { id: 2, task_id: "tasks/t1", action: "status_changed" },
      { id: 3, task_id: "tasks/t2", action: "created" },
      { id: 4, task_id: null, action: "reordered" },
    ]);

    // 5. Assert foreign key integrity is intact (no orphaned foreign keys)
    const fkErrors = await db
      .prepare("PRAGMA foreign_key_check;")
      .all<{ table: string; rowid: number; parent: string; fkid: number }>();
    expect(fkErrors.results.length).toBe(0);

    // 6. Assert post-0025 features: standalone task with NULL project_id, deleted_at, source_memo_id
    await db
      .prepare(
        "INSERT INTO tasks (id, user_id, project_id, title, notes, status, priority, due_at, sort_order, deleted_at, source_memo_id, created_at, updated_at) VALUES ('tasks/t3', 'users/u1', NULL, 'Standalone Task', NULL, 'todo', 'none', NULL, 2, NULL, 'memos/m1', ?, ?)",
      )
      .bind(now, now)
      .run();

    const standaloneTask = await db
      .prepare(
        "SELECT id, project_id, source_memo_id FROM tasks WHERE id = 'tasks/t3'",
      )
      .first<{
        id: string;
        project_id: string | null;
        source_memo_id: string | null;
      }>();

    expect(standaloneTask?.project_id).toBeNull();
    expect(standaloneTask?.source_memo_id).toBe("memos/m1");
  });
});
