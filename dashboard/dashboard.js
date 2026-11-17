// Community service hours required for the final exam (érettségi)
const CS_REQUIRED_HOURS = 50;
const EXAM_LOOKAHEAD_DAYS = 14;
const HOMEWORK_LOOKBACK_DAYS = 14;
const MAX_HOMEWORK_REQUESTS = 12;
const LAYOUT_STORAGE_KEY = "dashboardLayout";

const DashboardUtils = {
  t(key, params = {}) {
    let text = LanguageManager.t(key);
    Object.entries(params).forEach(([name, value]) => {
      text = text.replace(`{${name}}`, value);
    });
    return text;
  },

  locale() {
    return LanguageManager.getCurrentLanguage?.() || "hu";
  },

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
  },

  formatGradeValue(value) {
    const trimmedValue = value?.trim() || "";
    if (trimmedValue.toLowerCase() === "szöveges") {
      return "Sz";
    }
    return trimmedValue;
  },

  parseNumber(value) {
    const number = parseFloat(String(value ?? "").replace(",", "."));
    return isNaN(number) ? 0 : number;
  },

  gradeClass(average) {
    if (!average) return "";
    return `grade-${Math.min(5, Math.max(1, Math.floor(average + 0.5)))}`;
  },

  startOfDay(date) {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    return day;
  },

  addDays(date, days) {
    const day = new Date(date);
    day.setDate(day.getDate() + days);
    return day;
  },

  isoDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },

  daysBetween(from, to) {
    return Math.round((this.startOfDay(to) - this.startOfDay(from)) / 86400000);
  },

  formatTime(date) {
    return date.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
  },

  formatShortDate(date) {
    return new Intl.DateTimeFormat(this.locale(), { month: "short", day: "numeric" }).format(date);
  },

  formatWeekday(date) {
    return new Intl.DateTimeFormat(this.locale(), { weekday: "long" }).format(date);
  },

  relativeDay(date) {
    const diff = this.daysBetween(new Date(), date);
    if (diff === 0) return LanguageManager.t("common.today");
    if (diff === 1) return LanguageManager.t("common.tomorrow");
    if (diff > 1 && diff < 7) {
      return `${this.formatWeekday(date)}, ${this.formatShortDate(date)}`;
    }
    return this.formatShortDate(date);
  },

  formatDateRange(startIso, endIso) {
    const formatter = new Intl.DateTimeFormat(this.locale(), {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const start = startIso ? new Date(startIso) : null;
    const end = endIso ? new Date(endIso) : null;
    if (!start || isNaN(start)) return "";
    if (!end || isNaN(end) || start.toDateString() === end.toDateString()) {
      return formatter.format(start);
    }
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  },

  parseHungarianDate(text) {
    const match = text?.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  },
};

const DashboardApi = {
  url(path) {
    return `https://${window.location.hostname}${path}`;
  },

  async request(path, accept) {
    const response = await fetch(this.url(path), {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: accept,
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!response.ok) {
      throw new Error(`API request failed with status: ${response.status}`);
    }
    return response;
  },

  async json(path) {
    const response = await this.request(path, "application/json, text/javascript, */*; q=0.01");
    return response.json();
  },

  async text(path) {
    const response = await this.request(path, "text/html");
    return response.text();
  },
};

class DashboardDataManager {
  constructor() {
    this.dashboardData = {
      recentGrades: [],
      subjects: null,
      lessons: null,
      exams: [],
      homework: null,
      absences: null,
      notes: [],
      news: [],
      communityService: null,
    };
  }

  // --- Data scraped from the original Faliújság page ---

  extractRecentGrades() {
    const gradeRows = document.querySelectorAll("#legutobbiErtekelesek tr:not(:first-child)");

    this.dashboardData.recentGrades = Array.from(gradeRows)
      .map((row) => {
        const gradeValue = row.querySelector('span[style*="font-size: 200%"]')?.textContent;
        const gradeInfo = row.querySelector('span[style*="float: right"]')?.textContent;
        if (!gradeValue || !gradeInfo) return null;

        const [fullSubject, date] = gradeInfo.split("\n").map((str) => str.trim());
        const { subject, type, dateInSubject } = this.parseSubjectInformation(fullSubject);

        return {
          value: DashboardUtils.formatGradeValue(gradeValue),
          subject,
          date: date?.trim() || "",
          type: type || LanguageManager.t("dashboard.evaluation"),
          dateInSubject: dateInSubject || null,
        };
      })
      .filter(Boolean);
  }

  parseSubjectInformation(fullSubject) {
    const hungarianMonths = [
      "január", "február", "március", "április", "május", "június",
      "július", "augusztus", "szeptember", "október", "november", "december",
    ];
    const datePattern = new RegExp(`(${hungarianMonths.join("|")})\\s+(\\d{1,2})\\.?$`, "i");
    const dateMatch = fullSubject.match(datePattern);

    if (dateMatch) {
      return {
        subject: fullSubject.substring(0, dateMatch.index).trim(),
        type: "",
        dateInSubject: dateMatch[0].trim(),
      };
    }

    const months = [
      "january", "february", "march", "april", "may", "june",
      "july", "august", "september", "october", "november", "december",
    ].map((month) => LanguageManager.t(`months.${month}`));
    const monthMatch = fullSubject.match(new RegExp(months.join("|"), "i"));

    if (monthMatch) {
      const monthIndex = fullSubject.lastIndexOf(monthMatch[0]);
      return {
        subject: fullSubject.substring(0, monthIndex).trim(),
        type: fullSubject.substring(monthIndex).trim(),
      };
    }

    return { subject: fullSubject, type: "" };
  }

  extractNotes() {
    const noteRows = document.querySelectorAll("#legutobbiFeljegyzesek tr:not(:first-child)");

    this.dashboardData.notes = Array.from(noteRows)
      .map((row) => {
        const spans = row.querySelectorAll("span");
        if (spans.length < 3) return null;
        return {
          title: spans[0]?.textContent?.trim() || "",
          author: spans[1]?.textContent?.trim() || "",
          date: spans[2]?.textContent?.trim() || "",
        };
      })
      .filter(Boolean);
  }

  extractExamsFromPage() {
    const examRows = document.querySelectorAll("#legutobbiBejelentettSzamonkeres tr:not(:first-child)");

    return Array.from(examRows)
      .map((row) => {
        const spans = row.querySelectorAll("span");
        if (spans.length < 4) return null;
        return {
          date: DashboardUtils.parseHungarianDate(spans[0]?.textContent),
          subject: spans[1]?.textContent?.trim() || "",
          name: "",
          type: spans[3]?.textContent?.trim() || "",
        };
      })
      .filter(Boolean);
  }

  // --- Data loaded from the KRÉTA APIs used by the other pages ---

  async loadLessons() {
    const today = DashboardUtils.startOfDay(new Date());
    const start = DashboardUtils.isoDate(DashboardUtils.addDays(today, -HOMEWORK_LOOKBACK_DAYS));
    const end = DashboardUtils.isoDate(DashboardUtils.addDays(today, EXAM_LOOKAHEAD_DAYS));
    const events = await DashboardApi.json(
      `/api/CalendarApi/GetTanuloOrarend?tanarId=-1&osztalyCsoportId=-1&tanuloId=-1&teremId=-1&kellCsengetesiRendMegjelenites=false&csakOrarendiOra=false&kellTanoranKivuliFoglalkozasok=false&kellTevekenysegek=false&kellTanevRendje=true&szuresTanevRendjeAlapjan=false&kellOraTemaTooltip=True&start=${start}&end=${end}&_=${Date.now()}`,
    );

    this.dashboardData.lessons = (Array.isArray(events) ? events : [])
      .filter((event) => [1, 2, 3, 4, 5, 6].includes(event.oraType))
      .map((event) => {
        const titleParts = event.title ? event.title.split("\n") : [];
        const isSpecialDay = event.oraType === 5;
        return {
          start: new Date(event.start),
          end: new Date(event.end),
          isSpecialDay,
          subject: isSpecialDay
            ? event.title || ""
            : event.Tantargy || event.TantargyKategoria || titleParts[0] || "",
          teacher: isSpecialDay ? "" : titleParts[1] || "",
          room: isSpecialDay ? "" : (titleParts[2] || "").replace(/[()]/g, ""),
          topic: event.Tema || "",
          isCancelled:
            event.isElmaradt || event.Elmaradt || event.oraType === 6 ||
            (event.title || "").toLowerCase().includes("elmarad"),
          isSubstituted: !!event.helyettesitoId,
          hasHomework: !!event.hasHaziFeladat,
          hasTest: !!event.hasBejelentettSzamonkeres,
          testId: event.BejelentettSzamonkeresIdList?.[0] ?? null,
          lessonId: event.id || event.ID || null,
        };
      })
      .filter((lesson) => !isNaN(lesson.start))
      .sort((a, b) => a.start - b.start);
  }

  async loadExams() {
    const today = DashboardUtils.startOfDay(new Date());
    const lessons = this.dashboardData.lessons;

    if (!lessons) {
      this.dashboardData.exams = this.extractExamsFromPage().filter(
        (exam) => !exam.date || exam.date >= today,
      );
      return;
    }

    const upcoming = lessons.filter((lesson) => lesson.hasTest && !lesson.isSpecialDay && lesson.start >= today);
    let details = [];
    if (upcoming.length) {
      try {
        const data = await DashboardApi.json(
          `/api/TanuloBejelentettSzamonkeresekApi/GetBejelentettSzamonkeresekGrid?sort=SzamonkeresDatuma-asc~Oraszam-asc&page=1&pageSize=1000&group=&filter=&data=%7B%22RegiSzamonkeresekElrejtese%22%3Atrue%7D&_=${Date.now()}`,
        );
        details = data.Data || [];
      } catch (error) {
        console.error("Error loading exam details:", error);
      }
    }

    this.dashboardData.exams = upcoming.map((lesson) => {
      const detail = details.find((item) => String(item.ID) === String(lesson.testId));
      return {
        date: lesson.start,
        subject: lesson.subject,
        name: detail?.SzamonkeresMegnevezes || lesson.topic || "",
        type: detail?.ErtekelesModNev || LanguageManager.t("timetable.test_indicator"),
      };
    });
  }

  async loadHomework() {
    const lessons = this.dashboardData.lessons;
    if (!lessons) return;

    const today = DashboardUtils.startOfDay(new Date());
    const completed = await DashboardHomework.getCompleted();
    const candidates = lessons
      .filter((lesson) => lesson.hasHomework && lesson.lessonId && !completed.includes(lesson.lessonId))
      .sort((a, b) => b.start - a.start)
      .slice(0, MAX_HOMEWORK_REQUESTS);

    const results = await Promise.allSettled(
      candidates.map(async (lesson) => ({ lesson, details: await DashboardHomework.loadDetails(lesson.lessonId) })),
    );

    this.dashboardData.homework = results
      .filter((result) => result.status === "fulfilled" && result.value.details)
      .map(({ value: { lesson, details } }) => ({
        lessonId: lesson.lessonId,
        subject: lesson.subject,
        content: details.content,
        deadline: DashboardUtils.parseHungarianDate(details.deadline),
        deadlineText: details.deadline,
      }))
      .filter((item) => !item.deadline || item.deadline >= today)
      .sort((a, b) => (a.deadline || Infinity) - (b.deadline || Infinity));
  }

  async getTanuloId() {
    const cacheKey = `tanuloId_${window.location.hostname}`;
    const cached = await storageManager.get(cacheKey, null);
    if (cached) return cached;

    const html = await DashboardApi.text("/TanuloErtekeles/Osztalyzatok");
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tanuloId = doc.querySelector("#TanuloId")?.value;
    if (!tanuloId) throw new Error("Student ID not found");
    await storageManager.set(cacheKey, tanuloId);
    return tanuloId;
  }

  async loadSubjects() {
    const tanuloId = await this.getTanuloId();
    const fetchGrid = (taskId) =>
      DashboardApi.json(
        `/api/TanuloErtekelesByTanuloApi/GetTanuloErtekelesByTanuloGridTanuloView?sort=&group=&filter=&data=${encodeURIComponent(
          JSON.stringify({ tanuloId: String(tanuloId), oktatasiNevelesiFeladatId: taskId, isOsztalyAtlagMegjelenik: "True" }),
        )}&_=${Date.now()}`,
      );

    let data = await fetchGrid("7895");
    if (data.Data?.length === 1 && data.Data[0].ID === 0) {
      data = await fetchGrid("1160");
    }

    this.dashboardData.subjects = (data.Data || [])
      .filter((subject) => subject.TantargyNev && subject.TantargyNev !== "Magatartás/Szorgalom")
      .map((subject) => ({
        name: subject.TantargyNev,
        average: DashboardUtils.parseNumber(subject.Atlag),
        classAverage: DashboardUtils.parseNumber(subject.OsztalyAtlag),
      }))
      .filter((subject) => subject.average > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "hu"));
  }

  async loadAbsences() {
    const data = await DashboardApi.json(
      `/api/HianyzasokApi/GetHianyzasGrid?sort=MulasztasDatum-desc&page=1&pageSize=500&group=&filter=&data=%7B%7D&_=${Date.now()}`,
    );

    this.dashboardData.absences = (data.Data || []).map((item) => {
      let status = "pending";
      if (item.Igazolt_BOOL === true) {
        status = "justified";
      } else if (item.Igazolt_BOOL === false && item.IgazolasTipus !== null) {
        status = "unjustified";
      }
      return {
        date: new Date(item.MulasztasDatum),
        subject: item.Targy || "",
        isLate: item.MulasztasTipus === 1499,
        minutes: item.KesesPercben || 0,
        status,
      };
    });
  }

  async loadNews() {
    const data = await DashboardApi.json(
      `/Intezmeny/Faliujsag/GetMoreEntries?startindex=0&range=10&_=${Date.now()}`,
    );
    if (!Array.isArray(data.FaliujsagElemek)) return;

    this.dashboardData.news = data.FaliujsagElemek.map((item) => {
      let date = "";
      if (item.DatumNap && item.DatumHonap && item.DatumEv) {
        date = `${item.DatumEv}. ${item.DatumHonap} ${item.DatumNap}.`;
      } else if (item.Idopont) {
        const match = item.Idopont.match(/\/Date\((\d+)\)\//);
        if (match) date = new Date(parseInt(match[1])).toLocaleDateString("hu-HU");
      }

      const content = (item.EsemenySzovege || "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();

      return {
        title: item.EsemenyCime || "",
        content,
        date,
        author: [item.Nev, item.Munkakor ? `(${item.Munkakor})` : ""].filter(Boolean).join(" "),
      };
    });
  }

  async loadCommunityService() {
    const data = await DashboardApi.json(
      `/api/TanuloKozossegiSzolgalataiApi/GetTanuloKozossegiSzolgalataiGrid?sort=IntervallumKezdete-desc&group=&filter=&data={}&_=${Date.now()}`,
    );

    this.dashboardData.communityService = (data.Data || []).map((item) => ({
      place: item.TeljesitesiHelye || "",
      activity: item.KozossegiSzolgalatTipusa_DNAME || "",
      hours: Number(item.Oraszam) || 0,
      start: item.IntervallumKezdete || "",
      end: item.IntervallumVege || "",
      note: item.Megjegyzes?.trim() || "",
    }));
  }

  async run(name, task) {
    try {
      await task();
    } catch (error) {
      console.error(`Error loading dashboard data (${name}):`, error);
    }
  }

  async extractAllData() {
    this.extractRecentGrades();
    this.extractNotes();

    await Promise.all([
      this.run("lessons", async () => {
        await this.loadLessons();
        await Promise.all([
          this.run("exams", () => this.loadExams()),
          this.run("homework", () => this.loadHomework()),
        ]);
      }),
      this.run("subjects", () => this.loadSubjects()),
      this.run("absences", () => this.loadAbsences()),
      this.run("news", () => this.loadNews()),
      this.run("community service", () => this.loadCommunityService()),
    ]);

    if (!this.dashboardData.lessons) {
      await this.run("exams", () => this.loadExams());
    }

    return this.dashboardData;
  }
}

// Shares the "completedHomework" storage format with the timetable page
const DashboardHomework = {
  async getCompleted() {
    try {
      const value = await storageManager.get("completedHomework");
      return value ? JSON.parse(value) : [];
    } catch (error) {
      return [];
    }
  },

  async markCompleted(lessonId) {
    const completed = await this.getCompleted();
    if (!completed.includes(lessonId)) {
      completed.push(lessonId);
      await storageManager.set("completedHomework", JSON.stringify(completed));
    }
  },

  async loadDetails(lessonId) {
    const now = new Date();
    const date = `${now.getFullYear()}.%20${String(now.getMonth() + 1).padStart(2, "0")}.%20${String(now.getDate()).padStart(2, "0")}.%200:00:00`;
    const html = await DashboardApi.text(
      `/Orarend/InformaciokOrarend/GetHaziFeladat_Tab?Id=${lessonId}&EventType=2&Date=${date}&_=${Date.now()}`,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.querySelector(".panel-body");
    if (!body) return null;

    return {
      content: body.textContent.replace(/\s+/g, " ").trim(),
      deadline: doc.querySelector(".panel-footer")?.textContent.replace("Határidő:", "").trim() || "",
    };
  },
};

class DashboardRenderer {
  constructor(data, settings = {}) {
    this.data = data;
    this.settings = settings;
    this.t = DashboardUtils.t.bind(DashboardUtils);
    this.esc = DashboardUtils.escapeHtml;
  }

  // --- Building blocks ---

  card({ title, body, link, linkText, className = "", badge = "" }) {
    return `
      <section class="widget-card card ${className}">
        <div class="widget-header">
          <h2 class="widget-card-title">${title}</h2>
          ${badge}
        </div>
        <div class="widget-content">${body}</div>
        ${link ? `
        <div class="widget-footer">
          <a href="${link}" class="more-link">
            ${linkText}
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="17" viewBox="0 0 16 17" fill="none">
              <path d="M11.2997 5.19947L5.64282 5.19947M11.2997 5.19947L11.2997 10.8563M11.2997 5.19947L4.70001 11.7991" stroke="var(--accent-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </a>
        </div>` : ""}
      </section>
    `;
  }

  empty(text = this.t("dashboard.not_supported")) {
    return `<div class="widget-empty">${text}</div>`;
  }

  countBadge(count) {
    return count ? `<span class="card-badge">${count}</span>` : "";
  }

  // --- Hero: greeting and key numbers ---

  overallAverage() {
    const subjects = this.data.subjects;
    if (!subjects?.length) return 0;
    return subjects.reduce((sum, subject) => sum + subject.average, 0) / subjects.length;
  }

  createHero() {
    const now = new Date();
    const dateText = new Intl.DateTimeFormat(DashboardUtils.locale(), {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(now);

    const stats = [];

    const average = this.overallAverage();
    if (!this.settings.hideGrades && average) {
      stats.push(this.stat(average.toFixed(2), this.t("dashboard.stat_average"), DashboardUtils.gradeClass(average)));
    }

    if (!this.settings.hideTimetable && this.data.lessons) {
      const todayLessons = this.lessonsOn(now).filter((lesson) => !lesson.isSpecialDay && !lesson.isCancelled);
      const next = todayLessons.find((lesson) => lesson.end > now);
      stats.push(
        this.stat(
          todayLessons.length,
          this.t("dashboard.stat_lessons_today"),
          "",
          next ? this.t("dashboard.stat_next_at", { time: DashboardUtils.formatTime(next.start) }) : "",
        ),
      );
    }

    if (!this.settings.hideExams) {
      const weekEnd = DashboardUtils.addDays(DashboardUtils.startOfDay(now), 7);
      const count = this.data.exams.filter((exam) => !exam.date || exam.date < weekEnd).length;
      stats.push(this.stat(count, this.t("dashboard.stat_exams_week"), count ? "stat-warning" : ""));
    }

    if (!this.settings.hideHomework && this.data.homework) {
      stats.push(this.stat(this.data.homework.length, this.t("dashboard.stat_homework")));
    }

    if (!this.settings.hideAbsences && this.data.absences) {
      const unjustified = this.data.absences.filter((a) => !a.isLate && a.status === "unjustified").length;
      const pending = this.data.absences.filter((a) => !a.isLate && a.status === "pending").length;
      stats.push(
        this.stat(
          unjustified,
          this.t("dashboard.stat_unjustified"),
          unjustified ? "stat-error" : "",
          pending ? this.t("dashboard.stat_pending", { count: pending }) : "",
        ),
      );
    }

    return `
      <section class="dash-hero">
        <div class="hero-greeting">
          <div class="hero-title-row">
            <h1 class="hero-title">${this.t("dashboard.greeting", { name: this.esc(this.userName) })}</h1>
            <div class="layout-controls">
              <button type="button" class="icon-button layout-edit" title="${this.t("dashboard.edit_layout")}" aria-label="${this.t("dashboard.edit_layout")}" aria-pressed="false">
                <svg class="icon-edit" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4zM13.5 6.5l4 4"/></svg>
                <svg class="icon-done" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
              </button>
              <button type="button" class="icon-button layout-reset" title="${this.t("dashboard.reset_layout")}" aria-label="${this.t("dashboard.reset_layout")}" hidden>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v5h5m11 2c-.5-4.5-3.37-8-8-8-2.73 0-5.93 2.27-7.3 5.5"/></svg>
              </button>
            </div>
          </div>
          <p class="hero-date">${dateText}</p>
        </div>
        ${stats.length ? `<div class="hero-stats">${stats.join("")}</div>` : ""}
      </section>
    `;
  }

  stat(value, label, className = "", hint = "") {
    return `
      <div class="stat-tile ${className}">
        <span class="stat-value">${value}</span>
        <span class="stat-label">${label}</span>
        ${hint ? `<span class="stat-hint">${hint}</span>` : ""}
      </div>
    `;
  }

  // --- Timetable ---

  lessonsOn(date) {
    return (this.data.lessons || []).filter(
      (lesson) => lesson.start.toDateString() === date.toDateString(),
    );
  }

  // Today while lessons are left, otherwise the next day that has lessons
  pickTimetableDay() {
    const now = new Date();
    const upcoming = (this.data.lessons || []).filter(
      (lesson) => !lesson.isSpecialDay && !lesson.isCancelled && lesson.end > now,
    );
    return upcoming.length ? upcoming[0].start : null;
  }

  createTimetableCard() {
    const day = this.pickTimetableDay();
    if (!this.data.lessons || !day) {
      return this.card({
        title: this.t("dashboard.lessons_title_today"),
        body: this.empty(this.data.lessons ? this.t("dashboard.no_lessons") : undefined),
        link: "/Orarend/InformaciokOrarend",
        linkText: this.t("dashboard.full_timetable"),
        className: "card-timetable",
      });
    }

    const now = new Date();
    const diff = DashboardUtils.daysBetween(now, day);
    const title =
      diff === 0
        ? this.t("dashboard.lessons_title_today")
        : diff === 1
          ? this.t("dashboard.lessons_title_tomorrow")
          : this.t("dashboard.lessons_title_day", { day: DashboardUtils.relativeDay(day) });

    const lessons = this.lessonsOn(day);
    const specialDays = lessons.filter((lesson) => lesson.isSpecialDay);
    const regular = lessons.filter((lesson) => !lesson.isSpecialDay);

    const items = regular
      .map((lesson) => {
        const isNow = lesson.start <= now && now < lesson.end && !lesson.isCancelled;
        const isPast = lesson.end <= now;
        const progress = isNow ? ((now - lesson.start) / (lesson.end - lesson.start)) * 100 : 0;
        const tags = [
          isNow ? `<span class="tag tag-accent">${this.t("dashboard.now")}</span>` : "",
          lesson.isCancelled ? `<span class="tag tag-error">${this.t("timetable.cancelled")}</span>` : "",
          lesson.isSubstituted ? `<span class="tag tag-warning">${this.t("timetable.substitution")}</span>` : "",
          lesson.hasTest ? `<span class="tag tag-warning">${this.t("timetable.test_indicator")}</span>` : "",
          lesson.hasHomework ? `<span class="tag">${this.t("timetable.homework_indicator")}</span>` : "",
        ].join("");

        return `
          <div class="lesson-item ${isNow ? "is-now" : ""} ${isPast ? "is-past" : ""} ${lesson.isCancelled ? "is-cancelled" : ""}">
            <div class="lesson-time">
              <span>${DashboardUtils.formatTime(lesson.start)}</span>
              <span class="lesson-time-end">${DashboardUtils.formatTime(lesson.end)}</span>
            </div>
            <div class="lesson-details">
              <div class="lesson-subject">${this.esc(lesson.subject)}</div>
              <div class="lesson-meta">${[lesson.room, lesson.teacher].filter(Boolean).map(this.esc).join(" · ")}</div>
              ${tags ? `<div class="lesson-tags">${tags}</div>` : ""}
              ${isNow ? `<div class="lesson-progress"><div style="width: ${progress}%"></div></div>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    const banners = specialDays
      .map((lesson) => `<div class="special-day">${this.esc(lesson.subject)}</div>`)
      .join("");

    return this.card({
      title,
      body: banners + (items ? `<div class="lesson-list">${items}</div>` : this.empty(this.t("dashboard.no_lessons"))),
      link: "/Orarend/InformaciokOrarend",
      linkText: this.t("dashboard.full_timetable"),
      className: "card-timetable",
      badge: this.countBadge(regular.filter((lesson) => !lesson.isCancelled).length),
    });
  }

  // --- Exams ---

  createExamCard() {
    const exams = this.data.exams;
    const items = exams
      .map((exam) => {
        const soon = exam.date && DashboardUtils.daysBetween(new Date(), exam.date) <= 1;
        return `
          <div class="widget-item">
            <div class="date-chip ${soon ? "is-soon" : ""}">
              ${exam.date ? `<span class="date-chip-day">${exam.date.getDate()}</span><span class="date-chip-month">${new Intl.DateTimeFormat(DashboardUtils.locale(), { month: "short" }).format(exam.date)}</span>` : "?"}
            </div>
            <div class="widget-details">
              <div class="widget-title">${this.esc(exam.subject)}</div>
              ${exam.name ? `<div class="widget-subtitle">${this.esc(exam.name)}</div>` : ""}
              <div class="widget-meta-line">
                ${exam.date ? `<span>${DashboardUtils.relativeDay(exam.date)}</span>` : ""}
                ${exam.type ? `<span class="tag tag-warning">${this.esc(exam.type)}</span>` : ""}
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    return this.card({
      title: this.t("dashboard.exams"),
      body: items ? `<div class="widget-list">${items}</div>` : this.empty(this.t("dashboard.no_exams")),
      link: "/Tanulo/TanuloBejelentettSzamonkeresek",
      linkText: this.t("dashboard.all_exams"),
      badge: this.countBadge(exams.length),
    });
  }

  // --- Homework ---

  createHomeworkCard() {
    const homework = this.data.homework;
    if (!homework) {
      return this.card({ title: this.t("dashboard.homework_title"), body: this.empty() });
    }

    const items = homework
      .map(
        (item) => `
          <div class="widget-item homework-item" data-lesson-id="${this.esc(String(item.lessonId))}">
            <div class="widget-details">
              <div class="widget-title">${this.esc(item.subject)}</div>
              <div class="homework-content">${this.esc(item.content)}</div>
              <div class="widget-meta-line">
                <span>${this.t("dashboard.deadline")}: ${item.deadline ? DashboardUtils.relativeDay(item.deadline) : this.esc(item.deadlineText)}</span>
              </div>
            </div>
            <button type="button" class="homework-done" title="${this.t("timetable.homework_mark_completed")}" aria-label="${this.t("timetable.homework_mark_completed")}">
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3.5 8.5l3 3 6-7"/></svg>
            </button>
          </div>
        `,
      )
      .join("");

    return this.card({
      title: this.t("dashboard.homework_title"),
      body: items ? `<div class="widget-list">${items}</div>` : this.empty(this.t("dashboard.no_homework")),
      link: "/Orarend/InformaciokOrarend",
      linkText: this.t("dashboard.full_timetable"),
      className: "card-homework",
      badge: this.countBadge(homework.length),
    });
  }

  // --- Grades ---

  createGradeCard() {
    const items = this.data.recentGrades
      .map(
        (grade) => `
          <div class="widget-item">
            <div class="grade grade-${this.esc(grade.value)}">${this.esc(grade.value)}</div>
            <div class="widget-details">
              <div class="widget-title">${this.esc(grade.subject)}</div>
              <div class="widget-meta-line">
                <span>${this.esc(grade.type)}</span>
                ${grade.dateInSubject || grade.date ? `<span>${this.esc(grade.dateInSubject || grade.date)}</span>` : ""}
              </div>
            </div>
          </div>
        `,
      )
      .join("");

    return this.card({
      title: this.t("dashboard.grades"),
      body: items ? `<div class="widget-list">${items}</div>` : this.empty(),
      link: "/TanuloErtekeles/Osztalyzatok",
      linkText: this.t("dashboard.all_grades"),
    });
  }

  createAveragesCard() {
    const subjects = this.data.subjects;
    const items = (subjects || [])
      .map(
        (subject) => `
          <div class="average-item">
            <div class="average-name">${this.esc(subject.name)}</div>
            <div class="average-bar"><div class="${DashboardUtils.gradeClass(subject.average)}" style="width: ${(subject.average / 5) * 100}%"></div></div>
            <div class="average-value ${DashboardUtils.gradeClass(subject.average)}">${subject.average.toFixed(2)}</div>
          </div>
        `,
      )
      .join("");

    const average = this.overallAverage();
    return this.card({
      title: this.t("dashboard.averages_title"),
      body: items ? `<div class="average-list">${items}</div>` : this.empty(),
      link: "/TanuloErtekeles/Osztalyzatok",
      linkText: this.t("dashboard.all_grades"),
      badge: average ? `<span class="card-badge ${DashboardUtils.gradeClass(average)}">${average.toFixed(2)}</span>` : "",
    });
  }

  // --- Absences ---

  createAbsenceCard() {
    const absences = this.data.absences;
    if (!absences) {
      return this.card({
        title: this.t("dashboard.absences"),
        body: this.empty(),
        link: "/Hianyzas/Hianyzasok",
        linkText: this.t("dashboard.all_absences"),
      });
    }

    const missed = absences.filter((absence) => !absence.isLate);
    const lates = absences.filter((absence) => absence.isLate);
    const count = (status) => missed.filter((absence) => absence.status === status).length;

    const summary = `
      <div class="absence-summary">
        <div class="absence-stat"><span class="absence-count">${count("justified")}</span><span>${this.t("absences.justified")}</span></div>
        <div class="absence-stat is-error"><span class="absence-count">${count("unjustified")}</span><span>${this.t("absences.unjustified")}</span></div>
        <div class="absence-stat is-warning"><span class="absence-count">${count("pending")}</span><span>${this.t("absences.pending")}</span></div>
        <div class="absence-stat"><span class="absence-count">${lates.length}</span><span>${this.t("absences.late_type")}</span></div>
      </div>
    `;

    const days = new Map();
    absences.forEach((absence) => {
      const key = absence.date.toDateString();
      if (!days.has(key)) days.set(key, []);
      days.get(key).push(absence);
    });

    const recent = Array.from(days.values())
      .slice(0, 4)
      .map((items) => {
        const statuses = items.map((item) => item.status);
        const status = statuses.includes("unjustified")
          ? "unjustified"
          : statuses.includes("pending")
            ? "pending"
            : "justified";
        const tagClass = { unjustified: "tag-error", pending: "tag-warning", justified: "tag-accent" }[status];
        const subjects = [...new Set(items.map((item) => item.subject).filter(Boolean))];
        const missedCount = items.filter((item) => !item.isLate).length;
        const lateMinutes = items.filter((item) => item.isLate).reduce((sum, item) => sum + item.minutes, 0);

        return `
          <div class="widget-item">
            <div class="widget-details">
              <div class="widget-title">${DashboardUtils.relativeDay(items[0].date)}</div>
              <div class="widget-subtitle">${subjects.map(this.esc).join(", ")}</div>
              <div class="widget-meta-line">
                ${missedCount ? `<span>${missedCount} ${this.t("absences.hours")}</span>` : ""}
                ${lateMinutes ? `<span>${this.t("absences.late_type")}: ${lateMinutes} ${this.t("absences.minutes")}</span>` : ""}
                <span class="tag ${tagClass}">${this.t(`absences.${status}`)}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    return this.card({
      title: this.t("dashboard.absences"),
      body: summary + (recent ? `<div class="widget-list">${recent}</div>` : this.empty(this.t("dashboard.no_absences"))),
      link: "/Hianyzas/Hianyzasok",
      linkText: this.t("dashboard.all_absences"),
    });
  }

  // --- Notes ---

  createNoteCard() {
    const items = this.data.notes
      .map(
        (note) => `
          <div class="widget-item">
            <div class="widget-details">
              <div class="widget-title">${this.esc(note.title)}</div>
              <div class="widget-meta-line">
                ${note.author ? `<span>${this.esc(note.author)}</span>` : ""}
                ${note.date ? `<span>${this.esc(note.date)}</span>` : ""}
              </div>
            </div>
          </div>
        `,
      )
      .join("");

    return this.card({
      title: this.t("dashboard.notes"),
      body: items ? `<div class="widget-list">${items}</div>` : this.empty(),
      link: "/TanuloErtekeles/InformaciokFeljegyzesek",
      linkText: this.t("dashboard.all_notes"),
    });
  }

  // --- Community service ---

  createCommunityServiceCard() {
    const items = this.data.communityService;
    if (!items) {
      return this.card({ title: this.t("cs.title"), body: this.empty() });
    }

    const totalHours = items.reduce((sum, item) => sum + item.hours, 0);
    const progress = Math.min(100, (totalHours / CS_REQUIRED_HOURS) * 100);

    const summary = `
      <div class="cs-summary">
        <div class="cs-summary-text">
          <span class="cs-total">${totalHours}</span>
          <span class="cs-required">/ ${CS_REQUIRED_HOURS} ${this.t("cs.hours_unit")}</span>
          ${totalHours >= CS_REQUIRED_HOURS ? `<span class="tag tag-accent cs-done">${this.t("cs.completed")}</span>` : ""}
        </div>
        <div class="cs-progress"><div style="width: ${progress}%"></div></div>
      </div>
    `;

    const list = items
      .map(
        (item) => `
          <div class="widget-item">
            <div class="widget-details">
              <div class="widget-title">${this.esc(item.place)}</div>
              <div class="widget-subtitle">${this.esc(item.activity)}</div>
              <div class="widget-meta-line"><span>${DashboardUtils.formatDateRange(item.start, item.end)}</span></div>
              ${item.note ? `<div class="cs-note">${this.esc(item.note)}</div>` : ""}
            </div>
            <div class="cs-hours">${item.hours}<span>${this.t("cs.hours_unit")}</span></div>
          </div>
        `,
      )
      .join("");

    return this.card({
      title: this.t("cs.title"),
      body: summary + (list ? `<div class="widget-list cs-list">${list}</div>` : this.empty(this.t("cs.empty"))),
    });
  }

  // --- News ---

  createNewsCard() {
    const items = this.data.news
      .map(
        (news) => `
          <article class="news-item">
            <div class="news-header">
              <div class="widget-title">${this.esc(news.title)}</div>
              ${news.date ? `<span class="news-date">${this.esc(news.date)}</span>` : ""}
            </div>
            ${news.content ? `<p class="news-content">${this.esc(news.content)}</p>` : ""}
            ${news.author ? `<div class="news-author">${this.esc(news.author)}</div>` : ""}
          </article>
        `,
      )
      .join("");

    return this.card({
      title: this.t("dashboard.news"),
      body: items ? `<div class="news-list">${items}</div>` : this.empty(),
      className: "card-full",
    });
  }

  // --- Page ---

  generateMainContent() {
    const s = this.settings;
    const cards = [
      ["timetable", !s.hideTimetable, () => this.createTimetableCard()],
      ["exams", !s.hideExams, () => this.createExamCard()],
      ["homework", !s.hideHomework, () => this.createHomeworkCard()],
      ["grades", !s.hideGrades, () => this.createGradeCard()],
      ["averages", !s.hideGrades, () => this.createAveragesCard()],
      ["absences", !s.hideAbsences, () => this.createAbsenceCard()],
      ["notes", !s.hideNotes, () => this.createNoteCard()],
      ["communityService", !s.hideCommunityService, () => this.createCommunityServiceCard()],
    ]
      .filter(([, visible]) => visible)
      .map(
        ([id, , create]) => `
          <div class="dash-item" data-card-id="${id}">
            <button type="button" class="dash-handle" title="${this.t("dashboard.move_card")}" aria-label="${this.t("dashboard.move_card")}"><span></span></button>
            ${create()}
          </div>
        `,
      );

    return `
      <main class="kreta-main">
        ${this.createHero()}
        <div class="dash-grid">${cards.join("")}</div>
        ${this.createNewsCard()}
      </main>
    `;
  }

  setupLayoutControls(root, layout) {
    const editButton = root.querySelector(".layout-edit");
    const resetButton = root.querySelector(".layout-reset");

    editButton.addEventListener("click", () => {
      const editing = !layout.editing;
      layout.setEditing(editing);
      const label = this.t(editing ? "dashboard.done_editing" : "dashboard.edit_layout");
      editButton.title = label;
      editButton.setAttribute("aria-label", label);
      editButton.setAttribute("aria-pressed", String(editing));
      editButton.classList.toggle("is-active", editing);
      resetButton.hidden = !editing;
    });

    resetButton.addEventListener("click", () => layout.reset());
  }

  setupInteractions(root) {
    root.querySelectorAll(".homework-done").forEach((button) => {
      button.addEventListener("click", async () => {
        const item = button.closest(".homework-item");
        const lessonId = this.data.homework.find(
          (homework) => String(homework.lessonId) === item.dataset.lessonId,
        )?.lessonId;
        if (lessonId == null) return;

        button.disabled = true;
        try {
          await DashboardHomework.markCompleted(lessonId);
          item.classList.add("is-done");
          setTimeout(() => item.remove(), 300);
        } catch (error) {
          console.error("Error saving homework state:", error);
          button.disabled = false;
        }
      });
    });
  }

  async render() {
    this.userName = await storageManager.get("userName", "");
    const loadingOverlay = document.querySelector(".loading-screen");
    helper.clearElement(document.body);
    if (loadingOverlay) document.body.appendChild(loadingOverlay);

    const container = document.createElement("div");
    container.className = "kreta-container";
    container.appendChild(helper.createElementFromHTML(await createTemplate.header()));
    container.appendChild(helper.createElementFromHTML(this.generateMainContent()));
    document.body.appendChild(container);

    let savedLayout = {};
    try {
      savedLayout = await storageManager.get(LAYOUT_STORAGE_KEY, {});
    } catch (error) {
      console.error("Error loading dashboard layout:", error);
    }
    const layout = new DashboardLayout(container.querySelector(".dash-grid"), savedLayout);
    layout.init();
    this.setupLayoutControls(container, layout);
    this.setupInteractions(container);
    setupUserDropdown();
  }
}

// Arranges the cards into columns. Without a saved layout each card goes under
// the currently shortest column; in edit mode the cards can be dragged around
// and the result is saved separately for every column count.
class DashboardLayout {
  constructor(grid, savedLayouts) {
    this.grid = grid;
    this.saved = savedLayouts && typeof savedLayouts === "object" ? savedLayouts : {};
    this.items = Array.from(grid.querySelectorAll(":scope > .dash-item"));
    this.byId = new Map(this.items.map((item) => [item.dataset.cardId, item]));
    this.editing = false;
    this.drag = null;
  }

  init() {
    this.layout(true);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.layout()).observe(this.grid);
    }
    this.grid.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.grid.addEventListener("keydown", (event) => this.onKeyDown(event));
  }

  columnCount() {
    const width = this.grid.clientWidth;
    return width >= 1000 ? 3 : width >= 640 ? 2 : 1;
  }

  columns() {
    return Array.from(this.grid.querySelectorAll(":scope > .dash-column"));
  }

  // Card order of a layout saved for another column count, read row by row
  fallbackOrder() {
    const source = this.saved[3] || this.saved[2] || this.saved[1];
    const order = [];
    if (Array.isArray(source)) {
      const depth = Math.max(0, ...source.map((column) => column.length));
      for (let row = 0; row < depth; row++) {
        source.forEach((column) => column[row] && order.push(column[row]));
      }
    }
    return [...order, ...this.items.map((item) => item.dataset.cardId)];
  }

  layout(force = false) {
    if (this.drag) return;
    const count = this.columnCount();
    if (!force && this.grid.dataset.columns === String(count)) return;
    this.grid.dataset.columns = String(count);

    const columns = Array.from({ length: count }, () => {
      const column = document.createElement("div");
      column.className = "dash-column";
      return column;
    });
    helper.clearElement(this.grid);
    columns.forEach((column) => this.grid.appendChild(column));

    const placed = new Set();
    const place = (id, column) => {
      const item = this.byId.get(id);
      if (!item || placed.has(id)) return;
      placed.add(id);
      column.appendChild(item);
    };

    const saved = this.saved[count];
    if (Array.isArray(saved) && saved.length === count) {
      saved.forEach((ids, index) => ids.forEach((id) => place(id, columns[index])));
    }

    // Cards without a saved position (no layout yet, or newly enabled cards)
    this.fallbackOrder().forEach((id) => {
      const shortest = columns.reduce((min, column) =>
        column.offsetHeight < min.offsetHeight ? column : min,
      );
      place(id, shortest);
    });
  }

  setEditing(editing) {
    this.editing = editing;
    this.grid.classList.toggle("is-editing", editing);
  }

  async save() {
    const count = Number(this.grid.dataset.columns);
    this.saved[count] = this.columns().map((column) =>
      Array.from(column.querySelectorAll(":scope > .dash-item")).map((item) => item.dataset.cardId),
    );
    try {
      await storageManager.set(LAYOUT_STORAGE_KEY, this.saved);
    } catch (error) {
      console.error("Error saving dashboard layout:", error);
    }
  }

  async reset() {
    this.saved = {};
    this.layout(true);
    try {
      await storageManager.set(LAYOUT_STORAGE_KEY, {});
    } catch (error) {
      console.error("Error resetting dashboard layout:", error);
    }
  }

  onPointerDown(event) {
    const handle = event.target.closest(".dash-handle");
    if (!this.editing || !handle || event.button > 0) return;
    event.preventDefault();

    const item = handle.closest(".dash-item");
    const rect = item.getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "dash-placeholder";
    placeholder.style.height = `${rect.height}px`;
    item.before(placeholder);

    item.classList.add("is-dragging");
    item.style.width = `${rect.width}px`;
    item.style.left = `${rect.left}px`;
    item.style.top = `${rect.top}px`;

    this.drag = {
      item,
      placeholder,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    handle.setPointerCapture(event.pointerId);
    const onMove = (moveEvent) => this.onPointerMove(moveEvent);
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
      this.onPointerUp();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  }

  onPointerMove(event) {
    const { item, placeholder, offsetX, offsetY } = this.drag;
    item.style.left = `${event.clientX - offsetX}px`;
    item.style.top = `${event.clientY - offsetY}px`;

    const column = this.columns().reduce((best, candidate) => {
      const rect = candidate.getBoundingClientRect();
      const distance = Math.abs(event.clientX - (rect.left + rect.width / 2));
      return !best || distance < best.distance ? { column: candidate, distance } : best;
    }, null).column;

    const before = Array.from(column.querySelectorAll(":scope > .dash-item"))
      .filter((other) => other !== item)
      .find((other) => {
        const rect = other.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      });

    if (before) {
      if (placeholder.nextElementSibling !== before) before.before(placeholder);
    } else if (column.lastElementChild !== placeholder) {
      column.appendChild(placeholder);
    }

    const edge = 60;
    if (event.clientY < edge) window.scrollBy(0, -12);
    else if (event.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
  }

  onPointerUp() {
    const { item, placeholder } = this.drag;
    placeholder.replaceWith(item);
    item.classList.remove("is-dragging");
    item.style.width = item.style.left = item.style.top = "";
    this.drag = null;
    this.save();
  }

  // Arrow keys on a focused handle move the card without a pointer
  onKeyDown(event) {
    const handle = event.target.closest(".dash-handle");
    if (!this.editing || !handle) return;

    const item = handle.closest(".dash-item");
    const column = item.parentElement;
    const columns = this.columns();
    const siblings = Array.from(column.querySelectorAll(":scope > .dash-item"));
    const position = siblings.indexOf(item);

    if (event.key === "ArrowUp" && position > 0) {
      siblings[position - 1].before(item);
    } else if (event.key === "ArrowDown" && position < siblings.length - 1) {
      siblings[position + 1].after(item);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const target = columns[columns.indexOf(column) + (event.key === "ArrowLeft" ? -1 : 1)];
      if (!target) return;
      const targetItems = target.querySelectorAll(":scope > .dash-item");
      const anchor = targetItems[position];
      if (anchor) anchor.before(item);
      else target.appendChild(item);
    } else {
      return;
    }

    event.preventDefault();
    handle.focus();
    this.save();
  }
}

class DashboardApplication {
  constructor() {
    this.init();
  }

  async loadBulletinSettings() {
    try {
      return await storageManager.get("pageSettings_bulletin", {});
    } catch (error) {
      console.error("Error loading bulletin settings:", error);
      return {};
    }
  }

  async waitForPage() {
    while (
      typeof window.LanguageManager === "undefined" ||
      window.LanguageManager.t("dashboard.grades") === "dashboard.grades"
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    // The recent grades and notes are scraped from the original page widgets
    for (let attempt = 0; attempt < 50; attempt++) {
      if (document.querySelector("#legutobbiErtekelesek, #legutobbiFeljegyzesek")) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async init() {
    if (!window.location.href.includes("/Intezmeny/Faliujsag")) {
      return;
    }

    await this.waitForPage();

    try {
      const dashboardData = await new DashboardDataManager().extractAllData();
      const settings = await this.loadBulletinSettings();
      await new DashboardRenderer(dashboardData, settings).render();
    } catch (error) {
      console.error("Error initializing dashboard:", error);
    } finally {
      if (typeof loadingScreen !== "undefined") loadingScreen.hide();
    }
  }
}

new DashboardApplication();
