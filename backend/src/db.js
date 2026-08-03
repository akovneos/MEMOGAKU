import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const rawConnectionString = process.env.DATABASE_URL || "";
const isSupabaseConnection = rawConnectionString.includes("supabase.com");
const connectionString = isSupabaseConnection
  ? rawConnectionString.replace(/([?&])sslmode=[^&]*&?/, (_, separator) => (separator === "?" ? "?" : ""))
    .replace(/[?&]$/, "")
  : rawConnectionString;

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        // Supabase pooler uses a certificate chain that Node.js may not include by default.
        // sslmode in the URL is removed above because it overrides this pg setting.
        ssl: isSupabaseConnection ? { rejectUnauthorized: false } : undefined
      }
    : {
        host: process.env.DB_HOST || "localhost",
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || "learning_memo_ai",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || ""
      }
);

export const query = (text, params) => pool.query(text, params);

export const initDb = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      school_name TEXT NOT NULL DEFAULT '',
      learning_goal TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notes (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      study_date TEXT NOT NULL DEFAULT '',
      study_minutes INTEGER NOT NULL DEFAULT 0,
      understanding TEXT NOT NULL DEFAULT '普通',
      review_date TEXT NOT NULL DEFAULT '',
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      memo TEXT NOT NULL DEFAULT '',
      is_learned BOOLEAN NOT NULL DEFAULT FALSE,
      ai_summary TEXT NOT NULL DEFAULT '',
      review_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_advices (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      advice_date TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, advice_date)
    );

    ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS study_minutes INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE notes
      ADD COLUMN IF NOT EXISTS is_learned BOOLEAN NOT NULL DEFAULT FALSE;
  `);
};

export const mapUser = (row) => row && ({
  id: String(row.id),
  username: row.username,
  email: row.email,
  passwordHash: {
    salt: row.password_salt,
    hash: row.password_hash
  },
  schoolName: row.school_name || "",
  learningGoal: row.learning_goal || ""
});

export const mapNote = (row) => row && ({
  id: String(row.id),
  userId: String(row.user_id),
  title: row.title || "",
  subject: row.subject || "",
  content: row.content || "",
  studyDate: row.study_date || "",
  studyMinutes: Number(row.study_minutes || 0),
  understanding: row.understanding || "普通",
  reviewDate: row.review_date || "",
  tags: Array.isArray(row.tags) ? row.tags : [],
  memo: row.memo || "",
  isLearned: Boolean(row.is_learned),
  aiSummary: row.ai_summary || "",
  reviewQuestions: Array.isArray(row.review_questions) ? row.review_questions : [],
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : ""
});
