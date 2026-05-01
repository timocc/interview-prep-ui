/**
   * @typedef {Object} ConnectorFetchShape
   * Expected shape of a single row returned by a Notion connector.
   * Field names match the column names in the Notion database.
   *
   * @property {string}  url              - Notion page URL (used as stable ID; always present)
   * @property {string}  [title]          - Primary title column value
   * @property {string}  [status]         - Notion select/status field (e.g. "In Progress", "Done")
   * @property {string}  [priority]       - "High" | "Medium" | "Low" or null
   * @property {string}  [difficulty]     - "Easy" | "Medium" | "Hard" or null
   * @property {string}  [category]       - Category column raw value
   * @property {string}  [subcategory]    - Topic/Phase/Type column raw value
   * @property {string}  [notes]          - Key Concepts, Type, or Depends-on column
   * @property {string}  ["date:<field>:start"] - ISO date string from a Notion date property
   * @property {string}  [Pattern]        - Extra tag column, database-specific
   * @property {string}  [Wave]           - Extra tag column for LC Problems
   */

export const sourceMap = {
    "LC Problems w/ Waves": {
      dataSourceUrl: "collection://30c55905-e48b-818a-9b2e-000b4e7aaa70",
      title: "Problem Name",
      category: "Category",
      subcategory: "Topic",
      difficulty: "Difficulty",
      status: "Status",
      priority: null,
      notes: "Key Concepts",
      date: "Planned Date",
      extra: ["Wave", "Pattern"]
    },
    "130 Problems": {
      dataSourceUrl: "collection://30955905-e48b-8061-b37a-000b559277ad",
      title: "Problem Name",
      category: "Category",
      subcategory: "Topic",
      difficulty: "Difficulty",
      status: "Status",
      priority: null,
      notes: "Key Concepts",
      date: "Planned Date",
      extra: ["Pattern"]
    },
    "System Design Topics": {
      dataSourceUrl: "collection://30c55905-e48b-81f4-b1ae-000b987a69cd",
      title: "Topic Name",
      category: "Category",
      subcategory: "Phase",
      difficulty: null,
      status: "Status",
      priority: "Priority",
      notes: "Type",
      date: "Date Start",
      extra: ["Date End"]
    },
    "Elite System Design Topics": {
      dataSourceUrl: "collection://30c55905-e48b-811d-b08f-000b29d3e9ad",
      title: "Topic Name",
      category: "Category",
      subcategory: "Type",
      difficulty: null,
      status: "Status",
      priority: "Priority",
      notes: "Depends on",
      date: "Date Start",
      extra: ["Date End", "Unblocked ? "]
    },
    "Database Internals": {
      dataSourceUrl: "future-database-in-source-page",
      title: "Topic Name",
      category: "Category",
      subcategory: "Learning Stage",
      difficulty: "Confidence Level",
      status: "Status",
      priority: null,
      notes: "Practical Use Cases",
      date: "Date Started",
      extra: ["Type", "Database Systems", "Learning Source", "Hands-On Practice", "Prerequisites"]
    },
    "Weekly Goals": {
      dataSourceUrl: "future-weekly-goals-database",
      title: "Week Of",
      selectedItemIds: ["DSA Goal", "System Design Goal", "DB Internals Goal"],
      plannedHours: "Total Hours Planned",
      actualHours: "Total Hours Actual",
      retrospective: "Retrospective",
      nextWeekFocus: "Next Week Focus",
      completed: "Completed"
    }
  };

  /**
   * getStableId(notionRow, sourceDatabase) — derive a stable string ID for
   * a Notion row that survives re-syncs. Prefers the Notion page URL which
   * is immutable; falls back to a slugified title+source string.
   *
   * @param {ConnectorFetchShape} notionRow
   * @param {string} sourceDatabase
   * @returns {string}
   */
