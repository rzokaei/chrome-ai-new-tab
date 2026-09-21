const IcalSync = (() => {
  const DAY_MS = 86_400_000;
  const WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  function unfold(text) {
    return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  }

  function unescapeText(value = "") {
    return value
      .replace(/\\[nN]/g, "\n")
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\\\/g, "\\");
  }

  function parseProperty(line) {
    const separator = line.indexOf(":");
    if (separator < 0) return null;
    const parts = line.slice(0, separator).split(";");
    const name = parts.shift().toUpperCase();
    const params = {};
    parts.forEach((part) => {
      const equals = part.indexOf("=");
      if (equals > 0) params[part.slice(0, equals).toUpperCase()] = part.slice(equals + 1).replace(/^"|"$/g, "");
    });
    return { name, params, value: line.slice(separator + 1) };
  }

  function zonedDate(parts, timeZone) {
    let timestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      });
      for (let pass = 0; pass < 2; pass += 1) {
        const formatted = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
        const observed = Date.UTC(
          Number(formatted.year),
          Number(formatted.month) - 1,
          Number(formatted.day),
          Number(formatted.hour),
          Number(formatted.minute),
          Number(formatted.second)
        );
        timestamp += Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - observed;
      }
    } catch {
      return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    }
    return new Date(timestamp);
  }

  function parseDateValue(property) {
    if (!property?.value) return null;
    const match = property.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
    if (!match) return null;
    const parts = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour: Number(match[4] || 0),
      minute: Number(match[5] || 0),
      second: Number(match[6] || 0)
    };
    const allDay = property.params.VALUE === "DATE" || !match[4];
    let date;
    if (match[7]) {
      date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
    } else if (property.params.TZID) {
      date = zonedDate(parts, property.params.TZID);
    } else {
      date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    }
    return { date, allDay };
  }

  function collectEvents(text) {
    const events = [];
    let current = null;
    unfold(text).forEach((line) => {
      if (line === "BEGIN:VEVENT") {
        current = {};
        return;
      }
      if (line === "END:VEVENT") {
        if (current) events.push(current);
        current = null;
        return;
      }
      if (!current) return;
      const property = parseProperty(line);
      if (!property) return;
      if (property.name === "EXDATE") {
        current.EXDATE = [...(current.EXDATE || []), ...property.value.split(",").map((value) => ({ ...property, value }))];
      } else if (!current[property.name]) {
        current[property.name] = property;
      }
    });
    return events;
  }

  function parseRule(value = "") {
    return Object.fromEntries(value.split(";").map((part) => {
      const separator = part.indexOf("=");
      return [part.slice(0, separator).toUpperCase(), part.slice(separator + 1)];
    }).filter(([key]) => key));
  }

  function withBaseTime(date, base) {
    const copy = new Date(date);
    copy.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
    return copy;
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function monthlyCandidates(year, month, base, rule) {
    const totalDays = daysInMonth(year, month);
    if (rule.BYMONTHDAY) {
      return rule.BYMONTHDAY.split(",").map(Number).map((number) => number > 0 ? number : totalDays + number + 1)
        .filter((day) => day >= 1 && day <= totalDays)
        .map((day) => withBaseTime(new Date(year, month, day), base));
    }
    if (rule.BYDAY) {
      const results = [];
      rule.BYDAY.split(",").forEach((token) => {
        const match = token.match(/^([+-]?\d+)?([A-Z]{2})$/);
        if (!match || WEEKDAYS[match[2]] === undefined) return;
        const weekday = WEEKDAYS[match[2]];
        const matches = [];
        for (let day = 1; day <= totalDays; day += 1) {
          const candidate = new Date(year, month, day);
          if (candidate.getDay() === weekday) matches.push(candidate);
        }
        const ordinal = Number(match[1] || 0);
        const selected = ordinal > 0 ? [matches[ordinal - 1]] : ordinal < 0 ? [matches[matches.length + ordinal]] : matches;
        selected.filter(Boolean).forEach((date) => results.push(withBaseTime(date, base)));
      });
      return results;
    }
    if (base.getDate() <= totalDays) return [withBaseTime(new Date(year, month, base.getDate()), base)];
    return [];
  }

  function recurrenceCandidates(base, rule, rangeEnd) {
    const frequency = rule.FREQ;
    const interval = Math.max(1, Number(rule.INTERVAL) || 1);
    const candidates = [];
    const safetyLimit = 10_000;
    if (frequency === "DAILY") {
      for (let index = 0; index < safetyLimit; index += 1) {
        const date = new Date(base);
        date.setDate(base.getDate() + index * interval);
        if (date > rangeEnd) break;
        candidates.push(date);
      }
    } else if (frequency === "WEEKLY") {
      const weekdays = (rule.BYDAY || Object.keys(WEEKDAYS).find((key) => WEEKDAYS[key] === base.getDay()))
        .split(",").map((token) => WEEKDAYS[token.slice(-2)]).filter((day) => day !== undefined).sort((a, b) => a - b);
      const weekStart = new Date(base);
      weekStart.setDate(base.getDate() - ((base.getDay() + 6) % 7));
      for (let week = 0; week < safetyLimit; week += 1) {
        const start = new Date(weekStart);
        start.setDate(weekStart.getDate() + week * interval * 7);
        if (start > rangeEnd) break;
        weekdays.forEach((weekday) => {
          const date = new Date(start);
          date.setDate(start.getDate() + ((weekday + 6) % 7));
          candidates.push(withBaseTime(date, base));
        });
      }
    } else if (frequency === "MONTHLY") {
      for (let index = 0; index < safetyLimit; index += 1) {
        const anchor = new Date(base.getFullYear(), base.getMonth() + index * interval, 1);
        if (anchor > rangeEnd) break;
        candidates.push(...monthlyCandidates(anchor.getFullYear(), anchor.getMonth(), base, rule));
      }
    } else if (frequency === "YEARLY") {
      const months = (rule.BYMONTH || String(base.getMonth() + 1)).split(",").map(Number);
      for (let index = 0; index < safetyLimit; index += 1) {
        const year = base.getFullYear() + index * interval;
        if (new Date(year, 0, 1) > rangeEnd) break;
        months.forEach((month) => candidates.push(...monthlyCandidates(year, month - 1, base, rule)));
      }
    } else {
      candidates.push(base);
    }
    return candidates.sort((left, right) => left - right);
  }

  function occurrence(raw, start, duration, allDay, index) {
    const title = unescapeText(raw.SUMMARY?.value || "Untitled event");
    const uid = raw.UID?.value || `${title}-${start.getTime()}`;
    return {
      id: `google-${uid}-${start.getTime()}-${index}`,
      title,
      start: start.toISOString(),
      end: new Date(start.getTime() + duration).toISOString(),
      allDay,
      location: unescapeText(raw.LOCATION?.value || ""),
      source: "google"
    };
  }

  function parse(text, options = {}) {
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("Google Calendar returned an invalid iCal file.");
    const now = new Date();
    const rangeStart = options.rangeStart ? new Date(options.rangeStart) : new Date(now.getFullYear() - 2, 0, 1);
    const rangeEnd = options.rangeEnd ? new Date(options.rangeEnd) : new Date(now.getFullYear() + 3, 11, 31, 23, 59, 59);
    const rawEvents = collectEvents(text);
    const exceptionKeys = new Map();
    rawEvents.forEach((raw) => {
      const uid = raw.UID?.value;
      const recurrence = parseDateValue(raw["RECURRENCE-ID"]);
      if (uid && recurrence) {
        if (!exceptionKeys.has(uid)) exceptionKeys.set(uid, new Set());
        exceptionKeys.get(uid).add(recurrence.date.getTime());
      }
    });

    const results = [];
    rawEvents.forEach((raw) => {
      const startValue = parseDateValue(raw.DTSTART);
      if (!startValue || raw.STATUS?.value === "CANCELLED") return;
      const endValue = parseDateValue(raw.DTEND);
      const defaultDuration = startValue.allDay ? DAY_MS : 60 * 60 * 1000;
      const duration = Math.max(0, (endValue?.date.getTime() || startValue.date.getTime() + defaultDuration) - startValue.date.getTime());
      const uid = raw.UID?.value || "";
      const excluded = new Set((raw.EXDATE || []).map(parseDateValue).filter(Boolean).map((entry) => entry.date.getTime()));
      (exceptionKeys.get(uid) || []).forEach((timestamp) => excluded.add(timestamp));

      if (!raw.RRULE || raw["RECURRENCE-ID"]) {
        const eventEnd = new Date(startValue.date.getTime() + duration);
        if (eventEnd >= rangeStart && startValue.date <= rangeEnd) results.push(occurrence(raw, startValue.date, duration, startValue.allDay, 0));
        return;
      }

      const rule = parseRule(raw.RRULE.value);
      const untilValue = rule.UNTIL ? parseDateValue({ value: rule.UNTIL, params: {} }) : null;
      const until = untilValue?.date || rangeEnd;
      const countLimit = Number(rule.COUNT) || Infinity;
      const candidates = recurrenceCandidates(startValue.date, rule, new Date(Math.min(rangeEnd.getTime(), until.getTime())));
      let sequence = 0;
      candidates.forEach((candidate) => {
        if (candidate < startValue.date || candidate > until || sequence >= countLimit) return;
        sequence += 1;
        if (excluded.has(candidate.getTime())) return;
        const eventEnd = new Date(candidate.getTime() + duration);
        if (eventEnd >= rangeStart && candidate <= rangeEnd) results.push(occurrence(raw, candidate, duration, startValue.allDay, sequence));
      });
    });
    return results.sort((left, right) => new Date(left.start) - new Date(right.start));
  }

  return { parse };
})();

globalThis.IcalSync = IcalSync;
if (typeof module !== "undefined") module.exports = IcalSync;
