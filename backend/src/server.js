import crypto from "crypto";
import { createRequire } from "module";
import cors from "cors";
import express from "express";
import { initDb, mapNote, mapUser, query } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const require = createRequire(import.meta.url);
const { recognize } = require("tesseract.js");
const tokenSecret = process.env.AUTH_SECRET || "learning-memo-dev-secret";
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const geminiModel = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const toTags = (value) => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }

  return [];
};

const normalizeNote = (note) => ({
  id: note.id,
  userId: note.userId,
  title: note.title || "",
  subject: note.subject || "",
  content: note.content || "",
  studyDate: note.studyDate || "",
  studyMinutes: Math.max(0, Number.parseInt(note.studyMinutes, 10) || 0),
  understanding: note.understanding || "普通",
  reviewDate: note.reviewDate || "",
  tags: toTags(note.tags),
  memo: note.memo || "",
  isLearned: Boolean(note.isLearned),
  aiSummary: note.aiSummary || "",
  reviewQuestions: Array.isArray(note.reviewQuestions) ? note.reviewQuestions : []
});

const importFingerprint = (note) => [note.title, note.content, note.studyDate].join("\u0000");
const isValidImportedDateTime = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeImportedNote = (note) => {
  const source = note && typeof note === "object" ? note : {};
  const normalized = normalizeNote({
    title: typeof source.title === "string" ? source.title : "",
    subject: typeof source.subject === "string" ? source.subject : "",
    content: typeof source.content === "string" ? source.content : "",
    studyDate: typeof source.studyDate === "string" ? source.studyDate : "",
    studyMinutes: source.studyMinutes,
    understanding: typeof source.understanding === "string" ? source.understanding : "普通",
    reviewDate: typeof source.reviewDate === "string" ? source.reviewDate : typeof source.nextReviewDate === "string" ? source.nextReviewDate : "",
    tags: source.tags,
    memo: typeof source.memo === "string" ? source.memo : "",
    isLearned: source.isLearned,
    aiSummary: typeof source.aiSummary === "string" ? source.aiSummary : "",
    reviewQuestions: Array.isArray(source.reviewQuestions) ? source.reviewQuestions : []
  });

  return {
    ...normalized,
    title: normalized.title.trim().slice(0, 200),
    subject: normalized.subject.trim().slice(0, 200),
    content: normalized.content.trim().slice(0, 50000),
    memo: normalized.memo.slice(0, 20000),
    aiSummary: normalized.aiSummary.slice(0, 50000),
    reviewQuestions: normalized.reviewQuestions
      .map((question) => String(question).trim().slice(0, 1000))
      .filter(Boolean)
      .slice(0, 20),
    createdAt: isValidImportedDateTime(source.createdAt),
    updatedAt: isValidImportedDateTime(source.updatedAt)
  };
};

const publicUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  schoolName: user.schoolName || "",
  learningGoal: user.learningGoal || ""
});

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return { salt, hash };
};

const verifyPassword = (password, passwordHash) => {
  if (!passwordHash?.salt || !passwordHash?.hash) {
    return false;
  }

  const hash = crypto.pbkdf2Sync(password, passwordHash.salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(passwordHash.hash, "hex"));
};

