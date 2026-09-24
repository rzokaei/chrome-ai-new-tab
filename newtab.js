const STORAGE_KEYS = {
  provider: "preferredProvider",
  openaiKey: "openaiApiKey",
  geminiKey: "geminiApiKey",
  openaiModel: "openaiModel",
  geminiModel: "geminiModel",
  calendarEvents: "calendarEvents",
  googleCalendarUrl: "googleCalendarUrl",
  googleCalendarEvents: "googleCalendarEvents",
  googleCalendarSyncTime: "googleCalendarSyncTime",
  shortcuts: "websiteShortcuts",
  background: "selectedBackground",
  customBackground: "customBackgroundImage",
  newsFeeds: "newsFeeds",
  newsCache: "newsCache",
  newsCacheTime: "newsCacheTime"
};

const NEWS_REFRESH_MS = 15 * 60 * 1000;
const MAX_NEWS_FEEDS = 8;
const MAX_NEWS_ITEMS = 6;
const DEFAULT_NEWS_FEEDS = [
  { id: "bbc-news", name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", enabled: true },
  { id: "npr-news", name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", enabled: true },
  { id: "guardian-world", name: "The Guardian", url: "https://www.theguardian.com/world/rss", enabled: true },
  { id: "al-jazeera", name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", enabled: true }
];
const DEFAULT_FEED_ORIGINS = new Set(DEFAULT_NEWS_FEEDS.map((feed) => new URL(feed.url).origin));
const GOOGLE_CALENDAR_REFRESH_MS = 15 * 60 * 1000;
const DEFAULT_BACKGROUND = "aurora-night";
const BACKGROUND_PRESETS = {
  none: "No image",
  "aurora-night": "Aurora Night",
  "desert-dawn": "Desert Dawn",
  "forest-mist": "Forest Mist",
  custom: "My image"
};

const DEFAULTS = {
  provider: "openai",
  openaiKey: "",
  geminiKey: "",
  openaiModel: "gpt-5-mini",
  geminiModel: "gemini-2.5-flash"
};

const PROVIDERS = {
  openai: { label: "OpenAI", keyField: "openaiKey", modelField: "openaiModel" },
  gemini: { label: "Gemini", keyField: "geminiKey", modelField: "geminiModel" }
};

const storage = {
  async get(keys) {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.get(keys);
    return Object.fromEntries(keys.map((key) => [key, JSON.parse(localStorage.getItem(key) || "null")]));
  },
  async set(values) {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.set(values);
    Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }
};

const form = document.querySelector("#prompt-form");
const promptInput = document.querySelector("#prompt");
const submitButton = document.querySelector("#submit-button");
const sendLabel = document.querySelector(".send-label");
const providerButtons = [...document.querySelectorAll(".provider")];
const modelBadge = document.querySelector("#model-badge");
const messagesElement = document.querySelector("#messages");
const statusElement = document.querySelector("#status");
const clock = document.querySelector("#clock");
const settingsDialog = document.querySelector("#settings-dialog");
const settingsForm = document.querySelector("#settings-form");
const settingsError = document.querySelector("#settings-error");
const openaiKeyInput = document.querySelector("#openai-key");
const geminiKeyInput = document.querySelector("#gemini-key");
const openaiModelInput = document.querySelector("#openai-model");
const geminiModelInput = document.querySelector("#gemini-model");
const googleCalendarUrlInput = document.querySelector("#google-calendar-url");
const googleCalendarStatus = document.querySelector("#google-calendar-status");
const syncGoogleCalendarButton = document.querySelector("#sync-google-calendar");
const disconnectGoogleCalendarButton = document.querySelector("#disconnect-google-calendar");
const calendarDialog = document.querySelector("#calendar-dialog");
const calendarGrid = document.querySelector("#calendar-grid");
const monthLabel = document.querySelector("#month-label");
const selectedDateLabel = document.querySelector("#selected-date-label");
const eventForm = document.querySelector("#event-form");
const eventTitleInput = document.querySelector("#event-title");
const eventTimeInput = document.querySelector("#event-time");
const eventList = document.querySelector("#event-list");
const noEvents = document.querySelector("#no-events");
const miniCalendarGrid = document.querySelector("#mini-calendar-grid");
const miniMonthLabel = document.querySelector("#mini-month-label");
const newsList = document.querySelector("#news-list");
const newsStatus = document.querySelector("#news-status");
const newsUpdated = document.querySelector("#news-updated");
const refreshNewsButton = document.querySelector("#refresh-news");
const manageNewsFeedsButton = document.querySelector("#manage-news-feeds");
const newsFeedSettings = document.querySelector("#news-feed-settings");
const newsFeedRows = document.querySelector("#news-feed-rows");
const addNewsFeedButton = document.querySelector("#add-news-feed");
const newsFeedCount = document.querySelector("#news-feed-count");
const newsFeedError = document.querySelector("#news-feed-error");
const shortcutsGrid = document.querySelector("#shortcuts-grid");
const shortcutDialog = document.querySelector("#shortcut-dialog");
const shortcutForm = document.querySelector("#shortcut-form");
const shortcutDialogTitle = document.querySelector("#shortcut-dialog-title");
const shortcutNameInput = document.querySelector("#shortcut-name");
const shortcutUrlInput = document.querySelector("#shortcut-url");
const shortcutError = document.querySelector("#shortcut-error");
const deleteShortcutButton = document.querySelector("#delete-shortcut");
const backgroundOptions = [...document.querySelectorAll(".background-option")];
const backgroundFileInput = document.querySelector("#background-file");
const uploadBackgroundButton = document.querySelector("#upload-background");
const customBackgroundPreview = document.querySelector("#custom-background-preview");
const backgroundStatus = document.querySelector("#background-status");
const removeCustomBackgroundButton = document.querySelector("#remove-custom-background");

let config = { ...DEFAULTS };
let selectedProvider = DEFAULTS.provider;
let conversation = [];
let activeController = null;
let isStreaming = false;
let calendarEvents = {};
let googleCalendarUrl = "";
let googleCalendarEvents = {};
let googleCalendarSyncTime = 0;
let googleCalendarSyncing = false;
let selectedDate = startOfDay(new Date());
let visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
let miniVisibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
let newsItems = [];
let newsCacheTime = 0;
let newsFeeds = DEFAULT_NEWS_FEEDS.map((feed) => ({ ...feed }));
let shortcuts = [];
let editingShortcutId = null;
let selectedBackground = DEFAULT_BACKGROUND;
let customBackgroundImage = "";

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sameDay(left, right) {
  return dateKey(left) === dateKey(right);
}

function applyBackground() {
  const validSelection = BACKGROUND_PRESETS[selectedBackground]
    && (selectedBackground !== "custom" || customBackgroundImage);
  if (!validSelection) selectedBackground = DEFAULT_BACKGROUND;
  document.body.dataset.background = selectedBackground;
  if (customBackgroundImage) {
    document.body.style.setProperty("--custom-background-image", `url("${customBackgroundImage}")`);
    customBackgroundPreview.style.backgroundImage = `url("${customBackgroundImage}")`;
    customBackgroundPreview.classList.add("has-image");
  } else {
    document.body.style.removeProperty("--custom-background-image");
    customBackgroundPreview.style.removeProperty("background-image");
    customBackgroundPreview.classList.remove("has-image");
  }
  backgroundOptions.forEach((button) => {
    const id = button.dataset.background || "custom";
    const active = id === selectedBackground;
    button.classList.toggle("selected", active);
    button.setAttribute("aria-checked", String(active));
  });
  backgroundStatus.textContent = `${BACKGROUND_PRESETS[selectedBackground]} selected`;
  removeCustomBackgroundButton.hidden = !customBackgroundImage;
}

async function chooseBackground(id) {
  if (!BACKGROUND_PRESETS[id] || (id === "custom" && !customBackgroundImage)) return;
  selectedBackground = id;
  applyBackground();
  await storage.set({ [STORAGE_KEYS.background]: selectedBackground });
}

async function optimizeBackgroundImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose an image smaller than 15 MB.");
  const bitmap = await createImageBitmap(file);
  const maxWidth = 1920;
  const maxHeight = 1200;
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#101315";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.86;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 3_500_000 && quality > 0.52) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrl.length > 3_500_000) throw new Error("This image is too detailed. Try a smaller image.");
  return dataUrl;
}

function normalizeShortcutUrl(value) {
  let candidate = value.trim();
  if (!candidate) throw new Error("Enter a website address.");
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid website address.");
  }
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
    throw new Error("Use an http or https website address.");
  }
  return url.href;
}

