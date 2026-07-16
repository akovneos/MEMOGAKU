import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, query } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersPath = path.join(__dirname, "../users.json");
const notesPath = path.join(__dirname, "../notes.json");

const readJson = async (filePath) => {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
};

const toTags = (value) => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  return [];
};

const migrate = async () => {
  await initDb();

  const users = await readJson(usersPath);
  const notes = await readJson(notesPath);
  const idMap = new Map();

  for (const user of users) {
    if (!user.email || !user.passwordHash?.salt || !user.passwordHash?.hash) {
      continue;
    }

    const result = await query(
      `INSERT INTO users
        (username, email, password_salt, password_hash, school_name, learning_goal)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         username = EXCLUDED.username,
         school_name = EXCLUDED.school_name,
         learning_goal = EXCLUDED.learning_goal
       RETURNING id`,
      [
        user.username || "user",
        String(user.email).trim().toLowerCase(),
        user.passwordHash.salt,
        user.passwordHash.hash,
        user.schoolName || "",
        user.learningGoal || ""
      ]
    );

    idMap.set(String(user.id), String(result.rows[0].id));
  }

  for (const note of notes) {
    const userId = idMap.get(String(note.userId));

    if (!userId || !note.title || !note.subject || !note.content) {
      continue;
    }

    await query(
      `INSERT INTO notes
        (user_id, title, subject, content, study_date, understanding, review_date, tags, memo, ai_summary, review_questions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::jsonb)`,
      [
        userId,
        note.title,
        note.subject,
        note.content,
        note.studyDate || "",
        note.understandingLevel || note.understanding || "普通",
        note.nextReviewDate || note.reviewDate || "",
        JSON.stringify(toTags(note.tags)),
        note.memo || "",
        note.aiSummary || "",
        JSON.stringify(Array.isArray(note.reviewQuestions) ? note.reviewQuestions : [])
      ]
    );
  }

  console.log(`Migrated ${idMap.size} users and ${notes.length} notes from JSON.`);
  process.exit(0);
};

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