const createToken = (userId) => {
  const payload = Buffer.from(JSON.stringify({
    userId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
};

const verifyToken = (token) => {
  try {
    const [payload, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }

    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return data.expiresAt > Date.now() ? data : null;
  } catch (error) {
    return null;
  }
};

const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    return res.status(401).json({ message: "ログインが必要です。" });
  }

  const result = await query("SELECT * FROM users WHERE id = $1", [payload.userId]);
  const user = mapUser(result.rows[0]);

  if (!user) {
    return res.status(401).json({ message: "ユーザーが見つかりません。" });
  }

  req.user = user;
  next();
};

const makeSummary = (note) => {
  const firstLine = note.content.split(/\n|。/).find((line) => line.trim())?.trim() || note.content;
  return `要約:\n${note.title}は「${note.subject}」についての学習メモです。重要な内容は「${firstLine}」です。\n\n学習アドバイス:\n復習するときは、内容を自分の言葉で説明できるか確認し、具体例を1つ作って理解を深めましょう。`;
};

const splitSummaryAdviceText = (value) => {
  const text = String(value || "").trim();
  const labels = Array.from(text.matchAll(/(要約|学習アドバイス)\s*[:：]/g));
  const firstSummaryLabel = labels.find((label) => label[1] === "要約");
  const firstAdviceLabel = labels.find((label) => label[1] === "学習アドバイス" && (!firstSummaryLabel || label.index > firstSummaryLabel.index));
  const lastAdviceLabel = [...labels].reverse().find((label) => label[1] === "学習アドバイス");

  if (firstSummaryLabel && firstAdviceLabel) {
    return {
      summary: text.slice(firstSummaryLabel.index + firstSummaryLabel[0].length, firstAdviceLabel.index).trim(),
      advice: text.slice(lastAdviceLabel.index + lastAdviceLabel[0].length).trim()
    };
  }

  if (firstSummaryLabel) {
    return { summary: text.slice(firstSummaryLabel.index + firstSummaryLabel[0].length).trim(), advice: "" };
  }

  if (lastAdviceLabel) {
    return { summary: "", advice: text.slice(lastAdviceLabel.index + lastAdviceLabel[0].length).trim() };
  }

  return { summary: text, advice: "" };
};

const formatSummaryAdvice = (summary, advice = "") => {
  const normalizedSummary = splitSummaryAdviceText(summary);
  const normalizedAdvice = splitSummaryAdviceText(advice);
  const summaryText = normalizedSummary.summary || normalizedSummary.advice || String(summary || "").trim();
  const adviceText = normalizedAdvice.advice || normalizedAdvice.summary || normalizedSummary.advice || String(advice || "").trim();

  return `要約:\n${summaryText || "要約はありません。"}\n\n学習アドバイス:\n${adviceText || "復習するときは、重要なポイントを自分の言葉で説明し、具体例を作って理解を深めましょう。"}`;
};

const makeReviewQuestions = (note) => [
  `Q1. ${note.title}の目的や意味は何ですか？`,
  `Q2. ${note.subject}の中で、今回いちばん重要なポイントは何ですか？`,
  "Q3. 学習した内容を使う例を1つ説明してください。"
];

const getGeminiText = async (prompt) => {
  if (!geminiApiKey) {
    return "";
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.4
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error?.message || "Gemini API request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
};

const extractJson = (text) => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
};

const makeGeminiSummary = async (note) => {
  const prompt = `
あなたは日本語の学習サポートAIです。
次の学習メモについて、初心者向けに「要約」と「学習アドバイス」を作成してください。
学習アドバイスには、次に復習するべき点、理解を深めるための練習方法、注意点を含めてください。
必ずJSONだけで返してください。

形式:
{"summary":"...","advice":"..."}

最終的にアプリへ保存される文章は次の形にします。
summaryには要約本文だけ、adviceには学習アドバイス本文だけを書いてください。
要約:
内容

学習アドバイス:
内容

タイトル: ${note.title}
科目: ${note.subject}
理解度: ${note.understanding}
内容:
${note.content}
メモ:
${note.memo || "なし"}
`;
  const text = await getGeminiText(prompt);

  if (!text) {
    return makeSummary(note);
  }

  try {
    const parsed = extractJson(text);
    return formatSummaryAdvice(parsed.summary, parsed.advice);
  } catch (error) {
    return formatSummaryAdvice(text) || makeSummary(note);
  }
};

const makeGeminiReviewQuestions = async (note) => {
  const prompt = `
あなたは復習問題を作成する日本語の学習サポートAIです。
次の学習メモから、初心者が理解確認できる復習問題を3問作ってください。
問題は短く、答えを直接書かないでください。
必ずJSONだけで返してください。

形式:
{"questions":["Q1. ...","Q2. ...","Q3. ..."]}

タイトル: ${note.title}
科目: ${note.subject}
理解度: ${note.understanding}
内容:
${note.content}
メモ:
${note.memo || "なし"}
`;
  const text = await getGeminiText(prompt);

  if (!text) {
    return makeReviewQuestions(note);
  }

  try {
    const questions = extractJson(text).questions;
    return Array.isArray(questions) && questions.length ? questions.slice(0, 5) : makeReviewQuestions(note);
  } catch (error) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 5);
  }
};

const getSavedCheckQuestions = (notes) =>
  notes
    .flatMap((note) =>
      (note.reviewQuestions || []).map((question, questionIndex) => ({
        id: `${note.id}-${questionIndex + 1}`,
        noteId: note.id,
        question: String(question).replace(/^Q\d+\.\s*/, ""),
        noteTitle: note.title,
        subject: note.subject
      }))
    )
    .filter((item) => item.question.trim())
    .sort(() => Math.random() - 0.5)
    .slice(0, 10);


const makeFallbackCheckEvaluation = (answers) => {
  const answeredCount = answers.filter((item) => item.answer?.trim()).length;
  const score = Math.min(100, Math.round((answeredCount / 10) * 80 + (answeredCount === 10 ? 20 : 0)));

  return {
    score,
    level: score >= 80 ? "よく理解できています" : score >= 50 ? "もう少し復習しましょう" : "復習が必要です",
    summary: `10問中${answeredCount}問に回答しました。回答した内容をもう一度メモと比べて確認しましょう。`,
    goodPoints: answeredCount > 0 ? ["自分の言葉で回答しようとしています。"] : [],
    reviewPoints: answeredCount < 10 ? ["未回答の問題を埋めましょう。"] : ["説明が短い問題は、具体例を追加しましょう。"],
    advice: "間違えた問題や説明しにくかった問題を、もう一度学習メモで確認してください。",
    nextSteps: answeredCount < 10
      ? ["未回答の問題を1問ずつ埋める", "関連する学習メモを開いて内容を確認する"]
      : ["説明しにくかった問題を1つ選び、具体例を追加して答え直す", "明日もう一度、同じメモの復習問題に取り組む"]
  };
};