function shortcutLabel(shortcut) {
  if (shortcut.name?.trim()) return shortcut.name.trim();
  return new URL(shortcut.url).hostname.replace(/^www\./, "");
}

function faviconUrl(pageUrl) {
  if (!globalThis.chrome?.runtime?.getURL) return "";
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", "64");
  return url.href;
}

function openShortcutEditor(shortcut = null) {
  if (!shortcut && shortcuts.length >= 8) return;
  editingShortcutId = shortcut?.id || null;
  shortcutDialogTitle.textContent = shortcut ? "Edit website" : "Add website";
  shortcutNameInput.value = shortcut?.name || "";
  shortcutUrlInput.value = shortcut?.url || "";
  shortcutError.textContent = "";
  deleteShortcutButton.hidden = !shortcut;
  if (!shortcutDialog.open) shortcutDialog.showModal();
  requestAnimationFrame(() => (shortcut ? shortcutNameInput : shortcutUrlInput).focus());
}

function renderShortcuts() {
  shortcutsGrid.replaceChildren();
  shortcuts.slice(0, 8).forEach((shortcut) => {
    const tile = document.createElement("div");
    tile.className = "shortcut-tile";

    const link = document.createElement("a");
    link.className = "shortcut-link";
    link.href = shortcut.url;
    link.title = `Open ${shortcutLabel(shortcut)}`;

    const icon = document.createElement("span");
    icon.className = "shortcut-icon";
    const fallback = document.createElement("span");
    fallback.className = "shortcut-fallback";
    fallback.textContent = shortcutLabel(shortcut).charAt(0).toUpperCase();
    icon.append(fallback);
    const source = faviconUrl(shortcut.url);
    if (source) {
      const image = document.createElement("img");
      image.alt = "";
      image.src = source;
      image.addEventListener("load", () => image.classList.add("loaded"));
      image.addEventListener("error", () => image.remove());
      icon.append(image);
    }

    const label = document.createElement("span");
    label.className = "shortcut-label";
    label.textContent = shortcutLabel(shortcut);
    link.append(icon, label);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-shortcut";
    edit.setAttribute("aria-label", `Edit ${shortcutLabel(shortcut)}`);
    edit.title = "Edit shortcut";
    edit.textContent = "•••";
    edit.addEventListener("click", () => openShortcutEditor(shortcut));
    tile.append(link, edit);
    shortcutsGrid.append(tile);
  });

  if (shortcuts.length < 8) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "shortcut-tile add-shortcut";
    add.setAttribute("aria-label", "Add website shortcut");
    const icon = document.createElement("span");
    icon.className = "shortcut-icon";
    icon.textContent = "+";
    const label = document.createElement("span");
    label.className = "shortcut-label";
    label.textContent = "Add website";
    add.append(icon, label);
    add.addEventListener("click", () => openShortcutEditor());
    shortcutsGrid.append(add);
  }
}

function eventsForDate(key) {
  return [
    ...(calendarEvents[key] || []).map((event) => ({ ...event, source: "local" })),
    ...(googleCalendarEvents[key] || [])
  ];
}

function normalizeGoogleCalendarUrl(value) {
  const candidate = value.trim().replace(/^webcal:/i, "https:");
  if (!candidate) return "";
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Paste the complete Google Calendar secret iCal address.");
  }
  if (url.protocol !== "https:" || url.hostname !== "calendar.google.com" || !url.pathname.endsWith(".ics")) {
    throw new Error("Use the Secret address in iCal format from Google Calendar settings.");
  }
  return url.href;
}

function indexGoogleEvents(events) {
  const indexed = {};
  events.forEach((event) => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return;
    const cursor = startOfDay(start);
    const lastDay = startOfDay(new Date(Math.max(start.getTime(), end.getTime() - 1)));
    let guard = 0;
    while (cursor <= lastDay && guard < 370) {
      const key = dateKey(cursor);
      indexed[key] = [...(indexed[key] || []), event];
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  });
  return indexed;
}

