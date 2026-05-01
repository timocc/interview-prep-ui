# Notion Schema Mapping

This document captures the seam between the static MVP and future Notion sync.

## Source page

Provided page: `https://www.notion.so/At-A-Glance-30a55905e48b80b1be3cf069a6dd3a06`

The connector exposed the page as `📒 👀 At-A-Glance` with parent page `the q4 2025 push to interview prep`.

## Mapped databases

| Product source | Notion data source | Domain target |
|---|---|---|
| LC Problems w/ Waves | `collection://30c55905-e48b-818a-9b2e-000b4e7aaa70` | `ResourceItem` |
| 130 Problems | `collection://30955905-e48b-8061-b37a-000b559277ad` | `ResourceItem` |
| System Design Topics | `collection://30c55905-e48b-81f4-b1ae-000b987a69cd` | `ResourceItem` |
| Elite System Design Topics | `collection://30c55905-e48b-811d-b08f-000b29d3e9ad` | `ResourceItem` |
| Weekly Goals | not yet created in fetched workspace | `WeeklyPlan` |
| Database Internals | described on source page, not exposed as linked database | `ResourceItem` |

## Field mapping

### LC Problems w/ Waves

| Notion field | App field |
|---|---|
| Problem Name | `title` |
| Category | `category` support tag |
| Topic | `subcategory` |
| Difficulty | `difficulty` |
| Status | `status` |
| Wave | weak-area/source context |
| Pattern | weak-area/source context |
| Key Concepts | `notes` |
| Planned Date | `lastTouchedAt` candidate |

### 130 Problems

| Notion field | App field |
|---|---|
| Problem Name | `title` |
| Category | support tag |
| Topic | `subcategory` |
| Difficulty | `difficulty` |
| Status | `status` |
| Pattern | weak-area/source context |
| Key Concepts | `notes` |
| Planned Date | `lastTouchedAt` candidate |

### System Design Topics

| Notion field | App field |
|---|---|
| Topic Name | `title` |
| Category | support tag |
| Phase | `subcategory` |
| Priority | `priority` |
| Status | `status` |
| Type | `notes` or weak-area/source context |
| Date Start / Date End | planning metadata |

### Elite System Design Topics

| Notion field | App field |
|---|---|
| Topic Name | `title` |
| Category | `subcategory` or support tag |
| Type | support tag |
| Depends on | `notes` |
| Priority | `priority` |
| Status | `status` |
| Unblocked ? | future filter |
| Date Start / Date End | planning metadata |

### Database Internals

| Notion concept field | App field |
|---|---|
| Topic Name | `title` |
| Category | `subcategory` |
| Type | support tag |
| Status | `status` |
| Learning Stage | support tag |
| Database Systems | weak-area/source context |
| Learning Source | notes/source context |
| Confidence Level | `confidence` |
| Practical Use Cases | `notes` |
| Prerequisites / Related Topics | future dependency graph |

### Weekly Goals

| Notion concept field | App field |
|---|---|
| Week Of | `weekOf` |
| DSA Goal | `selectedItemIds` filtered to DSA |
| System Design Goal | `selectedItemIds` filtered to System Design |
| DB Internals Goal | `selectedItemIds` filtered to DB Internals |
| Total Hours Planned | `plannedHours` |
| Total Hours Actual | `actualHours` |
| Retrospective | `retrospective` |
| Next Week Focus | `nextWeekFocus` |
| Completed | future weekly status |

## Adapter stub

The adapter lives in `notionAdapter.js`.

It currently provides:

- `sourceMap`: declarative mapping from Notion field names to app fields.
- `normalizeNotionStatus(status)`: maps Notion statuses into `must`, `active`, `parked`, or `done`.
- `toResourceItem(notionRow, sourceDatabase)`: converts a future Notion row into a `ResourceItem`.
- `syncPreview()`: returns the intended sync shape and source map.

Future sync should:

1. Fetch each mapped `collection://` source through the Notion connector.
2. Query rows from each data source.
3. Normalize rows with `toResourceItem`.
4. Merge by Notion URL or stable page ID.
5. Write weekly plan and session logs back to a Weekly Goals / Daily Sessions database.