const makeGeminiCheckEvaluation = async (answers) => {
  const answerText = answers
    .map((item, index) => `
Q${index + 1}. ${item.question}
回答: ${item.answer || "未回答"}
関連メモ: ${item.noteTitle || "なし"} / ${item.subject || "なし"}
`)
    .join("\n");
  const prompt = `
あなたは日本語の学習コーチAIです。
ユーザーの理解度チェック回答を評価してください。
厳しすぎず、初心者にもわかりやすい言葉で返してください。
点数は0から100で付けてください。
必ずJSONだけで返してください。

形式:
{
  "score":80,
  "level":"...",
  "summary":"...",
  "goodPoints":["..."],
  "reviewPoints":["..."],
  "advice":"...",
  "nextSteps":["今日できる具体的な行動1つ", "次回の復習に向けた行動1つ"]
}

回答:
${answerText}
`;
  const text = await getGeminiText(prompt);

  if (!text) {
    return makeFallbackCheckEvaluation(answers);
  }

  try {
    const parsed = extractJson(text);

    return {
      score: Math.max(0, Math.min(100, Number.parseInt(parsed.score, 10) || 0)),
      level: parsed.level || "評価結果",
      summary: parsed.summary || "",
      goodPoints: Array.isArray(parsed.goodPoints) ? parsed.goodPoints : [],
      reviewPoints: Array.isArray(parsed.reviewPoints) ? parsed.reviewPoints : [],
      advice: parsed.advice || "",
      nextSteps: Array.isArray(parsed.nextSteps) ? parsed.nextSteps.slice(0, 3) : []
    };
  } catch (error) {
    return makeFallbackCheckEvaluation(answers);
  }
};

const buildDailyLearningStats = (notes) => {
  const today = getTodayText();
  const activeNotes = notes.filter((note) => !note.isLearned);
  const addedToday = activeNotes.filter((note) => String(note.createdAt || "").slice(0, 10) === today);
  const todayLearning = activeNotes.filter((note) => note.studyDate === today || note.reviewDate === today);
  const difficult = activeNotes.filter((note) => ["やや難しい", "難しい", "まだ難しい"].includes(note.understanding));
  const normal = activeNotes.filter((note) => note.understanding === "普通");
  const easy = activeNotes.filter((note) => note.understanding === "よく理解した");
  const learned = notes.filter((note) => note.isLearned);

  return {
    today,
    total: notes.length,
    active: activeNotes.length,
    addedToday: addedToday.length,
    todayLearning: todayLearning.length,
    difficult: difficult.length,
    normal: normal.length,
    easy: easy.length,
    learned: learned.length,
    difficultTitles: difficult.slice(0, 5).map((note) => note.title),
    reviewTitles: todayLearning.slice(0, 5).map((note) => note.title)
  };
};

const makeFallbackDailyAdvice = (stats) => {
  if (stats.total === 0) {
    return "今日はまだ学習メモがありません。まずは1つだけ学習メモを登録して、あとでAI要約・学習アドバイスを作成しましょう。";
  }

  if (stats.todayLearning > 0) {
    const titles = stats.reviewTitles.length ? `対象: ${stats.reviewTitles.join("、")}。` : "";
    return `今日は${stats.todayLearning}件の学習・復習対象があります。${titles}まずは短く読み返し、説明できない部分だけ詳しく復習しましょう。`;
  }

  if (stats.difficult > 0) {
    const titles = stats.difficultTitles.length ? `特に「${stats.difficultTitles[0]}」から確認するとよいです。` : "";
    return `まだ難しいメモが${stats.difficult}件あります。${titles}今日は新しい内容を増やしすぎず、1つのテーマを自分の言葉で説明する練習をしましょう。`;
  }

  return `復習済みは${stats.learned}件、学習済メモは${stats.easy}件です。順調です。今日は1つ新しいメモを追加するか、復習問題で理解度チェックを行いましょう。`;
};

const makeGeminiDailyAdvice = async (notes) => {
  const stats = buildDailyLearningStats(notes);
  const prompt = `
あなたは日本語の学習コーチAIです。
学習メモアプリのダッシュボードに表示する「今日の学習アドバイス」を作成してください。
初心者にもわかりやすく、短く、具体的にしてください。
長すぎる文章にせず、3〜5文で返してください。
JSONではなく、本文だけ返してください。

今日: ${stats.today}
合計メモ数: ${stats.total}
未完了メモ数: ${stats.active}
本日追加したメモ: ${stats.addedToday}
本日の学習対象: ${stats.todayLearning}
普通: ${stats.normal}
まだ難しい: ${stats.difficult}
よく理解した: ${stats.easy}
学習済み: ${stats.learned}
本日の学習対象タイトル: ${stats.reviewTitles.join("、") || "なし"}
まだ難しいタイトル: ${stats.difficultTitles.join("、") || "なし"}
`;
  try {
    const text = await getGeminiText(prompt);
    return text?.trim() || makeFallbackDailyAdvice(stats);
  } catch (error) {
    return makeFallbackDailyAdvice(stats);
  }
};