function googleEventTime(event, selectedKey) {
  if (event.allDay) return "All day · Google Calendar";
  const start = new Date(event.start);
  const end = new Date(event.end);
  const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const startKey = dateKey(start);
  const endKey = dateKey(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  if (startKey !== selectedKey && endKey === selectedKey) return `Until ${time.format(end)} · Google Calendar`;
  if (startKey !== endKey) return `${time.format(start)} · Google Calendar`;
  return `${time.format(start)}–${time.format(end)} · Google Calendar`;
}

function renderGoogleCalendarStatus(message = "") {
  disconnectGoogleCalendarButton.hidden = !googleCalendarUrl;
  syncGoogleCalendarButton.disabled = googleCalendarSyncing;
  if (message) {
    googleCalendarStatus.textContent = message;
  } else if (googleCalendarSyncing) {
    googleCalendarStatus.textContent = "Syncing…";
  } else if (googleCalendarUrl) {
    const count = new Set(Object.values(googleCalendarEvents).flat().map((event) => event.id)).size;
    googleCalendarStatus.textContent = googleCalendarSyncTime
      ? `Connected · ${count} event${count === 1 ? "" : "s"} · ${relativeTime(googleCalendarSyncTime)}`
      : "Connected · Not synced yet";
  } else {
    googleCalendarStatus.textContent = "Not connected";
  }
}

async function syncGoogleCalendar(force = false, candidateUrl = googleCalendarUrl) {
  const url = normalizeGoogleCalendarUrl(candidateUrl);
  if (!url || googleCalendarSyncing) return;
  if (!force && googleCalendarSyncTime && Date.now() - googleCalendarSyncTime < GOOGLE_CALENDAR_REFRESH_MS) return;
  googleCalendarSyncing = true;
  renderGoogleCalendarStatus();
  let failureMessage = "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "omit", signal: controller.signal });
    if (!response.ok) throw new Error("Google Calendar could not be reached.");
    const now = new Date();
    const events = IcalSync.parse(await response.text(), {
      rangeStart: new Date(now.getFullYear() - 2, 0, 1),
      rangeEnd: new Date(now.getFullYear() + 3, 11, 31, 23, 59, 59)
    });
    googleCalendarUrl = url;
    googleCalendarEvents = indexGoogleEvents(events);
    googleCalendarSyncTime = Date.now();
    await storage.set({
      [STORAGE_KEYS.googleCalendarUrl]: googleCalendarUrl,
      [STORAGE_KEYS.googleCalendarEvents]: googleCalendarEvents,
      [STORAGE_KEYS.googleCalendarSyncTime]: googleCalendarSyncTime
    });
    renderCalendar();
  } catch (error) {
    failureMessage = error.name === "AbortError" ? "Sync timed out. Try again." : (error.message || "Sync failed. Try again.");
    renderGoogleCalendarStatus(failureMessage);
    throw error;
  } finally {
    clearTimeout(timeout);
    googleCalendarSyncing = false;
    if (failureMessage) renderGoogleCalendarStatus(failureMessage);
    else renderGoogleCalendarStatus();
  }
}

async function disconnectGoogleCalendar() {
  googleCalendarUrl = "";
  googleCalendarEvents = {};
  googleCalendarSyncTime = 0;
  googleCalendarUrlInput.value = "";
  await storage.set({
    [STORAGE_KEYS.googleCalendarUrl]: "",
    [STORAGE_KEYS.googleCalendarEvents]: {},
    [STORAGE_KEYS.googleCalendarSyncTime]: 0
  });
  renderCalendar();
  renderGoogleCalendarStatus();
}

function renderAgenda() {
  const key = dateKey(selectedDate);
  const events = eventsForDate(key).sort((left, right) => {
    const leftTime = left.source === "google" ? (left.allDay ? "" : left.start) : left.time;
    const rightTime = right.source === "google" ? (right.allDay ? "" : right.start) : right.time;
    if (!leftTime) return 1;
    if (!rightTime) return -1;
    return leftTime.localeCompare(rightTime);
  });

  selectedDateLabel.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(selectedDate);
  eventList.replaceChildren();
  noEvents.hidden = events.length > 0;

  events.forEach((event) => {
    const item = document.createElement("div");
    item.className = "event-item";
    if (event.source === "google") item.classList.add("google-event");
    const copy = document.createElement("div");
    copy.className = "event-copy";
    const title = document.createElement("strong");
    title.textContent = event.title;
    const time = document.createElement("span");
    time.textContent = event.source === "google"
      ? googleEventTime(event, key)
      : event.time
        ? new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(`${key}T${event.time}`))
        : "Any time";
    copy.append(title, time);

    if (event.source === "google") {
      item.title = event.location ? `Google Calendar · ${event.location}` : "Google Calendar";
      item.append(copy);
      eventList.append(item);
      return;
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-event";
    remove.setAttribute("aria-label", `Delete ${event.title}`);
    remove.title = "Delete event";
    remove.textContent = "×";
    remove.addEventListener("click", async () => {
      calendarEvents[key] = (calendarEvents[key] || []).filter((candidate) => candidate.id !== event.id);
      if (calendarEvents[key].length === 0) delete calendarEvents[key];
      await storage.set({ [STORAGE_KEYS.calendarEvents]: calendarEvents });
      renderCalendar();
    });

    item.append(copy, remove);
    eventList.append(item);
  });
}

function renderCalendar() {
  monthLabel.textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(visibleMonth);
  calendarGrid.replaceChildren();

  const firstOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const today = startOfDay(new Date());

  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const key = dateKey(day);
    const events = eventsForDate(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `${new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(day)}${events.length ? `, ${events.length} event${events.length === 1 ? "" : "s"}` : ""}`);
    if (day.getMonth() !== visibleMonth.getMonth()) button.classList.add("outside");
    if (sameDay(day, today)) button.classList.add("today");
    if (sameDay(day, selectedDate)) button.classList.add("selected");

    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = day.getDate();
    button.append(number);

    if (events.length) {
      const dots = document.createElement("span");
      dots.className = "event-dots";
      for (let dot = 0; dot < Math.min(events.length, 3); dot += 1) {
        const marker = document.createElement("span");
        marker.className = "event-dot";
        dots.append(marker);
      }
      if (events.length > 3) {
        const count = document.createElement("span");
        count.className = "event-count";
        count.textContent = `+${events.length - 3}`;
        dots.append(count);
      }
      button.append(dots);
    }

    button.addEventListener("click", () => {
      selectedDate = startOfDay(day);
      if (day.getMonth() !== visibleMonth.getMonth() || day.getFullYear() !== visibleMonth.getFullYear()) {
        visibleMonth = new Date(day.getFullYear(), day.getMonth(), 1);
      }
      renderCalendar();
      eventTitleInput.focus();
    });
    calendarGrid.append(button);
  }
  renderAgenda();
  renderMiniCalendar();
}

