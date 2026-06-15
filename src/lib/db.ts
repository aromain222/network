import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Contact, Message } from './types';

const DB_PATH = path.join(process.cwd(), 'data', 'network.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      tags TEXT NOT NULL DEFAULT '[]',
      hook TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      dateAdded TEXT NOT NULL,
      message_sent TEXT NOT NULL DEFAULT '',
      linkedin_url TEXT NOT NULL DEFAULT '',
      followup_date TEXT DEFAULT NULL
    )
  `);

  const cols = _db.prepare("PRAGMA table_info(contacts)").all() as { name: string }[];
  if (!cols.some(c => c.name === 'followup_date')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN followup_date TEXT DEFAULT NULL");
  }
  if (!cols.some(c => c.name === 'last_touch_date')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN last_touch_date TEXT DEFAULT NULL");
  }
  if (!cols.some(c => c.name === 'met_date')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN met_date TEXT DEFAULT NULL");
  }
  if (!cols.some(c => c.name === 'google_event_id')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN google_event_id TEXT DEFAULT NULL");
  }
  if (!cols.some(c => c.name === 'phone')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN phone TEXT DEFAULT NULL");
  }
  if (!cols.some(c => c.name === 'email')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN email TEXT DEFAULT NULL");
  }
  if (!cols.some(c => c.name === 'tier')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN tier INTEGER DEFAULT 3");
  }
  if (!cols.some(c => c.name === 'warmth')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN warmth TEXT DEFAULT 'cold'");
  }
  if (!cols.some(c => c.name === 'relevance_score')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN relevance_score REAL DEFAULT 0");
  }
  if (!cols.some(c => c.name === 'shared_background')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN shared_background TEXT DEFAULT NULL");
  }
  if (!cols.some(c => c.name === 'source')) {
    _db.exec("ALTER TABLE contacts ADD COLUMN source TEXT DEFAULT 'crm'");
  }

  _db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      channel TEXT NOT NULL,
      body TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      meta TEXT,
      FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    )
  `);
  _db.exec("CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_id, timestamp)");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS google_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date INTEGER,
      scope TEXT,
      email TEXT,
      connected_at TEXT NOT NULL
    )
  `);

  // Career-OS extensions: goals, outreach approval queue, opportunities, daily metrics, brief snapshots
  _db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      weight REAL NOT NULL DEFAULT 1.0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS outreach_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      angle TEXT,
      ask TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      approved_at TEXT,
      sent_at TEXT
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      company TEXT,
      url TEXT,
      source TEXT,
      relevance_score REAL DEFAULT 0,
      discovered_at TEXT DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'open'
    );

    CREATE TABLE IF NOT EXISTS metrics_daily (
      day TEXT PRIMARY KEY,
      prospects_discovered INTEGER DEFAULT 0,
      outreach_sent INTEGER DEFAULT 0,
      replies_received INTEGER DEFAULT 0,
      meetings_scheduled INTEGER DEFAULT 0,
      meetings_completed INTEGER DEFAULT 0,
      referrals_received INTEGER DEFAULT 0,
      opportunities_generated INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS briefs (
      day TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      generated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_queue(status);
    CREATE INDEX IF NOT EXISTS idx_contacts_tier_warmth ON contacts(tier, warmth);
  `);

  // One-time backfill: infer warmth/tier from existing status so legacy rows don't
  // all read as cold/T3. Only runs when zero non-default rows exist.
  const needsBackfill = (_db.prepare(
    "SELECT COUNT(*) as n FROM contacts WHERE warmth != 'cold' OR tier != 3"
  ).get() as { n: number }).n === 0
    && (_db.prepare('SELECT COUNT(*) as n FROM contacts').get() as { n: number }).n > 0;
  if (needsBackfill) {
    _db.exec(`
      UPDATE contacts
      SET warmth = CASE
          WHEN status IN ('completed', 'scheduled', 'replied') THEN 'warm'
          ELSE 'cold'
        END,
        tier = CASE
          WHEN status IN ('completed', 'scheduled', 'replied') THEN 1
          WHEN hook != '' THEN 2
          ELSE 3
        END
    `);
  }

  // Seed default goals once
  const goalCount = (_db.prepare('SELECT COUNT(*) as n FROM goals').get() as { n: number }).n;
  if (goalCount === 0) {
    const seed = _db.prepare('INSERT INTO goals (label, weight, active) VALUES (?, ?, 1)');
    const defaults: Array<[string, number]> = [
      ['AI', 1.0],
      ['Fintech', 0.9],
      ['Venture Capital', 0.7],
      ['Forward Deployed Engineering', 1.0],
      ['Solutions Architecture', 0.95],
      ['Product Management', 0.85],
      ['Startup Operations', 0.7],
      ['Customer-Facing Technical Roles', 0.95],
    ];
    for (const [label, weight] of defaults) seed.run(label, weight);
  }

  const count = (_db.prepare('SELECT COUNT(*) as n FROM contacts').get() as { n: number }).n;
  if (count === 0) {
    const jsonPath = path.join(process.cwd(), 'data', 'contacts.json');
    if (fs.existsSync(jsonPath)) {
      const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Contact[];
      const insert = _db.prepare(
        `INSERT OR IGNORE INTO contacts (id, name, company, role, status, tags, hook, notes, dateAdded, message_sent, linkedin_url)
         VALUES (@id, @name, @company, @role, @status, @tags, @hook, @notes, @dateAdded, @message_sent, @linkedin_url)`
      );
      const tx = _db.transaction((contacts: Contact[]) => {
        for (const c of contacts) {
          insert.run({
            ...c,
            tags: JSON.stringify(c.tags ?? []),
            message_sent: c.message_sent ?? '',
            linkedin_url: c.linkedin_url ?? '',
          });
        }
      });
      tx(raw);
    }
  }

  return _db;
}