const makeStudyChatReply = async ({ message, history, notes }) => {
  const safeMessage = String(message || "").trim();
  const safeHistory = Array.isArray(history) ? history.slice(-8) : [];
  const noteContext = notes.slice(0, 8).map((note, index) => {
    const normalized = normalizeNote(note);
    return `${index + 1}. ${normalized.title} / ${normalized.subject} / ${normalized.understanding}
内容: ${normalized.content.slice(0, 240)}
メモ: ${(normalized.memo || "なし").slice(0, 160)}`;
  }).join("\n\n");

  const chatHistory = safeHistory.map((item) => {
    const role = item.role === "assistant" ? "AI" : "ユーザー";
    return `${role}: ${String(item.content || "").slice(0, 500)}`;
  }).join("\n");

  const prompt = `
あなたは学習メモAI管理アプリの学習コーチです。
ユーザーの質問に日本語で答えてください。

重要なルール:
- 直接的な答えや完成済みの解答をそのまま渡さないでください。
- 代わりに、考え方、ヒント、確認すべき観点、次に試す一歩を示してください。
- ユーザーが答えを求めても、まず自分で考えられるように誘導してください。
- 文章は短めで、初心者にもわかりやすくしてください。
- 必要なら「まずここを確認しましょう」のように、質問を1つ返してください。
- 学習メモの内容に関係がある場合は、その内容を参考にしてください。

最近の会話:
${chatHistory || "なし"}

ユーザーの学習メモ:
${noteContext || "まだ学習メモはありません。"}

今回の質問:
${safeMessage}
`;

  const text = await getGeminiText(prompt);

  if (!text) {
    return "まず、今わかっていることを1つだけ書き出してみましょう。その上で「どこから分からなくなったか」を確認すると、次のヒントが見つかりやすいです。";
  }

  return text.trim();
};

const imageDataUrlToBuffer = (imageDataUrl) => {
  const match = imageDataUrl.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);

  if (!match) {
    const error = new Error("画像データの形式が正しくありません。");
    error.statusCode = 400;
    throw error;
  }

  return Buffer.from(match[1], "base64");
};

const extractDateFromText = (text) => {
  const match = text.match(/20\d{2}[/-]\d{1,2}[/-]\d{1,2}/);

  if (!match) {
    return "";
  }

  const [year, month, day] = match[0].replaceAll("/", "-").split("-");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const getTodayText = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const addDays = (dateText, days) => {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

const estimateStudyMinutes = (text) => {
  const length = text.replace(/\s/g, "").length;

  if (length < 120) {
    return 20;
  }

  if (length < 360) {
    return 35;
  }

  if (length < 700) {
    return 50;
  }

  return 70;
};

const normalizeUnderstanding = (value) =>
  ["よく理解した", "普通", "まだ難しい"].includes(value) ? value : "普通";

const getReviewDaysByUnderstanding = (understanding) => {
  if (understanding === "まだ難しい") {
    return 2;
  }

  if (understanding === "よく理解した") {
    return 7;
  }

  return 3;
};

const getDefaultReviewDate = (studyDate, understanding = "普通") =>
  addDays(studyDate, getReviewDaysByUnderstanding(understanding));

const keywordTags = [
  { tag: "AWS Lambda", keywords: ["aws lambda", "lambda"] },
  { tag: "AWS", keywords: ["aws", "クラウド", "cloud"] },
  { tag: "Serverless", keywords: ["serverless", "サーバーレス"] },
  { tag: "Backend", keywords: ["backend", "バックエンド", "api", "サーバー"] },
  { tag: "Infrastructure", keywords: ["infrastructure", "インフラ", "インフラストラクチャ"] },
  { tag: "Security", keywords: ["security", "セキュリティ"] },
  { tag: "Cost", keywords: ["cost", "コスト"] },
  { tag: "React", keywords: ["react", "usestate", "hooks"] },
  { tag: "JavaScript", keywords: ["javascript", "js"] },
  { tag: "Node.js", keywords: ["node.js", "nodejs"] },
  { tag: "Express", keywords: ["express"] },
  { tag: "Frontend", keywords: ["frontend", "フロントエンド", "html", "css"] },
  { tag: "SQL", keywords: ["sql", "database", "データベース"] },
  { tag: "Git", keywords: ["git", "github"] }
];

const detectTags = (text) => {
  const normalized = text.toLowerCase();
  return keywordTags
    .filter((item) => item.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())))
    .map((item) => item.tag);
};

const guessSubject = (text) => {
  const tags = detectTags(text);

  if (tags.includes("AWS Lambda")) {
    return "AWS";
  }

  if (tags.includes("React")) {
    return "React";
  }

  if (tags.includes("Node.js") || tags.includes("Express") || tags.includes("Backend")) {
    return "Backend";
  }

  if (tags.includes("Frontend")) {
    return "Frontend";
  }

  return tags[0] || "";
};

const buildNoteFieldsFromText = (text) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] || "";
  const subject = guessSubject(text) || lines.find((line) => /^科目[:：]/.test(line))?.replace(/^科目[:：]\s*/, "") || "";
  const tags = Array.from(new Set([subject, ...detectTags(text)].filter(Boolean)));
  const studyDate = getTodayText();
  const understanding = "普通";

  return {
    title,
    subject,
    content: text.trim(),
    studyDate,
    studyMinutes: estimateStudyMinutes(text),
    understanding,
    reviewDate: getDefaultReviewDate(studyDate, understanding),
    tags,
    memo: "画像からテキスト認識しました。",
    recognizedText: text.trim()
  };
};

const mergeUniqueTags = (...tagGroups) =>
  Array.from(new Set(tagGroups.flatMap(toTags))).slice(0, 8);