function openCalendar() {
  selectedDate = startOfDay(new Date());
  visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderCalendar();
  if (!calendarDialog.open) calendarDialog.showModal();
}

function openCalendarForDate(date) {
  selectedDate = startOfDay(date);
  visibleMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  renderCalendar();
  if (!calendarDialog.open) calendarDialog.showModal();
}

function renderMiniCalendar() {
  miniMonthLabel.textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(miniVisibleMonth);
  miniCalendarGrid.replaceChildren();
  const firstOfMonth = new Date(miniVisibleMonth.getFullYear(), miniVisibleMonth.getMonth(), 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
  const today = startOfDay(new Date());

  for (let index = 0; index < 42; index += 1) {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    const events = eventsForDate(dateKey(day));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mini-day";
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", `${new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(day)}${events.length ? `, ${events.length} event${events.length === 1 ? "" : "s"}` : ""}`);
    button.textContent = day.getDate();
    if (day.getMonth() !== miniVisibleMonth.getMonth()) button.classList.add("outside");
    if (sameDay(day, today)) button.classList.add("today");
    if (events.length) button.classList.add("has-events");
    button.addEventListener("click", () => openCalendarForDate(day));
    miniCalendarGrid.append(button);
  }
}

function updateClock() {
  clock.textContent = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date());
  renderNewsUpdatedTime();
  if (googleCalendarUrl && !googleCalendarSyncing) renderGoogleCalendarStatus();
}

function relativeTime(timestamp) {
  if (!timestamp) return "";
  const elapsed = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(elapsed)) return "";
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function normalizeNewsFeedUrl(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid RSS feed address.");
  }
  if (url.protocol !== "https:") throw new Error("RSS feed addresses must use HTTPS.");
  return url.href;
}

function sanitizeStoredNewsFeeds(value) {
  if (!Array.isArray(value)) return DEFAULT_NEWS_FEEDS.map((feed) => ({ ...feed }));
  const seenIds = new Set();
  const feeds = [];
  value.slice(0, MAX_NEWS_FEEDS).forEach((candidate) => {
    try {
      const url = normalizeNewsFeedUrl(String(candidate?.url || ""));
      let id = typeof candidate?.id === "string" && candidate.id ? candidate.id : crypto.randomUUID();
      while (seenIds.has(id)) id = crypto.randomUUID();
      seenIds.add(id);
      const savedName = String(candidate?.name || "").trim();
      feeds.push({
        id,
        name: (savedName || new URL(url).hostname).slice(0, 40),
        url,
        enabled: candidate?.enabled !== false
      });
    } catch {
      // Ignore malformed saved feeds instead of preventing the new tab from loading.
    }
  });
  return feeds;
}

function updateNewsFeedEditorCount() {
  const count = newsFeedRows.children.length;
  newsFeedCount.textContent = `${count} of ${MAX_NEWS_FEEDS}`;
  addNewsFeedButton.disabled = count >= MAX_NEWS_FEEDS;
}

function createNewsFeedRow(feed) {
  const row = document.createElement("div");
  row.className = "news-feed-row";
  row.dataset.feedId = feed.id;

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "news-feed-toggle";
  toggleLabel.title = "Enable or disable this feed";
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.className = "news-feed-enabled";
  enabled.checked = feed.enabled;
  enabled.setAttribute("aria-label", `Enable ${feed.name || "RSS feed"}`);
  toggleLabel.append(enabled);

  const name = document.createElement("input");
  name.type = "text";
  name.className = "news-feed-name";
  name.maxLength = 40;
  name.value = feed.name;
  name.placeholder = "Source name";
  name.setAttribute("aria-label", "RSS source name");

  const url = document.createElement("input");
  url.type = "url";
  url.className = "news-feed-url";
  url.maxLength = 2048;
  url.value = feed.url;
  url.placeholder = "https://example.com/feed.xml";
  url.autocomplete = "off";
  url.setAttribute("aria-label", `${feed.name || "RSS"} feed address`);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-news-feed";
  remove.textContent = "×";
  remove.title = "Remove feed";
  remove.setAttribute("aria-label", `Remove ${feed.name || "RSS feed"}`);
  remove.addEventListener("click", () => {
    row.remove();
    newsFeedError.textContent = "";
    updateNewsFeedEditorCount();
  });

  row.append(toggleLabel, name, url, remove);
  return row;
}

function renderNewsFeedEditor() {
  newsFeedRows.replaceChildren(...newsFeeds.map(createNewsFeedRow));
  newsFeedError.textContent = "";
  updateNewsFeedEditorCount();
}

function readNewsFeedEditor() {
  const feeds = [...newsFeedRows.querySelectorAll(".news-feed-row")].map((row) => {
    const url = normalizeNewsFeedUrl(row.querySelector(".news-feed-url").value);
    const name = row.querySelector(".news-feed-name").value.trim() || new URL(url).hostname.replace(/^www\./, "");
    return {
      id: row.dataset.feedId || crypto.randomUUID(),
      name: name.slice(0, 40),
      url,
      enabled: row.querySelector(".news-feed-enabled").checked
    };
  });
  const duplicate = feeds.find((feed, index) => feeds.findIndex((candidate) => candidate.url === feed.url) !== index);
  if (duplicate) throw new Error(`${duplicate.name} uses the same address as another feed.`);
  return feeds;
}

function customFeedOriginPatterns(feeds) {
  return [...new Set(feeds
    .filter((feed) => feed.enabled)
    .map((feed) => new URL(feed.url).origin)
    .filter((origin) => !DEFAULT_FEED_ORIGINS.has(origin))
    .map((origin) => `${origin}/*`))];
}

async function requestNewsFeedPermissions(feeds) {
  const origins = customFeedOriginPatterns(feeds);
  if (!origins.length || !globalThis.chrome?.permissions?.request) return true;
  return chrome.permissions.request({ origins });
}

