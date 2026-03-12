/**
 * SQLite store for per-user projects and chat.
 * File: kyn.db in project root (create if missing).
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.KYN_DB_PATH || path.join(__dirname, "kyn.db");

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    last_edited TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',
    package_json TEXT NOT NULL DEFAULT '{}',
    chat_messages TEXT NOT NULL DEFAULT '[]',
    specs TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
`);
try {
  db.exec("ALTER TABLE projects ADD COLUMN specs TEXT NOT NULL DEFAULT '{}'");
} catch (_) {
  /* column may already exist */
}

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  status: string;
  last_edited: string;
  code: string;
  package_json: string;
  chat_messages: string;
  specs: string;
  created_at: number;
};

export function listProjects(userId: string): Omit<ProjectRow, "code" | "package_json" | "chat_messages" | "specs">[] {
  const rows = db.prepare(
    "SELECT id, user_id, name, status, last_edited, created_at FROM projects WHERE user_id = ? ORDER BY created_at DESC"
  ).all(userId) as Omit<ProjectRow, "code" | "package_json" | "chat_messages" | "specs">[];
  return rows;
}

export function countProjects(userId: string): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM projects WHERE user_id = ?").get(userId) as { count: number };
  return row?.count ?? 0;
}

export function getProject(userId: string, projectId: string): ProjectRow | null {
  const row = db.prepare(
    "SELECT * FROM projects WHERE id = ? AND user_id = ?"
  ).get(projectId, userId) as ProjectRow | undefined;
  return row ?? null;
}

export function createProject(userId: string, name: string): ProjectRow {
  const id = crypto.randomUUID();
  const defaultCode = `export default function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Hello from kyn Builder</h1>
      <p>Start editing to see some magic happen!</p>
    </div>
  );
}`;
  const defaultPackageJson = JSON.stringify({ name: "kyn-app", private: true, version: "0.0.0" }, null, 2);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO projects (id, user_id, name, status, last_edited, code, package_json, chat_messages, specs, created_at)
     VALUES (?, ?, ?, 'Draft', ?, ?, ?, '[]', '{}', unixepoch())`
  ).run(id, userId, name, now, defaultCode, defaultPackageJson);
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow;
  return row;
}

export function updateProject(
  userId: string,
  projectId: string,
  updates: {
    name?: string;
    status?: string;
    last_edited?: string;
    code?: string;
    package_json?: string;
    chat_messages?: string;
    specs?: string;
  }
): boolean {
  const project = getProject(userId, projectId);
  if (!project) return false;
  const name = updates.name ?? project.name;
  const status = updates.status ?? project.status;
  const last_edited = updates.last_edited ?? project.last_edited;
  const code = updates.code ?? project.code;
  const package_json = updates.package_json ?? project.package_json;
  const chat_messages = updates.chat_messages ?? project.chat_messages;
  const specs = updates.specs ?? ("specs" in project ? (project as { specs?: string }).specs : undefined) ?? "{}";
  db.prepare(
    `UPDATE projects SET name = ?, status = ?, last_edited = ?, code = ?, package_json = ?, chat_messages = ?, specs = ? WHERE id = ? AND user_id = ?`
  ).run(name, status, last_edited, code, package_json, chat_messages, specs, projectId, userId);
  return true;
}