const makeGeminiNoteFieldsFromText = async (text) => {
  const fallback = buildNoteFieldsFromText(text);
  const prompt = `
あなたは画像OCRで読み取った学習ノートの文字を整理する日本語の学習サポートAIです。
次のOCRテキストから、学習メモ登録フォームに入れる内容を作成してください。
学習時間は分単位の整数にしてください。
学習日と次回復習日は返さないでください。日付はアプリ側で設定します。
必ずJSONだけで返してください。

形式:
{
  "title":"短いタイトル",
  "subject":"科目",
  "content":"読みやすく整えた内容",
  "studyMinutes":30,
  "understanding":"よく理解した または 普通 または まだ難しい",
  "tags":["タグ1","タグ2","タグ3"],
  "memo":"補足メモ"
}

OCRテキスト:
${text}
`;

  try {
    const geminiText = await getGeminiText(prompt);

    if (!geminiText) {
      return fallback;
    }

    const parsed = extractJson(geminiText);
    const tags = mergeUniqueTags(parsed.tags, fallback.tags);

    return {
      ...fallback,
      title: parsed.title || fallback.title,
      subject: parsed.subject || fallback.subject || "未分類",
      content: parsed.content || fallback.content,
      studyDate: fallback.studyDate,
      studyMinutes: Math.max(0, Number.parseInt(parsed.studyMinutes, 10) || fallback.studyMinutes),
      understanding: normalizeUnderstanding(parsed.understanding || fallback.understanding),
      reviewDate: getDefaultReviewDate(fallback.studyDate, normalizeUnderstanding(parsed.understanding || fallback.understanding)),
      tags,
      memo: parsed.memo || fallback.memo,
      recognizedText: text.trim()
    };
  } catch (error) {
    return fallback;
  }
};

const enrichNoteFields = async (note) => {
  const baseText = [note.title, note.subject, note.content, note.memo, ...toTags(note.tags)].filter(Boolean).join("\n");
  const fallbackSubject = note.subject || guessSubject(baseText) || "未分類";
  const fallbackTags = mergeUniqueTags(note.tags, fallbackSubject, detectTags(baseText));
  const fallbackStudyDate = note.studyDate || getTodayText();
  const fallbackStudyMinutes = note.studyMinutes || estimateStudyMinutes(baseText);
  const fallbackMemo = note.memo || "AIが学習メモの項目を補完しました。";

  if (
    note.subject &&
    note.studyDate &&
    note.studyMinutes &&
    note.reviewDate &&
    note.memo &&
    toTags(note.tags).length > 0
  ) {
    return {
      ...note,
      understanding: normalizeUnderstanding(note.understanding),
      tags: toTags(note.tags)
    };
  }

  const prompt = `
あなたは学習メモ登録フォームを補完する日本語の学習サポートAIです。
次の学習メモから、未入力の項目を自然に補完してください。
学習時間は内容量から分単位の整数で推定してください。
学習日と次回復習日は返さないでください。日付はアプリ側で設定します。
必ずJSONだけで返してください。

形式:
{
  "subject":"科目",
  "studyMinutes":30,
  "understanding":"よく理解した または 普通 または まだ難しい",
  "tags":["タグ1","タグ2","タグ3"],
  "memo":"補足メモ"
}

タイトル: ${note.title}
現在の科目: ${note.subject || "未入力"}
現在の学習日: ${note.studyDate || "未入力"}
現在の学習時間: ${note.studyMinutes || "未入力"}
現在の理解度: ${note.understanding || "未入力"}
現在の次回復習日: ${note.reviewDate || "未入力"}
内容:
${note.content}
メモ:
${note.memo || "なし"}
現在のタグ: ${toTags(note.tags).join(", ") || "未入力"}
`;

  try {
    const geminiText = await getGeminiText(prompt);

    if (!geminiText) {
      return {
        ...note,
        subject: fallbackSubject,
        studyDate: fallbackStudyDate,
        studyMinutes: fallbackStudyMinutes,
        understanding: normalizeUnderstanding(note.understanding),
        reviewDate: note.reviewDate || getDefaultReviewDate(fallbackStudyDate, normalizeUnderstanding(note.understanding)),
        tags: fallbackTags,
        memo: fallbackMemo
      };
    }

    const parsed = extractJson(geminiText);
    const studyDate = fallbackStudyDate;
    const understanding = normalizeUnderstanding(note.understanding || parsed.understanding);
    return {
      ...note,
      subject: note.subject || parsed.subject || fallbackSubject,
      studyDate,
      studyMinutes: note.studyMinutes || Math.max(0, Number.parseInt(parsed.studyMinutes, 10) || fallbackStudyMinutes),
      understanding,
      reviewDate: note.reviewDate || getDefaultReviewDate(studyDate, understanding),
      tags: toTags(note.tags).length > 0 ? toTags(note.tags) : mergeUniqueTags(parsed.tags, fallbackTags),
      memo: note.memo || parsed.memo || fallbackMemo
    };
  } catch (error) {
    return {
      ...note,
      subject: fallbackSubject,
      studyDate: fallbackStudyDate,
      studyMinutes: fallbackStudyMinutes,
      understanding: normalizeUnderstanding(note.understanding),
      reviewDate: note.reviewDate || getDefaultReviewDate(fallbackStudyDate, normalizeUnderstanding(note.understanding)),
      tags: fallbackTags,
      memo: fallbackMemo
    };
  }
};