async function removeUnusedNewsFeedPermissions(previousFeeds, nextFeeds) {
  if (!globalThis.chrome?.permissions?.remove) return;
  const current = new Set(customFeedOriginPatterns(previousFeeds));
  const next = new Set(customFeedOriginPatterns(nextFeeds));
  const unused = [...current].filter((origin) => !next.has(origin));
  if (unused.length) {
    try {
      await chrome.permissions.remove({ origins: unused });
    } catch {
      // Permission cleanup should not prevent the rest of the settings from saving.
    }
  }
}

function renderNewsUpdatedTime() {
  newsUpdated.textContent = newsCacheTime ? `Updated ${relativeTime(newsCacheTime).toLowerCase()}` : "";
}

function renderNews(message = null) {
  newsList.replaceChildren();
  if (message !== null) newsStatus.textContent = message;
  else if (newsItems.length) newsStatus.textContent = "";
  newsItems.slice(0, MAX_NEWS_ITEMS).forEach((item) => {
    const listItem = document.createElement("li");
    listItem.className = "news-item";
    const link = document.createElement("a");
    link.href = item.link;
    link.target = "_blank";
    link.rel = "noreferrer";
    const headline = document.createElement("span");
    headline.className = "news-headline";
    headline.textContent = item.title;
    const time = document.createElement("time");
    time.className = "news-time";
    time.dateTime = item.publishedAt || "";
    time.textContent = [item.sourceName, relativeTime(item.publishedAt)].filter(Boolean).join(" · ");
    link.append(headline, time);
    listItem.append(link);
    newsList.append(listItem);
  });
  const enabledCount = newsFeeds.filter((feed) => feed.enabled).length;
  manageNewsFeedsButton.textContent = `${enabledCount} source${enabledCount === 1 ? "" : "s"} · Manage`;
  renderNewsUpdatedTime();
}

function childTextByLocalName(node, names) {
  const child = [...node.children].find((candidate) => names.includes(candidate.localName));
  return child?.textContent?.trim() || "";
}

function newsEntryLink(node) {
  const links = [...node.children].filter((candidate) => candidate.localName === "link");
  const linked = links.find((candidate) => !candidate.getAttribute("rel") || candidate.getAttribute("rel") === "alternate") || links[0];
  return linked?.getAttribute("href")?.trim() || linked?.textContent?.trim() || "";
}

function parseNewsFeed(xmlText, feed) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("The news feed returned invalid XML.");
  const entries = [...xml.getElementsByTagName("item"), ...xml.getElementsByTagNameNS("*", "entry")];
  return entries.slice(0, 12).map((item) => {
    const title = childTextByLocalName(item, ["title"]);
    const linkText = newsEntryLink(item);
    const publishedAt = childTextByLocalName(item, ["pubDate", "published", "updated", "date"]);
    if (!title || !linkText) return null;
    const url = new URL(linkText);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return { title, link: url.href, publishedAt, sourceId: feed.id, sourceName: feed.name };
  }).filter(Boolean);
}