function rowToContact(row: Record<string, unknown>): Contact {
  const warmth = (row.warmth as Contact['warmth']) || 'cold';
  const tier = (row.tier as Contact['tier']) ?? 3;
  return {
    ...(row as unknown as Contact),
    tags: JSON.parse(row.tags as string),
    followup_date: (row.followup_date as string) || undefined,
    last_touch_date: (row.last_touch_date as string) || undefined,
    met_date: (row.met_date as string) || undefined,
    phone: (row.phone as string) || undefined,
    email: (row.email as string) || undefined,
    tier,
    warmth,
    relevance_score: (row.relevance_score as number) ?? 0,
    shared_background: (row.shared_background as string) || undefined,
    source: (row.source as string) || 'crm',
  };
}

export { rowToContact };

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getAllContacts(): Contact[] {
  const rows = getDb().prepare('SELECT * FROM contacts ORDER BY dateAdded DESC').all();
  return rows.map(r => rowToContact(r as Record<string, unknown>));
}

export function createContact(data: Omit<Contact, 'id'>): Contact {
  const id = crypto.randomUUID();
  getDb().prepare(
    `INSERT INTO contacts (
      id, name, company, role, status, tags, hook, notes, dateAdded,
      message_sent, linkedin_url, followup_date, last_touch_date, met_date, phone, email
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, data.name, data.company, data.role, data.status, JSON.stringify(data.tags ?? []),
    data.hook, data.notes, data.dateAdded, data.message_sent ?? '', data.linkedin_url ?? '',
    data.followup_date ?? null, data.last_touch_date ?? null, data.met_date ?? null,
    data.phone ?? null, data.email ?? null);
  return { id, ...data, tags: data.tags ?? [], message_sent: data.message_sent ?? '', linkedin_url: data.linkedin_url ?? '' };
}

export function updateContact(id: string, updates: Partial<Contact>): Contact | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) return null;

  const merged = { ...rowToContact(existing), ...updates };
  db.prepare(
    `UPDATE contacts SET name=?, company=?, role=?, status=?, tags=?, hook=?, notes=?, dateAdded=?, message_sent=?, linkedin_url=?, followup_date=?, last_touch_date=?, met_date=?, phone=?, email=?
     WHERE id=?`
  ).run(merged.name, merged.company, merged.role, merged.status, JSON.stringify(merged.tags),
    merged.hook, merged.notes, merged.dateAdded, merged.message_sent, merged.linkedin_url,
    merged.followup_date ?? null, merged.last_touch_date ?? null, merged.met_date ?? null,
    merged.phone ?? null, merged.email ?? null, id);
  return merged;
}

export function findContactByName(name: string): Contact | null {
  const row = getDb().prepare('SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)').get(name) as Record<string, unknown> | undefined;
  return row ? rowToContact(row) : null;
}

export function deleteContact(id: string): void {
  getDb().prepare('DELETE FROM contacts WHERE id = ?').run(id);
}

export type GoogleTokens = {
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
  scope: string | null;
  email: string | null;
  connected_at: string;
};

export function getGoogleTokens(): GoogleTokens | null {
  const row = getDb().prepare('SELECT access_token, refresh_token, expiry_date, scope, email, connected_at FROM google_tokens WHERE id = 1').get() as GoogleTokens | undefined;
  return row || null;
}

export function saveGoogleTokens(t: { access_token: string; refresh_token?: string | null; expiry_date?: number | null; scope?: string | null; email?: string | null }): void {
  const existing = getGoogleTokens();
  const refresh = t.refresh_token ?? existing?.refresh_token ?? null;
  getDb().prepare(`
    INSERT INTO google_tokens (id, access_token, refresh_token, expiry_date, scope, email, connected_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, refresh_token),
      expiry_date = excluded.expiry_date,
      scope = excluded.scope,
      email = COALESCE(excluded.email, email),
      connected_at = excluded.connected_at
  `).run(t.access_token, refresh, t.expiry_date ?? null, t.scope ?? null, t.email ?? null, new Date().toISOString());
}

export function clearGoogleTokens(): void {
  getDb().prepare('DELETE FROM google_tokens WHERE id = 1').run();
}

export function setContactGoogleEventId(contactId: string, eventId: string): void {
  getDb().prepare('UPDATE contacts SET google_event_id = ? WHERE id = ?').run(eventId, contactId);
}

export function getMessages(contactId: string): Message[] {
  const rows = getDb().prepare('SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp ASC').all(contactId) as Message[];
  return rows;
}

export function createMessage(m: Omit<Message, 'id'> & { id?: string }): Message {
  const id = m.id || crypto.randomUUID();
  getDb().prepare(
    `INSERT INTO messages (id, contact_id, direction, channel, body, timestamp, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, m.contact_id, m.direction, m.channel, m.body, m.timestamp, m.meta ?? null);
  return { id, ...m } as Message;
}

export function deleteMessage(id: string): void {
  getDb().prepare('DELETE FROM messages WHERE id = ?').run(id);
}

export function deleteMessagesForContact(contactId: string): void {
  getDb().prepare('DELETE FROM messages WHERE contact_id = ?').run(contactId);
}