const extractNoteFieldsFromImage = async (imageDataUrl) => {
  const imageBuffer = imageDataUrlToBuffer(imageDataUrl);
  const language = process.env.TESSERACT_LANG || "jpn+eng";
  const result = await recognize(imageBuffer, language);
  const recognizedText = result.data?.text || "";

  if (!recognizedText.trim()) {
    const error = new Error("画像から文字を認識できませんでした。");
    error.statusCode = 422;
    throw error;
  }

  return makeGeminiNoteFieldsFromText(recognizedText);
};

app.get("/api/health", (req, res) => {
  res.json({ message: "Learning Memo API is running" });
});

app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();

  if (!username?.trim() || !normalizedEmail || !password) {
    return res.status(400).json({ message: "ユーザー名、メール、パスワードを入力してください。" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "パスワードは6文字以上にしてください。" });
  }

  const existing = await query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);

  if (existing.rowCount > 0) {
    return res.status(409).json({ message: "このメールはすでに登録されています。" });
  }

  const passwordHash = hashPassword(password);
  const result = await query(
    `INSERT INTO users (username, email, password_salt, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [username.trim(), normalizedEmail, passwordHash.salt, passwordHash.hash]
  );
  const user = mapUser(result.rows[0]);

  res.status(201).json({
    token: createToken(user.id),
    user: publicUser(user)
  });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();
  const result = await query("SELECT * FROM users WHERE email = $1", [normalizedEmail]);
  const user = mapUser(result.rows[0]);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ message: "メールまたはパスワードが正しくありません。" });
  }

  res.json({
    token: createToken(user.id),
    user: publicUser(user)
  });
});

app.post("/api/auth/reset-password", async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: "メールと新しいパスワードを入力してください。" });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: "パスワードは6文字以上にしてください。" });
  }

  const passwordHash = hashPassword(password);
  const result = await query(
    `UPDATE users
     SET password_salt = $1,
         password_hash = $2
     WHERE email = $3
     RETURNING id`,
    [passwordHash.salt, passwordHash.hash, normalizedEmail]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ message: "このメールのユーザーが見つかりません。" });
  }

  res.json({ message: "パスワードを更新しました。新しいパスワードでログインしてください。" });
});

app.get("/api/profile", requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

app.put("/api/profile", requireAuth, async (req, res) => {
  const { username, schoolName, learningGoal } = req.body;

  if (!username?.trim()) {
    return res.status(400).json({ message: "ユーザー名を入力してください。" });
  }

  const result = await query(
    `UPDATE users
     SET username = $1, school_name = $2, learning_goal = $3
     WHERE id = $4
     RETURNING *`,
    [username.trim(), schoolName || "", learningGoal || "", req.user.id]
  );

  res.json(publicUser(mapUser(result.rows[0])));
});

app.get("/api/notes", requireAuth, async (req, res) => {
  const result = await query(
    "SELECT * FROM notes WHERE user_id = $1 ORDER BY created_at DESC, id DESC",
    [req.user.id]
  );
  res.json(result.rows.map(mapNote));
});

app.get("/api/notes/export", requireAuth, async (req, res) => {
  const result = await query(
    "SELECT * FROM notes WHERE user_id = $1 ORDER BY created_at DESC, id DESC",
    [req.user.id]
  );
  const exportData = {
    format: "learning-memo-ai-notes",
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: result.rows.map(mapNote).map(({ id, userId, ...note }) => note)
  };
  const date = getTodayText();

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="learning-memos-${date}.json"`);
  res.json(exportData);
});

app.post("/api/notes/import", requireAuth, async (req, res) => {
  const rawNotes = Array.isArray(req.body?.notes) ? req.body.notes : Array.isArray(req.body) ? req.body : null;

  if (!rawNotes) {
    return res.status(400).json({ message: "インポートするJSONファイルの形式が正しくありません。" });
  }

  if (rawNotes.length === 0) {
    return res.status(400).json({ message: "インポートする学習メモがありません。" });
  }

  if (rawNotes.length > 500 || Buffer.byteLength(JSON.stringify(req.body), "utf8") > 5 * 1024 * 1024) {
    return res.status(400).json({ message: "インポートできるのは500件、または5MBまでです。" });
  }

  const currentNotes = await query(
    "SELECT title, content, study_date FROM notes WHERE user_id = $1",
    [req.user.id]
  );
  const fingerprints = new Set(currentNotes.rows.map((note) => importFingerprint({
    title: note.title || "",
    content: note.content || "",
    studyDate: note.study_date || ""
  })));
  const validNotes = [];
  let skippedCount = 0;

  rawNotes.forEach((rawNote) => {
    if (!rawNote || typeof rawNote !== "object") {
      skippedCount += 1;
      return;
    }

    const note = normalizeImportedNote(rawNote);

    if (!note.title || !note.content) {
      skippedCount += 1;
      return;
    }

    const fingerprint = importFingerprint(note);

    if (fingerprints.has(fingerprint)) {
      skippedCount += 1;
      return;
    }

    fingerprints.add(fingerprint);
    validNotes.push(note);
  });

  const importedNotes = [];

  for (const note of validNotes) {
    const result = await query(
      `INSERT INTO notes
        (user_id, title, subject, content, study_date, study_minutes, understanding, review_date, tags, memo, is_learned, ai_summary, review_questions, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13::jsonb, COALESCE($14::timestamptz, NOW()), COALESCE($15::timestamptz, NOW()))
       RETURNING *`,
      [
        req.user.id,
        note.title,
        note.subject,
        note.content,
        note.studyDate,
        note.studyMinutes,
        note.understanding,
        note.reviewDate,
        JSON.stringify(note.tags),
        note.memo,
        note.isLearned,
        note.aiSummary,
        JSON.stringify(note.reviewQuestions),
        note.createdAt,
        note.updatedAt
      ]
    );
    importedNotes.push(mapNote(result.rows[0]));
  }

  res.status(201).json({
    importedCount: importedNotes.length,
    skippedCount,
    notes: importedNotes
  });
});