function newsItemTimestamp(item) {
  const timestamp = new Date(item.publishedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function curateNewsItems(feedResults) {
  const selected = [];
  const seen = new Set();
  feedResults.forEach(({ items }) => {
    const first = [...items].sort((left, right) => newsItemTimestamp(right) - newsItemTimestamp(left))[0];
    if (first && !seen.has(first.link)) {
      seen.add(first.link);
      selected.push(first);
    }
  });
  const remaining = feedResults.flatMap(({ items }) => items)
    .sort((left, right) => newsItemTimestamp(right) - newsItemTimestamp(left));
  for (const item of remaining) {
    if (selected.length >= MAX_NEWS_ITEMS) break;
    if (seen.has(item.link)) continue;
    seen.add(item.link);
    selected.push(item);
  }
  return selected.sort((left, right) => newsItemTimestamp(right) - newsItemTimestamp(left));
}

async function fetchNews(force = false) {
  if (!force && newsItems.length && Date.now() - newsCacheTime < NEWS_REFRESH_MS) return;
  const enabledFeeds = newsFeeds.filter((feed) => feed.enabled);
  if (!enabledFeeds.length) {
    newsItems = [];
    newsCacheTime = 0;
    renderNews(newsFeeds.length ? "All feeds are disabled" : "Add an RSS feed in settings");
    await storage.set({ [STORAGE_KEYS.newsCache]: [], [STORAGE_KEYS.newsCacheTime]: 0 });
    return;
  }
  refreshNewsButton.classList.add("loading");
  refreshNewsButton.disabled = true;
  if (!newsItems.length) newsStatus.textContent = `Loading ${enabledFeeds.length} source${enabledFeeds.length === 1 ? "" : "s"}…`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const results = await Promise.all(enabledFeeds.map(async (feed) => {
      try {
        const response = await fetch(feed.url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Request failed (${response.status}).`);
        const items = parseNewsFeed(await response.text(), feed);
        if (!items.length) throw new Error("No headlines were found.");
        return { feed, items, failed: false };
      } catch (error) {
        return { feed, items: [], failed: true, error };
      }
    }));
    const successful = results.filter((result) => !result.failed);
    if (!successful.length) throw new Error("No news feeds were available.");
    newsItems = curateNewsItems(successful);
    newsCacheTime = Date.now();
    const failedCount = results.length - successful.length;
    renderNews(failedCount ? `${failedCount} feed${failedCount === 1 ? "" : "s"} unavailable` : "");
    await storage.set({
      [STORAGE_KEYS.newsCache]: newsItems,
      [STORAGE_KEYS.newsCacheTime]: newsCacheTime
    });
  } catch (error) {
    renderNews(newsItems.length ? "Showing cached headlines" : "Headlines unavailable");
  } finally {
    clearTimeout(timeout);
    refreshNewsButton.classList.remove("loading");
    refreshNewsButton.disabled = false;
  }
}

function autoSizePrompt() {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 240)}px`;
}

function setProvider(provider, persist = true) {
  if (!PROVIDERS[provider] || isStreaming) return;
  selectedProvider = provider;
  config.provider = provider;
  providerButtons.forEach((button) => {
    const active = button.dataset.provider === provider;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  sendLabel.textContent = `Ask ${PROVIDERS[provider].label}`;
  modelBadge.textContent = config[PROVIDERS[provider].modelField];
  if (persist) storage.set({ [STORAGE_KEYS.provider]: provider });
}

function setStreaming(value) {
  isStreaming = value;
  submitButton.classList.toggle("is-streaming", value);
  sendLabel.textContent = value ? "Stop" : `Ask ${PROVIDERS[selectedProvider].label}`;
  providerButtons.forEach((button) => { button.disabled = value; });
}

function newChat() {
  activeController?.abort();
  activeController = null;
  conversation = [];
  messagesElement.replaceChildren();
  statusElement.textContent = "";
  document.body.classList.remove("chat-active");
  promptInput.value = "";
  autoSizePrompt();
  promptInput.focus();
}

function avatarLabel(role, provider) {
  if (role === "user") return "You";
  return provider === "gemini" ? "G" : "AI";
}

function addMessage(role, text, provider = selectedProvider) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = `message-avatar ${role === "assistant" ? `${provider}-avatar` : ""}`;
  avatar.textContent = avatarLabel(role, provider);

  const body = document.createElement("div");
  body.className = "message-content";
  const textElement = document.createElement("div");
  textElement.className = "message-text";
  textElement.textContent = text;
  body.append(textElement);

  if (role === "assistant") {
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const providerName = document.createElement("span");
    providerName.textContent = `${PROVIDERS[provider].label} · ${config[PROVIDERS[provider].modelField]}`;
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "copy-button";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", async () => {
      await navigator.clipboard.writeText(textElement.dataset.rawText || textElement.textContent);
      copyButton.textContent = "Copied";
      setTimeout(() => { copyButton.textContent = "Copy"; }, 1200);
    });
    meta.append(providerName, copyButton);
    body.append(meta);
  }

  article.append(avatar, body);
  messagesElement.append(article);
  document.body.classList.add("chat-active");
  return { article, textElement };
}

function renderResponseText(element, text) {
  element.replaceChildren();
  element.dataset.rawText = text;
  const segments = text.split(/```/);
  segments.forEach((segment, index) => {
    if (index % 2 === 0) {
      element.append(document.createTextNode(segment));
      return;
    }
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const cleaned = segment.replace(/^\w+\n/, "");
    code.textContent = cleaned;
    pre.append(code);
    element.append(pre);
  });
}

function scrollToLatest() {
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }));
}

async function responseError(response) {
  const raw = await response.text();
  try {
    const parsed = JSON.parse(raw);
    return parsed.error?.message || parsed.message || `Request failed (${response.status})`;
  } catch {
    return raw || `Request failed (${response.status})`;
  }
}

async function readSSE(response, onData) {
  if (!response.body) throw new Error("This browser did not provide a response stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const payload = block.split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (payload && payload !== "[DONE]") onData(JSON.parse(payload));
    }
    if (done) break;
  }

  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const payload = tail.slice(5).trim();
    if (payload && payload !== "[DONE]") onData(JSON.parse(payload));
  }
}

async function streamOpenAI(history, signal, onDelta) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.openaiModel,
      input: history.map((message) => ({ role: message.role, content: message.content })),
      stream: true,
      store: false
    }),
    signal
  });
  if (!response.ok) throw new Error(await responseError(response));
  await readSSE(response, (event) => {
    if (event.type === "response.output_text.delta" && event.delta) onDelta(event.delta);
    if (event.type === "error") throw new Error(event.message || "OpenAI returned a streaming error.");
  });
}

async function streamGemini(history, signal, onDelta) {
  const model = config.geminiModel.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": config.geminiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: history.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      }))
    }),
    signal
  });
  if (!response.ok) throw new Error(await responseError(response));
  await readSSE(response, (event) => {
    const delta = event.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    if (delta) onDelta(delta);
  });
}

function openSettings(message = "") {
  openaiKeyInput.value = config.openaiKey;
  geminiKeyInput.value = config.geminiKey;
  openaiModelInput.value = config.openaiModel;
  geminiModelInput.value = config.geminiModel;
  googleCalendarUrlInput.value = googleCalendarUrl;
  renderGoogleCalendarStatus();
  renderNewsFeedEditor();
  settingsError.textContent = message;
  if (!settingsDialog.open) settingsDialog.showModal();
}

async function submitPrompt() {
  if (isStreaming) {
    activeController?.abort();
    return;
  }

  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }

  const provider = selectedProvider;
  const providerConfig = PROVIDERS[provider];
  if (!config[providerConfig.keyField]) {
    openSettings(`Add a ${providerConfig.label} API key to start chatting.`);
    return;
  }

  statusElement.textContent = "";
  conversation.push({ role: "user", content: prompt });
  addMessage("user", prompt, provider);
  promptInput.value = "";
  autoSizePrompt();

  const assistantMessage = addMessage("assistant", "", provider);
  assistantMessage.textElement.classList.add("typing-cursor");
  let responseText = "";
  activeController = new AbortController();
  setStreaming(true);
  scrollToLatest();

  try {
    const onDelta = (delta) => {
      responseText += delta;
      assistantMessage.textElement.textContent = responseText;
      assistantMessage.textElement.dataset.rawText = responseText;
      scrollToLatest();
    };
    if (provider === "openai") {
      await streamOpenAI(conversation, activeController.signal, onDelta);
    } else {
      await streamGemini(conversation, activeController.signal, onDelta);
    }
    if (!responseText) throw new Error("The provider returned an empty response.");
    conversation.push({ role: "assistant", content: responseText });
    renderResponseText(assistantMessage.textElement, responseText);
  } catch (error) {
    if (error.name === "AbortError") {
      if (responseText) {
        conversation.push({ role: "assistant", content: responseText });
        renderResponseText(assistantMessage.textElement, responseText);
        statusElement.textContent = "Generation stopped.";
      } else {
        assistantMessage.article.remove();
      }
    } else {
      assistantMessage.article.remove();
      statusElement.textContent = error.message || "The request could not be completed.";
    }
  } finally {
    assistantMessage.textElement.classList.remove("typing-cursor");
    activeController = null;
    setStreaming(false);
    promptInput.focus();
    scrollToLatest();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt();
});

promptInput.addEventListener("input", autoSizePrompt);
promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitPrompt();
  }
});

providerButtons.forEach((button) => button.addEventListener("click", () => setProvider(button.dataset.provider)));
document.querySelector("#new-chat").addEventListener("click", newChat);
document.querySelector("#brand-button").addEventListener("click", newChat);
document.querySelector("#calendar-button").addEventListener("click", openCalendar);
document.querySelector("#open-agenda").addEventListener("click", openCalendar);
document.querySelector("#mini-previous-month").addEventListener("click", () => {
  miniVisibleMonth = new Date(miniVisibleMonth.getFullYear(), miniVisibleMonth.getMonth() - 1, 1);
  renderMiniCalendar();
});
document.querySelector("#mini-next-month").addEventListener("click", () => {
  miniVisibleMonth = new Date(miniVisibleMonth.getFullYear(), miniVisibleMonth.getMonth() + 1, 1);
  renderMiniCalendar();
});
refreshNewsButton.addEventListener("click", () => fetchNews(true));
manageNewsFeedsButton.addEventListener("click", () => {
  openSettings();
  requestAnimationFrame(() => newsFeedSettings.scrollIntoView({ block: "center" }));
});
addNewsFeedButton.addEventListener("click", () => {
  if (newsFeedRows.children.length >= MAX_NEWS_FEEDS) return;
  newsFeedRows.append(createNewsFeedRow({
    id: crypto.randomUUID(),
    name: "",
    url: "",
    enabled: true
  }));
  newsFeedError.textContent = "";
  updateNewsFeedEditorCount();
  newsFeedRows.lastElementChild.querySelector(".news-feed-name").focus();
});
syncGoogleCalendarButton.addEventListener("click", async () => {
  settingsError.textContent = "";
  try {
    const url = normalizeGoogleCalendarUrl(googleCalendarUrlInput.value);
    if (!url) throw new Error("Paste your Google Calendar secret iCal address first.");
    await syncGoogleCalendar(true, url);
  } catch (error) {
    settingsError.textContent = error.message || "Google Calendar could not be synced.";
  }
});
disconnectGoogleCalendarButton.addEventListener("click", async () => {
  settingsError.textContent = "";
  await disconnectGoogleCalendar();
});
document.querySelector("#settings-button").addEventListener("click", () => openSettings());
document.querySelector("#close-settings").addEventListener("click", () => settingsDialog.close());
document.querySelector("#close-calendar").addEventListener("click", () => calendarDialog.close());
document.querySelector("#previous-month").addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
  selectedDate = new Date(visibleMonth);
  renderCalendar();
});
document.querySelector("#next-month").addEventListener("click", () => {
  visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
  selectedDate = new Date(visibleMonth);
  renderCalendar();
});
document.querySelector("#today-button").addEventListener("click", () => {
  selectedDate = startOfDay(new Date());
  visibleMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  renderCalendar();
});

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = eventTitleInput.value.trim();
  if (!title) return;
  const key = dateKey(selectedDate);
  const entry = {
    id: crypto.randomUUID(),
    title,
    time: eventTimeInput.value,
    createdAt: Date.now()
  };
  calendarEvents[key] = [...(calendarEvents[key] || []), entry];
  await storage.set({ [STORAGE_KEYS.calendarEvents]: calendarEvents });
  eventTitleInput.value = "";
  eventTimeInput.value = "";
  renderCalendar();
  eventTitleInput.focus();
});

settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});

calendarDialog.addEventListener("click", (event) => {
  if (event.target === calendarDialog) calendarDialog.close();
});

shortcutDialog.addEventListener("click", (event) => {
  if (event.target === shortcutDialog) shortcutDialog.close();
});

document.querySelector("#close-shortcut").addEventListener("click", () => shortcutDialog.close());
document.querySelector("#cancel-shortcut").addEventListener("click", () => shortcutDialog.close());

shortcutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  shortcutError.textContent = "";
  try {
    const url = normalizeShortcutUrl(shortcutUrlInput.value);
    const duplicate = shortcuts.find((shortcut) => shortcut.url === url && shortcut.id !== editingShortcutId);
    if (duplicate) throw new Error("That website is already in your shortcuts.");
    const name = shortcutNameInput.value.trim() || new URL(url).hostname.replace(/^www\./, "");
    if (editingShortcutId) {
      shortcuts = shortcuts.map((shortcut) => shortcut.id === editingShortcutId ? { ...shortcut, name, url } : shortcut);
    } else {
      if (shortcuts.length >= 8) throw new Error("You can add up to 8 website shortcuts.");
      shortcuts = [...shortcuts, { id: crypto.randomUUID(), name, url }];
    }
    await storage.set({ [STORAGE_KEYS.shortcuts]: shortcuts });
    renderShortcuts();
    shortcutDialog.close();
  } catch (error) {
    shortcutError.textContent = error.message || "The shortcut could not be saved.";
  }
});

deleteShortcutButton.addEventListener("click", async () => {
  if (!editingShortcutId) return;
  shortcuts = shortcuts.filter((shortcut) => shortcut.id !== editingShortcutId);
  await storage.set({ [STORAGE_KEYS.shortcuts]: shortcuts });
  renderShortcuts();
  shortcutDialog.close();
});

backgroundOptions.filter((button) => button !== uploadBackgroundButton).forEach((button) => {
  button.addEventListener("click", () => chooseBackground(button.dataset.background));
});

uploadBackgroundButton.addEventListener("click", () => {
  if (customBackgroundImage && selectedBackground !== "custom") {
    chooseBackground("custom");
  } else {
    backgroundFileInput.click();
  }
});

backgroundFileInput.addEventListener("change", async () => {
  const [file] = backgroundFileInput.files;
  if (!file) return;
  const previousImage = customBackgroundImage;
  const previousSelection = selectedBackground;
  backgroundStatus.textContent = "Preparing image…";
  settingsError.textContent = "";
  try {
    customBackgroundImage = await optimizeBackgroundImage(file);
    selectedBackground = "custom";
    await storage.set({
      [STORAGE_KEYS.background]: selectedBackground,
      [STORAGE_KEYS.customBackground]: customBackgroundImage
    });
    applyBackground();
  } catch (error) {
    customBackgroundImage = previousImage;
    selectedBackground = previousSelection;
    settingsError.textContent = error.message || "The background image could not be saved.";
    applyBackground();
  } finally {
    backgroundFileInput.value = "";
  }
});

removeCustomBackgroundButton.addEventListener("click", async () => {
  customBackgroundImage = "";
  if (selectedBackground === "custom") selectedBackground = DEFAULT_BACKGROUND;
  await storage.set({
    [STORAGE_KEYS.background]: selectedBackground,
    [STORAGE_KEYS.customBackground]: ""
  });
  applyBackground();
});

document.querySelectorAll(".reveal-button").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(`#${button.dataset.target}`);
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    button.textContent = reveal ? "Hide" : "Show";
  });
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let nextGoogleCalendarUrl;
  let nextNewsFeeds;
  try {
    nextGoogleCalendarUrl = normalizeGoogleCalendarUrl(googleCalendarUrlInput.value);
  } catch (error) {
    settingsError.textContent = error.message;
    return;
  }
  try {
    nextNewsFeeds = readNewsFeedEditor();
    const permissionGranted = await requestNewsFeedPermissions(nextNewsFeeds);
    if (!permissionGranted) throw new Error("Chrome access is required to load the new RSS feed.");
  } catch (error) {
    newsFeedError.textContent = error.message;
    return;
  }
  const nextConfig = {
    openaiKey: openaiKeyInput.value.trim(),
    geminiKey: geminiKeyInput.value.trim(),
    openaiModel: openaiModelInput.value.trim() || DEFAULTS.openaiModel,
    geminiModel: geminiModelInput.value.trim() || DEFAULTS.geminiModel
  };
  const previousNewsFeeds = newsFeeds;
  const newsFeedsChanged = JSON.stringify(previousNewsFeeds) !== JSON.stringify(nextNewsFeeds);
  config = { ...config, ...nextConfig };
  newsFeeds = nextNewsFeeds;
  await storage.set({
    [STORAGE_KEYS.openaiKey]: config.openaiKey,
    [STORAGE_KEYS.geminiKey]: config.geminiKey,
    [STORAGE_KEYS.openaiModel]: config.openaiModel,
    [STORAGE_KEYS.geminiModel]: config.geminiModel,
    [STORAGE_KEYS.googleCalendarUrl]: nextGoogleCalendarUrl,
    [STORAGE_KEYS.newsFeeds]: newsFeeds,
    ...(newsFeedsChanged ? {
      [STORAGE_KEYS.newsCache]: [],
      [STORAGE_KEYS.newsCacheTime]: 0
    } : {})
  });
  if (newsFeedsChanged) {
    newsItems = [];
    newsCacheTime = 0;
    await removeUnusedNewsFeedPermissions(previousNewsFeeds, newsFeeds);
  }
  settingsError.textContent = "";
  newsFeedError.textContent = "";
  setProvider(selectedProvider, false);
  if (!nextGoogleCalendarUrl && googleCalendarUrl) {
    await disconnectGoogleCalendar();
  } else if (nextGoogleCalendarUrl && (nextGoogleCalendarUrl !== googleCalendarUrl || !googleCalendarSyncTime)) {
    try {
      await syncGoogleCalendar(true, nextGoogleCalendarUrl);
    } catch (error) {
      settingsError.textContent = error.message || "Google Calendar could not be synced.";
      return;
    }
  }
  settingsDialog.close();
  if (newsFeedsChanged) fetchNews(true);
  promptInput.focus();
});

async function initialize() {
  const saved = await storage.get(Object.values(STORAGE_KEYS));
  config = {
    provider: saved[STORAGE_KEYS.provider] || DEFAULTS.provider,
    openaiKey: saved[STORAGE_KEYS.openaiKey] || "",
    geminiKey: saved[STORAGE_KEYS.geminiKey] || "",
    openaiModel: saved[STORAGE_KEYS.openaiModel] || DEFAULTS.openaiModel,
    geminiModel: saved[STORAGE_KEYS.geminiModel] || DEFAULTS.geminiModel
  };
  calendarEvents = saved[STORAGE_KEYS.calendarEvents] && typeof saved[STORAGE_KEYS.calendarEvents] === "object"
    ? saved[STORAGE_KEYS.calendarEvents]
    : {};
  googleCalendarUrl = typeof saved[STORAGE_KEYS.googleCalendarUrl] === "string" ? saved[STORAGE_KEYS.googleCalendarUrl] : "";
  googleCalendarEvents = saved[STORAGE_KEYS.googleCalendarEvents] && typeof saved[STORAGE_KEYS.googleCalendarEvents] === "object"
    ? saved[STORAGE_KEYS.googleCalendarEvents]
    : {};
  googleCalendarSyncTime = Number(saved[STORAGE_KEYS.googleCalendarSyncTime]) || 0;
  const hasSavedNewsFeeds = Array.isArray(saved[STORAGE_KEYS.newsFeeds]);
  newsFeeds = sanitizeStoredNewsFeeds(saved[STORAGE_KEYS.newsFeeds]);
  newsItems = Array.isArray(saved[STORAGE_KEYS.newsCache]) ? saved[STORAGE_KEYS.newsCache] : [];
  newsCacheTime = Number(saved[STORAGE_KEYS.newsCacheTime]) || 0;
  if (!hasSavedNewsFeeds || newsItems.some((item) => !item.sourceName)) {
    newsItems = [];
    newsCacheTime = 0;
    await storage.set({
      [STORAGE_KEYS.newsFeeds]: newsFeeds,
      [STORAGE_KEYS.newsCache]: [],
      [STORAGE_KEYS.newsCacheTime]: 0
    });
  }
  shortcuts = Array.isArray(saved[STORAGE_KEYS.shortcuts])
    ? saved[STORAGE_KEYS.shortcuts].filter((shortcut) => shortcut?.id && shortcut?.url).slice(0, 8)
    : [];
  selectedBackground = typeof saved[STORAGE_KEYS.background] === "string"
    ? saved[STORAGE_KEYS.background]
    : DEFAULT_BACKGROUND;
  customBackgroundImage = typeof saved[STORAGE_KEYS.customBackground] === "string"
    ? saved[STORAGE_KEYS.customBackground]
    : "";
  applyBackground();
  setProvider(config.provider, false);
  renderShortcuts();
  renderMiniCalendar();
  renderNews();
  updateClock();
  setInterval(updateClock, 30_000);
  fetchNews();
  setInterval(() => fetchNews(), NEWS_REFRESH_MS);
  if (googleCalendarUrl) syncGoogleCalendar().catch(() => {});
  setInterval(() => {
    if (googleCalendarUrl) syncGoogleCalendar().catch(() => {});
  }, GOOGLE_CALENDAR_REFRESH_MS);
}

initialize();
