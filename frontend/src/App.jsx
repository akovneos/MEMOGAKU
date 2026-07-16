import React, { useEffect, useMemo, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

const emptyLogin = { username: "", email: "", password: "" };
const emptyProfile = { username: "", schoolName: "", learningGoal: "" };
const emptyNote = {
  title: "",
  subject: "",
  content: "",
  studyDate: "",
  studyMinutes: "",
  understanding: "普通",
  reviewDate: "",
  memo: "",
  aiSummary: "",
  reviewQuestions: ""
};

const todayText = new Date().toISOString().slice(0, 10);
const toLocalDate = (dateText) => {
  if (!dateText) {
    return null;
  }

  const [year, month, day] = dateText.split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : null;
};
const toDateText = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const getWeekDates = (baseDateText) => {
  const baseDate = toLocalDate(baseDateText) || new Date();
  const mondayOffset = (baseDate.getDay() + 6) % 7;
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return toDateText(date);
  });
};
const getStudyMinutes = (note) => Math.max(0, Number.parseInt(note.studyMinutes, 10) || 0);
const formatStudyMinutes = (minutes) => {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const restMinutes = safeMinutes % 60;
  return hours > 0 ? `${hours}時間 ${restMinutes}分` : `${restMinutes}分`;
};
const formatDateTime = (value) => {
  if (!value) {
    return "未登録";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "未登録";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};
const splitSummaryAdvice = (value) => {
  const text = String(value || "").trim();

  if (!text) {
    return { summary: "", advice: "" };
  }

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

const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");
const getCreatedDate = (note) => dateOnly(note.createdAt);
const getReviewDate = (note) => dateOnly(note.nextReviewDate || note.reviewDate);
const getUnderstandingLevel = (note) => note.understandingLevel || note.understanding || "";
const isDifficultNote = (note) => ["やや難しい", "難しい", "まだ難しい"].includes(getUnderstandingLevel(note));
const isActiveLearningNote = (note) => !note.isLearned;
const isAddedTodayNote = (note) => isActiveLearningNote(note) && getCreatedDate(note) === todayText;
const isTodayLearningNote = (note) =>
  isActiveLearningNote(note) && (dateOnly(note.studyDate) === todayText || getReviewDate(note) === todayText);
const sortByStudyDateDesc = (items) =>
  [...items].sort((a, b) => dateOnly(b.studyDate).localeCompare(dateOnly(a.studyDate)));
const getSortValue = (note, key) => {
  if (key === "title") {
    return note.title || "";
  }

  if (key === "subject") {
    return note.subject || "";
  }

  if (key === "understanding") {
    return getUnderstandingLevel(note);
  }

  if (key === "studyDate") {
    return dateOnly(note.studyDate);
  }

  if (key === "reviewDate") {
    return getReviewDate(note);
  }

  return "";
};
const sortNotes = (items, sort) =>
  [...items].sort((a, b) => {
    const result = getSortValue(a, sort.key).localeCompare(getSortValue(b, sort.key), "ja");
    return sort.direction === "asc" ? result : -result;
  });
const getMonthCalendarDays = (baseDateText) => {
  const baseDate = toLocalDate(baseDateText) || new Date();
  const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - ((firstDay.getDay() + 6) % 7));
  const endDate = new Date(lastDay);
  endDate.setDate(lastDay.getDate() + (6 - ((lastDay.getDay() + 6) % 7)));
  const days = [];
  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    days.push({
      date: toDateText(currentDate),
      day: currentDate.getDate(),
      currentMonth: currentDate.getMonth() === baseDate.getMonth(),
      today: toDateText(currentDate) === todayText
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return days;
};
const routeToScreen = (pathname) => {
  if (/^\/notes\/[^/]+\/edit$/.test(pathname)) {
    return "editor";
  }

  return {
    "/": "dashboard",
    "/dashboard": "dashboard",
    "/notes": "dashboard",
    "/notes/new": "editor",
    "/review": "dashboard",
    "/check": "check",
    "/stats": "stats",
    "/profile": "profile"
  }[pathname] || "dashboard";
};

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="menuIcon" viewBox="0 0 24 24">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function AppIcon({ name }) {
  const paths = {
    app: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h5M8 17h7" /></>,
    dashboard: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
    add: <><path d="M12 5v14M5 12h14" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
    tag: <><path d="M4 12V5h7l9 9-7 7-9-9Z" /><path d="M8.5 8.5h.01" /></>,
    report: <><path d="M5 19V5M5 19h14" /><path d="M9 16v-5M13 16V8M17 16v-8" /></>,
    profile: <><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M4 20a8 8 0 0 1 16 0" /></>,
    book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z" /><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20" /></>,
    brain: <><path d="M9 4a3 3 0 0 0-3 3v.5A3.5 3.5 0 0 0 6.5 14H7v1a3 3 0 0 0 5 2.2" /><path d="M15 4a3 3 0 0 1 3 3v.5a3.5 3.5 0 0 1-.5 6.5H17v1a3 3 0 0 1-5 2.2" /><path d="M12 4v14" /></>,
    spark: <><path d="M12 3l1.6 5.1L19 10l-5.4 1.9L12 17l-1.6-5.1L5 10l5.4-1.9L12 3Z" /><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8L18 15Z" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>
  };

  return (
    <svg aria-hidden="true" className="appIcon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("learningMemoToken") || "");
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("learningMemoUser");
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState("login");
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const screen = routeToScreen(currentPath);
  const [profile, setProfile] = useState(emptyProfile);
  const [profileMessage, setProfileMessage] = useState("");
  const [notes, setNotes] = useState([]);
  const [dailyAdvice, setDailyAdvice] = useState(null);
  const [dailyAdviceLoading, setDailyAdviceLoading] = useState(false);
  const [dailyAdviceError, setDailyAdviceError] = useState("");
  const [noteForm, setNoteForm] = useState(emptyNote);
  const [editingId, setEditingId] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [dashboardSort, setDashboardSort] = useState({ key: "studyDate", direction: "desc" });
  const [calendarMonth, setCalendarMonth] = useState(() => todayText.slice(0, 7) + "-01");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(todayText);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [statusMessage, setStatusMessage] = useState("");
  const [aiLoading, setAiLoading] = useState("");
  const [aiError, setAiError] = useState("");
  const [learningId, setLearningId] = useState(null);
  const [checkQuestions, setCheckQuestions] = useState([]);
  const [checkAnswers, setCheckAnswers] = useState({});
  const [checkResult, setCheckResult] = useState(null);
  const [checkLoading, setCheckLoading] = useState("");
  const [checkError, setCheckError] = useState("");
  const [imageInput, setImageInput] = useState(null);
  const [imageAiLoading, setImageAiLoading] = useState(false);
  const [imageAiError, setImageAiError] = useState("");
  const [recognizedText, setRecognizedText] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content: "こんにちは。学習で迷っていることを教えてください。答えをそのまま渡すのではなく、考えるためのヒントを出します。"
    }
  ]);

  const request = (path, options = {}) =>
    fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });

  const navigate = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }

    setCurrentPath(window.location.pathname);

    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const saveSession = (data) => {
    localStorage.setItem("learningMemoToken", data.token);
    localStorage.setItem("learningMemoUser", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setProfile({
      username: data.user.username || "",
      schoolName: data.user.schoolName || "",
      learningGoal: data.user.learningGoal || ""
    });
  };

  const logout = () => {
    localStorage.removeItem("learningMemoToken");
    localStorage.removeItem("learningMemoUser");
    setToken("");
    setUser(null);
    setNotes([]);
    setDailyAdvice(null);
    setDailyAdviceError("");
    setSelectedNote(null);
    navigate("/dashboard");
  };

  const loadNotes = async () => {
    const response = await request("/notes");

    if (response.status === 401) {
      logout();
      return;
    }

    setNotes(await response.json());
  };

  const loadDailyAdvice = async () => {
    setDailyAdviceLoading(true);
    setDailyAdviceError("");

    try {
      const response = await request("/daily-advice");
      const data = await response.json();

      if (!response.ok) {
        setDailyAdviceError(data.message || "今日のAI学習アドバイスを取得できませんでした。");
        return;
      }

      setDailyAdvice(data);
    } catch (error) {
      setDailyAdviceError("今日のAI学習アドバイスを取得できませんでした。");
    } finally {
      setDailyAdviceLoading(false);
    }
  };

  const loadProfile = async () => {
    const response = await request("/profile");

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    setUser(data);
    setProfile({
      username: data.username || "",
      schoolName: data.schoolName || "",
      learningGoal: data.learningGoal || ""
    });
    localStorage.setItem("learningMemoUser", JSON.stringify(data));
  };

  useEffect(() => {
    if (token) {
      loadNotes();
      loadProfile();
      loadDailyAdvice();
    }
  }, [token]);

  useEffect(() => {
    const syncPath = () => setCurrentPath(window.location.pathname);

    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);

  useEffect(() => {
    if (currentPath === "/notes/new") {
      setEditingId(null);
      return;
    }

    const editMatch = currentPath.match(/^\/notes\/([^/]+)\/edit$/);

    if (!editMatch) {
      return;
    }

    const note = notes.find((item) => String(item.id) === decodeURIComponent(editMatch[1]));

    if (note) {
      setNoteForm({
        title: note.title || "",
        subject: note.subject || "",
        content: note.content || "",
        studyDate: note.studyDate || "",
        studyMinutes: note.studyMinutes || "",
        understanding: note.understanding || "普通",
        reviewDate: note.reviewDate || "",
        memo: note.memo || "",
        aiSummary: note.aiSummary || "",
        reviewQuestions: note.reviewQuestions?.join("\n") || ""
      });
      setEditingId(note.id);
    }
  }, [currentPath, notes]);

  const searchText = keyword.trim().toLowerCase();
  const visibleNotes = useMemo(
    () =>
      searchText
        ? notes.filter((note) =>
            [note.title, note.subject, note.content, note.memo]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(searchText))
          )
        : notes,
    [notes, searchText]
  );
  const filteredNotes = useMemo(() => {
    const filtered =
      activeFilter === "today"
        ? visibleNotes.filter(isAddedTodayNote)
        : activeFilter === "todayLearning"
          ? visibleNotes.filter(isTodayLearningNote)
          : activeFilter === "difficult"
            ? visibleNotes.filter((note) => isActiveLearningNote(note) && isDifficultNote(note))
            : activeFilter === "easy"
              ? visibleNotes.filter((note) => isActiveLearningNote(note) && getUnderstandingLevel(note) === "よく理解した")
              : activeFilter === "normal"
                ? visibleNotes.filter((note) => isActiveLearningNote(note) && getUnderstandingLevel(note) === "普通")
                : activeFilter === "learned"
                  ? visibleNotes.filter((note) => note.isLearned)
            : visibleNotes;

    return sortNotes(sortByStudyDateDesc(filtered), dashboardSort);
  }, [visibleNotes, activeFilter, dashboardSort]);
  const dashboardNotes = filteredNotes;
  const listTitle =
    activeFilter === "today"
      ? "本日追加したメモ"
      : activeFilter === "todayLearning"
        ? "本日の学習メモ"
        : activeFilter === "difficult"
          ? "まだ難しい学習メモ"
          : activeFilter === "easy"
            ? "よく理解した学習メモ"
            : activeFilter === "normal"
              ? "普通の学習メモ"
              : activeFilter === "learned"
                ? "学習済みの学習メモ"
            : "学習メモ";
  const todayCount = notes.filter(isAddedTodayNote).length;
  const weekDates = getWeekDates(todayText);
  const weeklyDailyMinutes = weekDates.map((date) =>
    notes
      .filter((note) => dateOnly(note.studyDate) === date)
      .reduce((sum, note) => sum + getStudyMinutes(note), 0)
  );
  const weeklyStudyMinutes = weeklyDailyMinutes.reduce((sum, minutes) => sum + minutes, 0);
  const weeklyStudyText = formatStudyMinutes(weeklyStudyMinutes);
  const maxWeeklyDailyMinutes = Math.max(...weeklyDailyMinutes, 1);
  const todayLearningCount = notes.filter(isTodayLearningNote).length;
  const difficultCount = notes.filter((note) => isActiveLearningNote(note) && isDifficultNote(note)).length;
  const easyCount = notes.filter((note) => isActiveLearningNote(note) && getUnderstandingLevel(note) === "よく理解した").length;
  const normalCount = notes.filter((note) => isActiveLearningNote(note) && getUnderstandingLevel(note) === "普通").length;
  const learnedCount = notes.filter((note) => note.isLearned).length;
  const checkSourceCount = learnedCount + easyCount;
  const calendarMonthText = calendarMonth.slice(0, 7);
  const calendarDays = getMonthCalendarDays(calendarMonth);
  const calendarMonthLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(toLocalDate(calendarMonth));
  const calendarStudyCount = notes.filter((note) => dateOnly(note.studyDate).startsWith(calendarMonthText)).length;
  const calendarReviewCount = notes.filter((note) => getReviewDate(note).startsWith(calendarMonthText) && !note.isLearned).length;
  const calendarLearnedCount = notes.filter((note) => note.isLearned && dateOnly(note.updatedAt || note.studyDate).startsWith(calendarMonthText)).length;
  const calendarStudyMinutes = notes
    .filter((note) => dateOnly(note.studyDate).startsWith(calendarMonthText))
    .reduce((sum, note) => sum + getStudyMinutes(note), 0);
  const selectedDateLabel = selectedCalendarDate.replaceAll("-", "/");
  const selectedCalendarItems = [
    ...notes
      .filter((note) => !note.isLearned && dateOnly(note.studyDate) === selectedCalendarDate)
      .map((note) => ({ note, type: "study", label: "学習" })),
    ...notes
      .filter((note) => !note.isLearned && getReviewDate(note) === selectedCalendarDate)
      .map((note) => ({ note, type: "review", label: "復習" })),
  ];
  const reviewNotes = visibleNotes
    .filter(isTodayLearningNote)
    .sort((a, b) => dateOnly(b.studyDate).localeCompare(dateOnly(a.studyDate)) || getReviewDate(a).localeCompare(getReviewDate(b)));
  const subjectStats = notes.reduce((stats, note) => {
    const subject = note.subject || "未分類";
    stats[subject] = (stats[subject] || 0) + 1;
    return stats;
  }, {});
  const topSubjectStats = Object.entries(subjectStats)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);
  const latestNotes = sortByStudyDateDesc(notes).slice(0, 5);
  const reportAdvice =
    difficultCount > 0
      ? "まだ難しいメモがあります。本日の学習で優先して確認しましょう。"
      : todayLearningCount > 0
        ? "本日の学習メモがあります。短い時間で見直しましょう。"
        : notes.length > 0
          ? "順調です。新しい学習メモを追加して学習を続けましょう。"
          : "まずは新しい学習メモを登録しましょう。";
  const updateAuthForm = (event) => {
    const { name, value } = event.target;
    setLoginForm((current) => ({ ...current, [name]: value }));
  };

  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    if (authMode === "reset") {
      const response = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setAuthError(data.message || "パスワードを更新できませんでした。");
        return;
      }

      setAuthMode("login");
      setLoginForm(emptyLogin);
      setAuthMessage(data.message || "パスワードを更新しました。");
      return;
    }

    const isRegister = authMode === "register";
    const response = await fetch(`${API_URL}/auth/${isRegister ? "register" : "login"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(loginForm)
    });
    const data = await response.json();

    if (!response.ok) {
      setAuthError(data.message || "ログインに失敗しました。");
      return;
    }

    saveSession(data);
    setLoginForm(emptyLogin);
  };

  const updateNoteForm = (event) => {
    const { name, value } = event.target;
    setNoteForm((current) => ({ ...current, [name]: value }));
  };

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("画像ファイルを読み込めませんでした。"));
      reader.readAsDataURL(file);
    });

  const extractNoteFromImage = async () => {
    if (!imageInput) {
      setImageAiError("画像ファイルを選択してください。");
      return;
    }

    setImageAiLoading(true);
    setImageAiError("");
    setRecognizedText("");

    try {
      const imageDataUrl = await readFileAsDataUrl(imageInput);
      const response = await request("/notes/extract-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl })
      });
      const data = await response.json();

      if (!response.ok) {
        setImageAiError(data.message || "画像からテキストを認識できませんでした。");
        return;
      }

      setNoteForm((current) => ({
        ...current,
        title: data.title || current.title,
        subject: data.subject || "",
        content: data.content || current.content,
        studyDate: data.studyDate || current.studyDate,
        studyMinutes: data.studyMinutes === 0 || data.studyMinutes ? String(data.studyMinutes) : current.studyMinutes,
        understanding: data.understanding || current.understanding,
        reviewDate: data.reviewDate || current.reviewDate,
        memo: data.memo || current.memo
      }));
      setRecognizedText(data.recognizedText || "");
      setStatusMessage("画像から学習メモを入力しました。内容を確認してください。");
    } catch (error) {
      setImageAiError(error.message || "画像からテキストを認識できませんでした。");
    } finally {
      setImageAiLoading(false);
    }
  };

  const openNewNote = () => {
    setNoteForm(emptyNote);
    setEditingId(null);
    setStatusMessage("");
    setImageInput(null);
    setImageAiError("");
    setRecognizedText("");
    navigate("/notes/new");
  };

  const changeSort = (setter, key) => {
    setter((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  };

  const changeCalendarMonth = (amount) => {
    const baseDate = toLocalDate(calendarMonth) || new Date();
    const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + amount, 1);
    const nextMonthText = toDateText(nextDate);

    setCalendarMonth(nextMonthText);
    setSelectedCalendarDate(nextMonthText);
    setSelectedNote(null);
  };

  const sortLabel = (sort, key, label) => `${label}${sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}`;

  const toggleSelectedNote = (note) => {
    setAiError("");
    setSelectedNote((current) => (current?.id === note.id ? null : note));
  };

  const editNote = (note) => {
    setNoteForm({
      title: note.title || "",
      subject: note.subject || "",
      content: note.content || "",
      studyDate: note.studyDate || "",
      studyMinutes: note.studyMinutes || "",
      understanding: note.understanding || "普通",
      reviewDate: note.reviewDate || "",
      memo: note.memo || "",
      aiSummary: note.aiSummary || "",
      reviewQuestions: note.reviewQuestions?.join("\n") || ""
    });
    setEditingId(note.id);
    setSelectedNote(null);
    setStatusMessage("");
    navigate(`/notes/${note.id}/edit`);
  };

  const submitNote = async (event) => {
    event.preventDefault();
    setStatusMessage("");

    const payload = {
      ...noteForm,
      reviewQuestions: noteForm.reviewQuestions
        .split(/\r?\n/)
        .map((question) => question.trim())
        .filter(Boolean)
    };
    const response = await request(editingId ? `/notes/${editingId}` : "/notes", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      setStatusMessage(data.message || "保存に失敗しました。");
      return;
    }

    setNotes((current) =>
      editingId ? current.map((note) => (note.id === editingId ? data : note)) : [data, ...current]
    );
    setStatusMessage(editingId ? "学習メモを更新しました。" : "学習メモを登録しました。");
    setNoteForm(emptyNote);
    setEditingId(null);
    navigate("/dashboard");
  };

  const deleteNote = async (note) => {
    if (!window.confirm("この学習メモを削除しますか？")) {
      return;
    }

    const response = await request(`/notes/${note.id}`, { method: "DELETE" });

    if (!response.ok) {
      setStatusMessage("削除に失敗しました。");
      return;
    }

    setNotes((current) => current.filter((item) => item.id !== note.id));
    setSelectedNote(null);
    setStatusMessage("学習メモを削除しました。");
  };

  const toggleNoteLearned = async (note) => {
    setLearningId(note.id);
    setStatusMessage("");

    try {
      const response = await request(`/notes/${note.id}/learned`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLearned: !note.isLearned })
      });
      const data = await response.json();

      if (!response.ok) {
        setStatusMessage(data.message || "学習済みを更新できませんでした。");
        return;
      }

      setNotes((current) => current.map((item) => (item.id === data.id ? data : item)));
      setSelectedNote(data);
      setStatusMessage(data.isLearned ? "学習済みにしました。" : "学習済みを解除しました。");
    } catch (error) {
      setStatusMessage("学習済みを更新できませんでした。");
    } finally {
      setLearningId(null);
    }
  };

  const startAiCheck = async () => {
    setCheckLoading("questions");
    setCheckError("");
    setCheckResult(null);

    try {
      const response = await request("/check/questions", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setCheckError(data.message || "AI理解度チェックを作成できませんでした。");
        return;
      }

      const questions = Array.isArray(data.questions) ? data.questions.slice(0, 10) : [];
      setCheckQuestions(questions);
      setCheckAnswers({});
    } catch (error) {
      setCheckError("AI理解度チェックを作成できませんでした。");
    } finally {
      setCheckLoading("");
    }
  };

  const updateCheckAnswer = (questionId, answer) => {
    setCheckAnswers((current) => ({ ...current, [questionId]: answer }));
  };

  const submitAiCheck = async () => {
    const answers = checkQuestions.map((question) => ({
      ...question,
      answer: checkAnswers[question.id] || ""
    }));

    if (!answers.some((item) => item.answer.trim())) {
      setCheckError("少なくとも1問は回答してください。");
      return;
    }

    setCheckLoading("evaluation");
    setCheckError("");
    setCheckResult(null);

    try {
      const response = await request("/check/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });
      const data = await response.json();

      if (!response.ok) {
        setCheckError(data.message || "AI評価を作成できませんでした。");
        return;
      }

      setCheckResult(data);
    } catch (error) {
      setCheckError("AI評価を作成できませんでした。");
    } finally {
      setCheckLoading("");
    }
  };

  const sendStudyChatMessage = async (event) => {
    event.preventDefault();
    const message = chatInput.trim();

    if (!message || chatLoading) {
      return;
    }

    const nextMessages = [...chatMessages, { role: "user", content: message }];
    setChatMessages(nextMessages);
    setChatInput("");
    setChatError("");
    setChatLoading(true);

    try {
      const response = await request("/study-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: nextMessages.slice(-8)
        })
      });
      const data = await response.json();

      if (!response.ok) {
        setChatError(data.message || "AI学習チャットの回答を作成できませんでした。");
        return;
      }

      setChatMessages((current) => [...current, { role: "assistant", content: data.reply || "もう少し具体的に質問してみましょう。" }]);
    } catch (error) {
      setChatError("AI学習チャットに接続できませんでした。");
    } finally {
      setChatLoading(false);
    }
  };

  const runAi = async (type) => {
    if (!selectedNote) {
      return;
    }

    const hasExistingContent =
      type === "summary"
        ? Boolean(selectedNote.aiSummary?.trim())
        : Boolean(selectedNote.reviewQuestions?.length);

    if (
      hasExistingContent &&
      !window.confirm(type === "summary"
        ? "既存のAI要約・学習アドバイスが上書きされます。よろしいですか？"
        : "既存の復習問題が上書きされます。よろしいですか？")
    ) {
      return;
    }

    setAiLoading(type);
    setAiError("");

    try {
      const response = await request(`/notes/${selectedNote.id}/${type}`, { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        setAiError(data.message || "AI処理に失敗しました。");
        return;
      }

      setNotes((current) => current.map((note) => (note.id === data.id ? data : note)));
      setSelectedNote(data);
    } catch (error) {
      setAiError("AI処理に失敗しました。");
    } finally {
      setAiLoading("");
    }
  };

  const updateProfile = (event) => {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
  };

  const submitProfile = async (event) => {
    event.preventDefault();
    setProfileMessage("");

    const response = await request("/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    });
    const data = await response.json();

    if (!response.ok) {
      setProfileMessage(data.message || "保存に失敗しました。");
      return;
    }

    setUser(data);
    localStorage.setItem("learningMemoUser", JSON.stringify(data));
    setProfileMessage("プロフィールを保存しました。");
  };

  const renderDetailPanel = () => {
    if (!selectedNote) {
      return null;
    }

    const summaryAdvice = splitSummaryAdvice(selectedNote.aiSummary);

    return (
      <section className="detailPanel expandableDetail">
        <div className="detailHeader">
          <div>
            <span className="detailLabel">▼ 詳細情報</span>
            <h2>{selectedNote.title}</h2>
            <p>{selectedNote.subject}</p>
          </div>
        </div>
        <dl className="detailList">
          <div><dt>タイトル</dt><dd>{selectedNote.title || "未登録"}</dd></div>
          <div><dt>科目</dt><dd>{selectedNote.subject || "未登録"}</dd></div>
          <div><dt>内容</dt><dd>{selectedNote.content || "未登録"}</dd></div>
          <div><dt>理解度</dt><dd>{getUnderstandingLevel(selectedNote) || "未登録"}</dd></div>
          <div><dt>学習日</dt><dd>{selectedNote.studyDate || "未登録"}</dd></div>
          <div><dt>学習時間</dt><dd>{getStudyMinutes(selectedNote) ? formatStudyMinutes(getStudyMinutes(selectedNote)) : "未登録"}</dd></div>
          <div><dt>次回復習日</dt><dd>{getReviewDate(selectedNote) || "未登録"}</dd></div>
          <div><dt>メモ</dt><dd>{selectedNote.memo || "未登録"}</dd></div>
          <div><dt>学習状態</dt><dd>{selectedNote.isLearned ? "学習済み" : "未完了"}</dd></div>
          <div><dt>作成日</dt><dd>{formatDateTime(selectedNote.createdAt)}</dd></div>
        </dl>
        <div className="detailActions">
          <button type="button" onClick={() => runAi("summary")} disabled={aiLoading === "summary"}>
            {aiLoading === "summary" ? "作成中..." : "AI要約・学習アドバイスを作成"}
          </button>
          <button className="purpleButton" type="button" onClick={() => runAi("questions")} disabled={aiLoading === "questions"}>
            {aiLoading === "questions" ? "作成中..." : "復習問題を作成する"}
          </button>
          <button className="learnedButton" type="button" onClick={() => toggleNoteLearned(selectedNote)} disabled={learningId === selectedNote.id}>
            {learningId === selectedNote.id
              ? "更新中..."
              : selectedNote.isLearned
                ? "学習済みを解除"
                : "学習済みにする"}
          </button>
          <button className="secondaryButton" type="button" onClick={() => editNote(selectedNote)}>編集する</button>
          <button className="deleteButton" type="button" onClick={() => deleteNote(selectedNote)}>削除する</button>
        </div>
        {aiError && <p className="errorText">{aiError}</p>}
        <section className="aiResult summaryAdviceResult">
          <h3>AI要約・学習アドバイス</h3>
          {selectedNote.aiSummary ? (
            <div className="summaryAdviceGrid">
              <article>
                <span>要約</span>
                <p>{summaryAdvice.summary || "未登録"}</p>
              </article>
              <article>
                <span>学習アドバイス</span>
                <p>{summaryAdvice.advice || "未登録"}</p>
              </article>
            </div>
          ) : (
            <p>まだAI要約・学習アドバイスはありません。</p>
          )}
        </section>
        <section className="aiResult">
          <h3>復習問題</h3>
          {selectedNote.reviewQuestions?.length ? (
            <ol>{selectedNote.reviewQuestions.map((question) => <li key={question}>{question.replace(/^Q\d\.\s*/, "")}</li>)}</ol>
          ) : (
            <p>まだ復習問題はありません。</p>
          )}
        </section>
      </section>
    );
  };

  if (!token || !user) {
    return (
      <main className="loginPage">
        <section className="loginCard">
          <div className="logoMark"><AppIcon name="app" /></div>
          <h1>学習メモAI管理アプリ</h1>
          <p>
            {authMode === "reset"
              ? "登録したメールと新しいパスワードを入力してください。"
              : "学習メモを保存し、AI要約・学習アドバイスと復習問題で理解を深めます。"}
          </p>

          <form onSubmit={submitAuth}>
            {authMode === "register" && (
              <label>
                ユーザー名
                <input name="username" value={loginForm.username} onChange={updateAuthForm} placeholder="例: Alex" />
              </label>
            )}
            <label>
              メール
              <input name="email" value={loginForm.email} onChange={updateAuthForm} placeholder="user@example.com" />
            </label>
            <label>
              {authMode === "reset" ? "新しいパスワード" : "パスワード"}
              <input name="password" type="password" value={loginForm.password} onChange={updateAuthForm} placeholder="6文字以上" />
            </label>
            <button type="submit">
              {authMode === "login" && "ログインする"}
              {authMode === "register" && "登録する"}
              {authMode === "reset" && "パスワードを更新する"}
            </button>
            {authError && <p className="errorText">{authError}</p>}
            {authMessage && <p className="successText">{authMessage}</p>}
          </form>

          <div className="authLinks">
            {authMode === "login" && (
              <>
                <button className="plainButton" type="button" onClick={() => setAuthMode("register")}>新規登録はこちら</button>
                <button className="plainButton" type="button" onClick={() => setAuthMode("reset")}>パスワードを忘れた場合</button>
              </>
            )}
            {authMode !== "login" && (
              <button className="plainButton" type="button" onClick={() => setAuthMode("login")}>ログインへ戻る</button>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`dashboardShell ${sidebarOpen ? "sidebarOpen" : "sidebarClosed"}`}>
      <aside className="dashboardSidebar">
        <div className="brand">
          <span className="brandIcon"><AppIcon name="app" /></span>
          <strong>学習メモAI管理アプリ</strong>
        </div>
        <button className={screen === "dashboard" ? "menuActive" : "menuButton"} type="button" onClick={() => navigate("/dashboard")}>
          <AppIcon name="dashboard" />ダッシュボード
        </button>
        <button className={screen === "editor" ? "menuActive" : "menuButton"} type="button" onClick={openNewNote}>
          <AppIcon name="add" />新しいメモを追加
        </button>
        <button className={screen === "check" ? "menuActive" : "menuButton"} type="button" onClick={() => navigate("/check")}><AppIcon name="spark" />AI理解度チェック</button>
        <button className={screen === "stats" ? "menuActive" : "menuButton"} type="button" onClick={() => navigate("/stats")}><AppIcon name="calendar" />学習カレンダー</button>
        <button className={screen === "profile" ? "menuActive" : "menuButton"} type="button" onClick={() => navigate("/profile")}>
          <AppIcon name="profile" />プロフィール
        </button>
        <div className="sidebarStudyCard">
          <span>今週の学習時間</span>
          <strong>{weeklyStudyText}</strong>
          <div className="miniBars" aria-hidden="true">
            {weeklyDailyMinutes.map((minutes, index) => (
              <i key={weekDates[index]} style={{ height: `${Math.max(8, Math.round((minutes / maxWeeklyDailyMinutes) * 38))}px` }} />
            ))}
          </div>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebarBackdrop" type="button" aria-label="メニューを閉じる" onClick={() => setSidebarOpen(false)} />}

      <section className="dashboardMain">
        <header className="dashboardHeader">
          <button
            className="hamburger"
            type="button"
            aria-label={sidebarOpen ? "メニューを閉じる" : "メニューを開く"}
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((current) => !current)}
          >
            <MenuIcon />
          </button>
          <h1>
            {screen === "dashboard" && "学習ダッシュボード"}
            {screen === "editor" && "学習メモ登録"}
            {screen === "check" && "AI理解度チェック"}
            {screen === "stats" && "学習カレンダー"}
            {screen === "profile" && "プロフィール"}
          </h1>
          <div className="headerTools">
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="検索（タイトル・科目・内容・メモ）" />
            <button className="logoutButton" type="button" onClick={logout}>ログアウト</button>
          </div>
        </header>

        {screen === "profile" && (
          <section className="profilePanel">
            <h2>プロフィール</h2>
            <form onSubmit={submitProfile}>
              <label>
                ユーザー名
                <input name="username" value={profile.username} onChange={updateProfile} />
              </label>
              <label>
                学校名・所属
                <input name="schoolName" value={profile.schoolName} onChange={updateProfile} placeholder="例: ABCスクール" />
              </label>
              <label>
                学習目標
                <textarea name="learningGoal" value={profile.learningGoal} onChange={updateProfile} placeholder="例: Reactでアプリを作れるようになる" />
              </label>
              <button type="submit">保存する</button>
              {profileMessage && <p className="successText">{profileMessage}</p>}
            </form>
          </section>
        )}

        {screen === "editor" && (
          <section className="editorPanel">
            <h2>{editingId ? "学習メモ編集" : "新しい学習メモ"}</h2>
            <form onSubmit={submitNote}>
              <section className="imageAiBox">
                <h3>画像から入力</h3>
                <p>ノートや教材の画像を読み取り、フォームに自動入力します。</p>
                <div className="imageAiControls">
                  <input
                    accept="image/*"
                    type="file"
                    onChange={(event) => {
                      setImageInput(event.target.files?.[0] || null);
                      setImageAiError("");
                      setRecognizedText("");
                    }}
                  />
                  <button className="secondaryButton" type="button" onClick={extractNoteFromImage} disabled={imageAiLoading}>
                    {imageAiLoading ? "認識中..." : "画像からテキスト認識"}
                  </button>
                </div>
                {imageAiError && <p className="errorText">{imageAiError}</p>}
                {recognizedText && (
                  <label>
                    認識テキスト
                    <textarea value={recognizedText} readOnly />
                  </label>
                )}
              </section>
              <label>タイトル *<input name="title" value={noteForm.title} onChange={updateNoteForm} placeholder="ReactのuseState" /></label>
              <label>科目（AI自動入力可）<input name="subject" value={noteForm.subject} onChange={updateNoteForm} placeholder="例: React" /></label>
              <label>内容 *<textarea name="content" value={noteForm.content} onChange={updateNoteForm} placeholder="学習した内容を書きます。" /></label>
              <div className="formColumns">
                <label>学習日<input name="studyDate" type="date" value={noteForm.studyDate} onChange={updateNoteForm} /></label>
                <label>学習時間（分）<input name="studyMinutes" type="number" min="0" step="1" value={noteForm.studyMinutes} onChange={updateNoteForm} placeholder="例: 45" /></label>
              </div>
              <div className="formColumns">
                <label>理解度<select name="understanding" value={noteForm.understanding} onChange={updateNoteForm}>
                  <option value="よく理解した">よく理解した</option>
                  <option value="普通">普通</option>
                  <option value="まだ難しい">まだ難しい</option>
                </select></label>
              </div>
              <label>次回復習日<input name="reviewDate" type="date" value={noteForm.reviewDate} onChange={updateNoteForm} /></label>
              <label>メモ<textarea name="memo" value={noteForm.memo} onChange={updateNoteForm} placeholder="補足メモを書きます。" /></label>
              {editingId && (
                <section className="imageAiBox">
                  <h3>AI内容編集</h3>
                  <p>詳細情報に表示されるAI要約・学習アドバイスと復習問題を編集できます。</p>
                  <label>AI要約・学習アドバイス<textarea name="aiSummary" value={noteForm.aiSummary} onChange={updateNoteForm} placeholder="AI要約・学習アドバイスを編集できます。" /></label>
                  <label>復習問題<textarea name="reviewQuestions" value={noteForm.reviewQuestions} onChange={updateNoteForm} placeholder="1行に1問ずつ入力してください。" /></label>
                </section>
              )}
              <div className="formActions">
                <button type="submit">{editingId ? "更新する" : "登録する"}</button>
                <button className="secondaryButton" type="button" onClick={() => navigate("/dashboard")}>戻る</button>
              </div>
              {statusMessage && <p className="successText">{statusMessage}</p>}
            </form>
          </section>
        )}

        {screen === "check" && (
          <section className="recentPanel checkPanel">
            <div className="panelTitle">
              <h2>AI理解度チェック</h2>
              <span className="summaryPill">対象 {checkSourceCount}件</span>
            </div>
            <p className="panelLead">学習済み、またはよく理解したメモの詳細情報に保存されている復習問題から10問を表示し、回答後にAIが理解度を評価します。</p>

            <div className="checkStartBox">
              <button type="button" onClick={startAiCheck} disabled={checkLoading === "questions" || checkSourceCount === 0}>
                {checkLoading === "questions" ? "問題読み込み中..." : "保存済みの復習問題でチェック開始"}
              </button>
              {checkSourceCount === 0 && <p className="emptyMini">AI理解度チェックには、学習済み、またはよく理解したメモが必要です。</p>}
            </div>

            {checkError && <p className="errorText">{checkError}</p>}

            {checkQuestions.length > 0 && (
              <div className="checkQuestionList">
                <div className="checkQuestionToolbar">
                  <button className="secondaryButton" type="button" onClick={startAiCheck} disabled={checkLoading === "questions"}>
                    {checkLoading === "questions" ? "更新中..." : "問題を更新する"}
                  </button>
                </div>
                {checkQuestions.map((question, index) => (
                  <article className="checkQuestionCard" key={question.id}>
                    <div className="checkQuestionHeader">
                      <strong>Q{index + 1}</strong>
                      <span>{question.subject || "学習メモ"} / {question.noteTitle || "学習済み"}</span>
                    </div>
                    <p>{question.question}</p>
                    <textarea
                      value={checkAnswers[question.id] || ""}
                      onChange={(event) => updateCheckAnswer(question.id, event.target.value)}
                      placeholder="ここに自分の答えを書いてください。"
                    />
                  </article>
                ))}
                <button className="purpleButton" type="button" onClick={submitAiCheck} disabled={checkLoading === "evaluation"}>
                  {checkLoading === "evaluation" ? "AI評価中..." : "AIに評価してもらう"}
                </button>
              </div>
            )}

            {checkResult && (
              <section className="checkResultBox">
                <div className="checkScore">
                  <span>スコア</span>
                  <strong>{checkResult.score}点</strong>
                  <p>{checkResult.level}</p>
                </div>
                <div className="checkResultText">
                  <h3>評価まとめ</h3>
                  <p>{checkResult.summary}</p>
                  <h3>良かった点</h3>
                  {checkResult.goodPoints?.length ? (
                    <ul>{checkResult.goodPoints.map((item) => <li key={item}>{item}</li>)}</ul>
                  ) : (
                    <p>良かった点はまだありません。</p>
                  )}
                  <h3>復習ポイント</h3>
                  {checkResult.reviewPoints?.length ? (
                    <ul>{checkResult.reviewPoints.map((item) => <li key={item}>{item}</li>)}</ul>
                  ) : (
                    <p>復習ポイントはまだありません。</p>
                  )}
                  <h3>次にやること</h3>
                  <p>{checkResult.advice}</p>
                </div>
              </section>
            )}
          </section>
        )}

        {screen === "stats" && (
          <section className="calendarPage">
            <div className="calendarHeroGrid">
              <article className="calendarHeroCard blue">
                <div className="calendarHeroIcon"><AppIcon name="book" /></div>
                <div><span>今月の学習</span><strong>{calendarStudyCount}件</strong></div>
              </article>
              <article className="calendarHeroCard purple">
                <div className="calendarHeroIcon"><AppIcon name="calendar" /></div>
                <div><span>復習予定</span><strong>{calendarReviewCount}件</strong></div>
              </article>
              <article className="calendarHeroCard green">
                <div className="calendarHeroIcon"><AppIcon name="check" /></div>
                <div><span>学習済み</span><strong>{calendarLearnedCount}件</strong></div>
              </article>
              <article className="calendarHeroCard blue">
                <div className="calendarHeroIcon"><AppIcon name="report" /></div>
                <div><span>学習時間</span><strong>{formatStudyMinutes(calendarStudyMinutes)}</strong></div>
              </article>
            </div>

            <div className="calendarWorkspace">
              <section className="calendarPanel">
                <div className="calendarControlBar">
                  <button className="secondaryButton" type="button" onClick={() => changeCalendarMonth(-1)}>前月</button>
                  <h2>{calendarMonthLabel}</h2>
                  <button className="secondaryButton" type="button" onClick={() => changeCalendarMonth(1)}>次月</button>
                </div>

                <div className="learningCalendar">
                  {["月", "火", "水", "木", "金", "土", "日"].map((dayName) => (
                    <div className="calendarWeekday" key={dayName}>{dayName}</div>
                  ))}
                  {calendarDays.map((day) => {
                    const studyItems = notes.filter((note) => !note.isLearned && dateOnly(note.studyDate) === day.date);
                    const reviewItems = notes.filter((note) => !note.isLearned && getReviewDate(note) === day.date);
                    const isSelected = selectedCalendarDate === day.date;

                    return (
                      <button
                        className={`calendarDay ${day.currentMonth ? "" : "muted"} ${day.today ? "today" : ""} ${isSelected ? "selected" : ""}`}
                        type="button"
                        key={day.date}
                        onClick={() => {
                          setSelectedCalendarDate(day.date);
                          setSelectedNote(null);
                        }}
                      >
                        <div className="calendarDayNumber">
                          <strong>{day.day}</strong>
                        </div>
                        <div className="calendarEvents">
                          {studyItems.length > 0 && <span className="calendarBadge study">学習</span>}
                          {reviewItems.length > 0 && <span className="calendarBadge review">復習</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {selectedNote && renderDetailPanel()}
              </section>

              <aside className="selectedDayPanel">
                <div className="selectedDayHeader">
                  <h2>選択した日: {selectedDateLabel}</h2>
                  <p>この日のメモ ({selectedCalendarItems.length}件)</p>
                </div>

                {selectedCalendarItems.length === 0 ? (
                  <p className="emptyState">この日の学習メモはありません</p>
                ) : (
                  <div className="selectedDayList">
                    {selectedCalendarItems.map(({ note, type, label }) => (
                      <button className="selectedDayCard" type="button" key={`${type}-${note.id}`} onClick={() => toggleSelectedNote(note)}>
                        <span className={`selectedDayIcon ${type}`}><AppIcon name={type === "study" ? "book" : "calendar"} /></span>
                        <span className="selectedDayText">
                          <strong>{note.title}</strong>
                          <span className={`calendarBadge ${type}`}>{label}</span>
                        </span>
                        <span className="selectedDayMinutes">{formatStudyMinutes(getStudyMinutes(note))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </aside>
            </div>

          </section>
        )}

        {screen === "dashboard" && (
          <>
            <section className="dailyAdviceCard">
              <div className="dailyAdviceIcon"><AppIcon name="spark" /></div>
              <div>
                <div className="dailyAdviceHeader">
                  <h2>本日のAI学習アドバイス</h2>
                  <span>{dailyAdvice?.date || todayText}</span>
                </div>
                {dailyAdviceLoading ? (
                  <p>AIが今日の学習状況を確認しています...</p>
                ) : dailyAdviceError ? (
                  <p className="errorText">{dailyAdviceError}</p>
                ) : (
                  <p>{dailyAdvice?.content || "今日のAI学習アドバイスはまだありません。"}</p>
                )}
              </div>
            </section>

            <section className="metricGrid">
              <button
                className={`metricCard blue ${activeFilter === "today" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveFilter((current) => (current === "today" ? "all" : "today"))}
              >
                <div className="metricIcon"><AppIcon name="book" /></div>
                <p>本日追加したメモ</p>
                <strong>{todayCount}件</strong>
              </button>
              <button
                className={`metricCard orange ${activeFilter === "todayLearning" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveFilter((current) => (current === "todayLearning" ? "all" : "todayLearning"))}
              >
                <div className="metricIcon"><AppIcon name="calendar" /></div>
                <p>本日の学習</p>
                <strong>{todayLearningCount}件</strong>
              </button>
              <button
                className={`metricCard sky ${activeFilter === "normal" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveFilter((current) => (current === "normal" ? "all" : "normal"))}
              >
                <div className="metricIcon"><AppIcon name="report" /></div>
                <p>普通</p>
                <strong>{normalCount}件</strong>
              </button>
              <button
                className={`metricCard red ${activeFilter === "difficult" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveFilter((current) => (current === "difficult" ? "all" : "difficult"))}
              >
                <div className="metricIcon"><AppIcon name="brain" /></div>
                <p>まだ難しい</p>
                <strong>{difficultCount}件</strong>
              </button>
              <button
                className={`metricCard green ${activeFilter === "easy" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveFilter((current) => (current === "easy" ? "all" : "easy"))}
              >
                <div className="metricIcon"><AppIcon name="check" /></div>
                <p>よく理解した</p>
                <strong>{easyCount}件</strong>
              </button>
              <button
                className={`metricCard indigo ${activeFilter === "learned" ? "active" : ""}`}
                type="button"
                onClick={() => setActiveFilter((current) => (current === "learned" ? "all" : "learned"))}
              >
                <div className="metricIcon"><AppIcon name="app" /></div>
                <p>学習済み</p>
                <strong>{learnedCount}件</strong>
              </button>
            </section>

            <section className="recentPanel">
              <div className="panelTitle">
                <h2>{listTitle}</h2>
                <button
                  className="plainButton"
                  type="button"
                  onClick={() => {
                    setActiveFilter("all");
                    setKeyword("");
                    setSelectedNote(null);
                  }}
                >
                  すべて見る
                </button>
              </div>

              {dashboardNotes.length === 0 ? (
                <p className="emptyState">該当する学習メモはありません</p>
              ) : (
                <div className="memoTable">
                <div className="memoTableHead">
                    <button className="sortHeader" type="button" onClick={() => changeSort(setDashboardSort, "title")}>{sortLabel(dashboardSort, "title", "タイトル")}</button>
                    <button className="sortHeader" type="button" onClick={() => changeSort(setDashboardSort, "subject")}>{sortLabel(dashboardSort, "subject", "科目")}</button>
                    <button className="sortHeader" type="button" onClick={() => changeSort(setDashboardSort, "understanding")}>{sortLabel(dashboardSort, "understanding", "理解度")}</button>
                    <button className="sortHeader" type="button" onClick={() => changeSort(setDashboardSort, "studyDate")}>{sortLabel(dashboardSort, "studyDate", "学習日")}</button>
                    <button className="sortHeader" type="button" onClick={() => changeSort(setDashboardSort, "reviewDate")}>{sortLabel(dashboardSort, "reviewDate", "次回復習日")}</button>
                    <span></span>
                  </div>
                  {dashboardNotes.map((note) => (
                    <React.Fragment key={note.id}>
                      <div className="memoTableRow">
                        <strong>{note.title}</strong>
                        <span>{note.subject}</span>
                        <span className={`levelBadge ${isDifficultNote(note) ? "hard" : getUnderstandingLevel(note) === "よく理解した" ? "easy" : "normal"}`}>
                          {getUnderstandingLevel(note)}
                        </span>
                        <span>{note.studyDate || "未登録"}</span>
                        <span>{getReviewDate(note) || "未登録"}</span>
                        <button className="secondaryButton" type="button" onClick={() => toggleSelectedNote(note)}>
                          {selectedNote?.id === note.id ? "閉じる" : "詳細"}
                        </button>
                      </div>
                      {selectedNote?.id === note.id && renderDetailPanel()}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>

      <section className={`studyChatWidget ${chatOpen ? "open" : ""}`} aria-label="AI学習チャット">
        {chatOpen && (
          <div className="studyChatPanel">
            <div className="studyChatHeader">
              <div>
                <strong>AI学習チャット</strong>
                <span>ヒントで学習をサポート</span>
              </div>
              <button className="closeButton" type="button" aria-label="AI学習チャットを閉じる" onClick={() => setChatOpen(false)}>
                ×
              </button>
            </div>
            <div className="studyChatMessages">
              {chatMessages.map((message, index) => (
                <div className={`studyChatBubble ${message.role}`} key={`${message.role}-${index}`}>
                  {message.content}
                </div>
              ))}
              {chatLoading && <div className="studyChatBubble assistant">ヒントを考えています...</div>}
            </div>
            {chatError && <p className="studyChatError">{chatError}</p>}
            <form className="studyChatForm" onSubmit={sendStudyChatMessage}>
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="質問や困っていることを書く..."
                rows="2"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendStudyChatMessage(event);
                  }
                }}
              />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>送信</button>
            </form>
          </div>
        )}
        <button
          className="studyChatToggle"
          type="button"
          aria-label={chatOpen ? "AI学習チャットを閉じる" : "AI学習チャットを開く"}
          onClick={() => setChatOpen((current) => !current)}
        >
          <AppIcon name={chatOpen ? "check" : "spark"} />
        </button>
      </section>

    </main>
  );
}

export default App;