export function getStableId(notionRow, sourceDatabase) {
    if (notionRow.url && notionRow.url.startsWith("http")) return notionRow.url;
    const map = sourceMap[sourceDatabase];
    const title = (map ? notionRow[map.title] : null) || "untitled";
    return `${sourceDatabase}-${title}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

export function normalizeNotionStatus(status) {
    if (!status) return "parked";
    const s = status.toLowerCase().trim();
    if (s === "done" || s === "completed" || s === "finished" || s === "closed") return "done";
    if (s.includes("progress") || s === "review" || s === "in review" || s === "active" || s === "started") return "active";
    if (s === "must" || s === "must do" || s === "urgent" || s === "priority") return "must";
    if (s === "not started" || s === "backlog" || s === "parked" || s === "on hold") return "parked";
    return "parked";
  }

  function normalizePriority(priority) {
    if (!priority) return 3;
    if (String(priority).toLowerCase() === "high") return 5;
    if (String(priority).toLowerCase() === "medium") return 3;
    return 2;
  }

export function toResourceItem(notionRow, sourceDatabase) {
    const map = sourceMap[sourceDatabase];
    if (!map) throw new Error(`No Notion mapping for ${sourceDatabase}`);
    const title = notionRow[map.title] || "Untitled";
    return {
      id: getStableId(notionRow, sourceDatabase),
      title,
      category: sourceDatabase.includes("System Design") ? "System Design" : sourceDatabase.includes("Database") ? "DB Internals" : "DSA",
      subcategory: notionRow[map.subcategory] || notionRow[map.category] || "General",
      difficulty: notionRow[map.difficulty] || "Medium",
      sourceDatabase,
      status: normalizeNotionStatus(notionRow[map.status]),
      priority: normalizePriority(notionRow[map.priority]),
      weakAreaTags: [notionRow[map.subcategory], notionRow.Pattern, notionRow.Wave].filter(Boolean).map((value) => String(value).toLowerCase()),
      estimatedMinutes: sourceDatabase.includes("System Design") ? 90 : 60,
      lastTouchedAt: notionRow[`date:${map.date}:start`] || null,
      confidence: 3,
      notes: notionRow[map.notes] || ""
    };
  }

  /**
   * mergeResources(existing, incoming) — merge a fresh set of normalized
   * Notion rows into the current resource list.
   *
   * Rules:
   *   - Match by stable ID (getStableId result); Notion URL wins over slug.
   *   - For matched items: update content fields from incoming.
   *   - Preserve from existing: confidence, lastTouchedAt (local learning state).
   *   - Items in existing with no match in incoming → status = "parked" (not deleted).
   *   - Items in incoming with no match in existing → appended as new.
   *
   * @param {object[]} existing  - current state.resources array
   * @param {object[]} incoming  - freshly normalized ResourceItem objects
   * @returns {object[]}         - merged resources array (new array, no mutation)
   */
export function mergeResources(existing, incoming) {
    const incomingById = new Map(incoming.map((item) => [item.id, item]));
    const existingIds = new Set(existing.map((item) => item.id));

    const merged = existing.map((item) => {
      const fresh = incomingById.get(item.id);
      if (!fresh) {
        // No longer in Notion source — park it rather than delete
        return { ...item, status: item.status === "done" ? "done" : "parked" };
      }
      return {
        ...fresh,
        // Preserve local learning state — user may have promoted, demoted,
        // logged sessions, or adjusted confidence since last CSV import.
        status: item.status,
        priority: item.priority,
        confidence: item.confidence,
        lastTouchedAt: item.lastTouchedAt
      };
    });

    // Append truly new items
    incoming.forEach((item) => {
      if (!existingIds.has(item.id)) merged.push(item);
    });

    return merged;
  }

export async function syncPreview() {
    // TODO (sync step 1 — read): Call the Notion connector for each
    // dataSourceUrl in sourceMap, normalize rows with toResourceItem,
    // then call mergeResources(state.resources, normalized) and persist.

    // TODO (sync step 2 — writeback): After a session is logged, push
    // confidenceAfter and lastTouchedAt back to the Notion row via connector
    // PATCH. Requires the connector to expose write endpoints.

    // TODO (sync step 3 — weekly plan): Map state.weeklyPlan fields to the
    // "Weekly Goals" sourceMap entry and upsert the matching Notion row.

    return {
      mode: "stub",
      message:
        "Future sync should call the Notion connector for the mapped collection:// data sources, normalize rows with toResourceItem, then merge by id/url.",
      sourceMap
    };
  }