app.get("/api/daily-advice", requireAuth, async (req, res) => {
  const adviceDate = getTodayText();
  const existing = await query(
    "SELECT * FROM daily_advices WHERE user_id = $1 AND advice_date = $2",
    [req.user.id, adviceDate]
  );

  if (existing.rowCount > 0) {
    return res.json({
      date: existing.rows[0].advice_date,
      content: existing.rows[0].content,
      createdAt: existing.rows[0].created_at
    });
  }

  const notesResult = await query(
    "SELECT * FROM notes WHERE user_id = $1 ORDER BY updated_at DESC, id DESC",
    [req.user.id]
  );
  const notes = notesResult.rows.map(mapNote);
  const content = await makeGeminiDailyAdvice(notes);
  const result = await query(
    `INSERT INTO daily_advices (user_id, advice_date, content)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, advice_date) DO UPDATE SET content = EXCLUDED.content
     RETURNING *`,
    [req.user.id, adviceDate, content]
  );

  res.json({
    date: result.rows[0].advice_date,
    content: result.rows[0].content,
    createdAt: result.rows[0].created_at
  });
});

app.post("/api/study-chat", requireAuth, async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const history = Array.isArray(req.body?.history) ? req.body.history : [];

  if (!message) {
    return res.status(400).json({ message: "質問を入力してください。" });
  }

  try {
    const result = await query(
      "SELECT * FROM notes WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 12",
      [req.user.id]
    );
    const reply = await makeStudyChatReply({ message, history, notes: result.rows.map(mapNote) });
    res.json({ reply });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: "AI学習チャットの回答を作成できませんでした。",
      detail: error.message
    });
  }
});

app.post("/api/notes/extract-image", requireAuth, async (req, res) => {
  const { imageDataUrl } = req.body;

  if (!imageDataUrl?.startsWith("data:image/")) {
    return res.status(400).json({ message: "画像ファイルを選択してください。" });
  }

  try {
    const result = await extractNoteFieldsFromImage(imageDataUrl);
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "画像からテキストを認識できませんでした。"
    });
  }
});

app.post("/api/notes", requireAuth, async (req, res) => {
  const { title, subject, content, studyDate, studyMinutes, understanding, reviewDate, tags, memo } = req.body;

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ message: "タイトル、内容を入力してください。科目とタグはAIが自動作成できます。" });
  }

  const newNote = await enrichNoteFields(normalizeNote({
    userId: req.user.id,
    title,
    subject,
    content,
    studyDate,
    studyMinutes,
    understanding,
    reviewDate,
    tags,
    memo
  }));
  const result = await query(
    `INSERT INTO notes
      (user_id, title, subject, content, study_date, study_minutes, understanding, review_date, tags, memo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     RETURNING *`,
    [
      req.user.id,
      newNote.title,
      newNote.subject,
      newNote.content,
      newNote.studyDate,
      newNote.studyMinutes,
      newNote.understanding,
      newNote.reviewDate,
      JSON.stringify(newNote.tags),
      newNote.memo
    ]
  );

  const savedNote = mapNote(result.rows[0]);
  res.status(201).json(savedNote);
});

app.put("/api/notes/:id", requireAuth, async (req, res) => {
  const noteId = req.params.id;
  const { title, subject, content, studyDate, studyMinutes, understanding, reviewDate, tags, memo, aiSummary, reviewQuestions } = req.body;

  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ message: "タイトル、内容を入力してください。科目とタグはAIが自動作成できます。" });
  }

  const nextNote = await enrichNoteFields(normalizeNote({
    id: noteId,
    userId: req.user.id,
    title,
    subject,
    content,
    studyDate,
    studyMinutes,
    understanding,
    reviewDate,
    tags,
    memo,
    aiSummary,
    reviewQuestions
  }));
  const result = await query(
    `UPDATE notes
     SET title = $1,
         subject = $2,
         content = $3,
         study_date = $4,
         study_minutes = $5,
         understanding = $6,
         review_date = $7,
         tags = $8::jsonb,
         memo = $9,
         ai_summary = $10,
         review_questions = $11::jsonb,
         updated_at = NOW()
     WHERE id = $12 AND user_id = $13
     RETURNING *`,
    [
      nextNote.title,
      nextNote.subject,
      nextNote.content,
      nextNote.studyDate,
      nextNote.studyMinutes,
      nextNote.understanding,
      nextNote.reviewDate,
      JSON.stringify(nextNote.tags),
      nextNote.memo,
      nextNote.aiSummary,
      JSON.stringify(nextNote.reviewQuestions),
      noteId,
      req.user.id
    ]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ message: "学習メモが見つかりません。" });
  }

  res.json(mapNote(result.rows[0]));
});

app.delete("/api/notes/:id", requireAuth, async (req, res) => {
  const noteId = req.params.id;
  const result = await query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [noteId, req.user.id]);

  if (result.rowCount === 0) {
    return res.status(404).json({ message: "学習メモが見つかりません。" });
  }
  res.json({ message: "削除しました。" });
});

app.post("/api/notes/:id/reviewed", requireAuth, async (req, res) => {
  const noteId = req.params.id;
  const current = await query("SELECT * FROM notes WHERE id = $1 AND user_id = $2", [noteId, req.user.id]);

  if (current.rowCount === 0) {
    return res.status(404).json({ message: "学習メモが見つかりません。" });
  }

  const note = mapNote(current.rows[0]);
  const nextReviewDate = getDefaultReviewDate(getTodayText(), normalizeUnderstanding(note.understanding));
  const result = await query(
    `UPDATE notes
     SET review_date = $1,
         updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [nextReviewDate, noteId, req.user.id]
  );

  res.json(mapNote(result.rows[0]));
});

app.post("/api/notes/:id/learned", requireAuth, async (req, res) => {
  const noteId = req.params.id;
  const current = await query("SELECT * FROM notes WHERE id = $1 AND user_id = $2", [noteId, req.user.id]);

  if (current.rowCount === 0) {
    return res.status(404).json({ message: "学習メモが見つかりません。" });
  }

  const currentNote = mapNote(current.rows[0]);
  const nextIsLearned = typeof req.body?.isLearned === "boolean" ? req.body.isLearned : !currentNote.isLearned;
  const result = await query(
    `UPDATE notes
     SET is_learned = $1,
         updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [nextIsLearned, noteId, req.user.id]
  );

  res.json(mapNote(result.rows[0]));
});

app.post("/api/notes/:id/summary", requireAuth, async (req, res) => {
  const noteId = req.params.id;
  const current = await query("SELECT * FROM notes WHERE id = $1 AND user_id = $2", [noteId, req.user.id]);

  if (current.rowCount === 0) {
    return res.status(404).json({ message: "学習メモが見つかりません。" });
  }

  const note = mapNote(current.rows[0]);
  let summary = "";

  try {
    summary = await makeGeminiSummary(note);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: "Gemini APIでAI要約・学習アドバイスを作成できませんでした。APIキーまたは無料枠の上限を確認してください。"
    });
  }

  const result = await query(
    `UPDATE notes SET ai_summary = $1, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [summary, noteId, req.user.id]
  );

  res.json(mapNote(result.rows[0]));
});

app.post("/api/notes/:id/questions", requireAuth, async (req, res) => {
  const noteId = req.params.id;
  const current = await query("SELECT * FROM notes WHERE id = $1 AND user_id = $2", [noteId, req.user.id]);

  if (current.rowCount === 0) {
    return res.status(404).json({ message: "学習メモが見つかりません。" });
  }

  const note = mapNote(current.rows[0]);
  let questions = [];

  try {
    questions = await makeGeminiReviewQuestions(note);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: "Gemini APIで復習問題を作成できませんでした。APIキーまたは無料枠の上限を確認してください。"
    });
  }

  const result = await query(
    `UPDATE notes SET review_questions = $1::jsonb, updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [JSON.stringify(questions), noteId, req.user.id]
  );

  res.json(mapNote(result.rows[0]));
});

app.post("/api/check/questions", requireAuth, async (req, res) => {
  const result = await query(
    `SELECT * FROM notes
     WHERE user_id = $1
       AND (is_learned = TRUE OR understanding = 'よく理解した')
     ORDER BY updated_at DESC, id DESC`,
    [req.user.id]
  );
  const checkSourceNotes = result.rows.map(mapNote);

  if (checkSourceNotes.length === 0) {
    return res.status(400).json({ message: "復習済み、または学習済のメモがありません。" });
  }

  const questions = getSavedCheckQuestions(checkSourceNotes);

  if (questions.length === 0) {
    return res.status(400).json({
      message: "復習済み、または学習済のメモに保存済みの復習問題がありません。詳細情報で復習問題を作成してから実行してください。"
    });
  }

  res.json({ questions });
});

app.post("/api/check/evaluate", requireAuth, async (req, res) => {
  const answers = Array.isArray(req.body?.answers) ? req.body.answers.slice(0, 10) : [];

  if (answers.length === 0) {
    return res.status(400).json({ message: "回答がありません。" });
  }

  try {
    const evaluation = await makeGeminiCheckEvaluation(answers);
    const relatedNotes = [...new Map(
      answers
        .filter((item) => item.noteId)
        .map((item) => [String(item.noteId), {
          id: item.noteId,
          title: item.noteTitle || "学習メモ",
          subject: item.subject || ""
        }])
    ).values()].slice(0, 5);

    res.json({ ...evaluation, relatedNotes });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: "AI理解度チェックの評価を作成できませんでした。APIキーまたは無料枠の上限を確認してください。"
    });
  }
});

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`Learning Memo API: http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("PostgreSQL connection failed:", error.message);
    process.exit(1);
  });
