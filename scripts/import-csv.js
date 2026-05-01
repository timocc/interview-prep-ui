#!/usr/bin/env node
/**
 * scripts/import-csv.js
 *
 * Converts Notion CSV exports into data.js.
 *
 * Usage:
 *   node scripts/import-csv.js
 *
 * Reads from:  resources/notion_raw/*.csv
 * Writes to:   data.js
 *
 * Add new CSV files: drop them in resources/notion_raw/ and add an entry
 * to SOURCE_FILES below with the matching converter key.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RAW_DIR = path.join(ROOT, "resources", "notion_raw");
const OUT_FILE = path.join(ROOT, "data.js");

// Maps sourceDatabase name → { file glob pattern, converter fn key }
const SOURCE_FILES = [
  {
    sourceDatabase: "LC Problems w/ Waves",
    file: "LC Problems w Waves",
    converter: "convertLC"
  },
  {
    sourceDatabase: "System Design Topics",
    file: "System Design Topics",
    converter: "convertSD"
  }
  // Future: add 130 Problems, Elite System Design Topics, Database Internals here
];

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  // Strip BOM and normalize line endings
  const lines = text
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length < 2) return [];
  const headers = parseRow(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseRow(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = (values[i] ?? "").trim()));
    return row;
  });
}

function parseRow(line) {
  const fields = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push("");
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      i++;
      let field = "";
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i++];
        }
      }
      fields.push(field);
      if (line[i] === ",") i++;
    } else {
      // Unquoted field
      let field = "";
      while (i < line.length && line[i] !== ",") field += line[i++];
      if (line[i] === ",") i++;
      fields.push(field);
    }
  }
  return fields;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slug(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function waveNum(wave) {
  const m = String(wave ?? "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 9;
}

// Wave 1-2 → priority 5, 3-4 → 4, 5-6 → 3, 7-8 → 2
function waveToPriority(wave) {
  const n = waveNum(wave);
  if (n <= 2) return 5;
  if (n <= 4) return 4;
  if (n <= 6) return 3;
  return 2;
}

function diffToMinutes(diff) {
  if (diff === "Easy") return 45;
  if (diff === "Hard") return 90;
  return 60;
}

function textPriority(p) {
  const s = String(p ?? "").toLowerCase();
  if (s === "high") return 5;
  if (s === "medium") return 3;
  if (s === "low") return 2;
  return 3;
}

// "Phase 4 - Distributed Systems" → "Distributed Systems"
function phaseLabel(phase) {
  const m = String(phase ?? "").match(/Phase \d+ - (.+)/);
  return m ? m[1] : (phase || "General");
}

// ── Converters ────────────────────────────────────────────────────────────────

function convertLC(rows) {
  return rows
    .filter((r) => r["Problem Name"])
    .map((row) => {
      const name = row["Problem Name"];
      const lcNum = row["Property"]; // LeetCode problem number
      const topic = row["Topic"] || "";
      const pattern = row["Pattern"] || "";
      const wave = row["Wave"] || "";
      const difficulty = row["Difficulty"] || "Medium";
      const keyConcepts = row["Key Concepts"] || "";

      const id = lcNum ? `lc-${lcNum}-${slug(name)}` : `lc-${slug(name)}`;
      const weakAreaTags = [topic, pattern, wave]
        .filter(Boolean)
        .map((t) => t.toLowerCase());

      const notesParts = [keyConcepts, pattern ? `Pattern: ${pattern}` : null, wave]
        .filter(Boolean);

      return {
        id,
        title: name,
        category: "DSA",
        subcategory: topic,
        difficulty,
        sourceDatabase: "LC Problems w/ Waves",
        status: "parked",
        priority: waveToPriority(wave),
        weakAreaTags,
        estimatedMinutes: diffToMinutes(difficulty),
        lastTouchedAt: null,
        confidence: 3,
        notes: notesParts.join(" | ")
      };
    });
}

function convertSD(rows) {
  return rows
    .filter((r) => r["Topic Name"])
    .map((row) => {
      const name = row["Topic Name"];
      const category = row["Category"] || ""; // Case Study / Distributed systems / Fundamentals
      const phase = row["Phase"] || "";
      const type = row["Type"] || ""; // Architecture / Concept / Mock Interview
      const priority = row["Priority"] || "";

      const weakAreaTags = [category, type, phaseLabel(phase)]
        .filter(Boolean)
        .map((t) => t.toLowerCase());

      return {
        id: `sd-${slug(name)}`,
        title: name,
        category: "System Design",
        subcategory: category,
        difficulty: "Medium",
        sourceDatabase: "System Design Topics",
        status: "parked",
        priority: textPriority(priority),
        weakAreaTags,
        estimatedMinutes: 90,
        lastTouchedAt: null,
        confidence: 3,
        notes: [phase, type].filter(Boolean).join(" | ")
      };
    });
}

const CONVERTERS = { convertLC, convertSD };

// ── Find CSV file for a source entry ─────────────────────────────────────────

function findCSV(filePrefix) {
  const files = fs.readdirSync(RAW_DIR);
  const match = files.find((f) => f.startsWith(filePrefix) && f.endsWith(".csv"));
  return match ? path.join(RAW_DIR, match) : null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const allResources = [];
  const summary = [];

  for (const { sourceDatabase, file, converter } of SOURCE_FILES) {
    const csvPath = findCSV(file);
    if (!csvPath) {
      console.warn(`  SKIP  ${sourceDatabase} — no CSV found matching "${file}*.csv" in resources/notion_raw/`);
      continue;
    }

    const text = fs.readFileSync(csvPath, "utf8");
    const rows = parseCSV(text);
    const items = CONVERTERS[converter](rows);
    allResources.push(...items);
    summary.push(`  ${items.length.toString().padStart(3)} items  ←  ${path.basename(csvPath)}`);
    console.log(`  OK    ${sourceDatabase}: ${items.length} items from ${path.basename(csvPath)}`);
  }

  const seed = {
    resources: allResources,
    weeklyPlan: {
      weekOf: "", // set at runtime by app.js
      targetDSA: 4,
      targetSystemDesign: 2,
      targetDBInternals: 0,
      plannedHours: 7,
      actualHours: 0,
      selectedItemIds: [],
      retrospective: "",
      nextWeekFocus: ""
    },
    sessions: [],
    reflections: []
  };

  const output = `// data.js — generated by scripts/import-csv.js
// DO NOT edit by hand. Re-run the script to update from Notion CSV exports.
//
// Sources:
${summary.map((s) => `// ${s}`).join("\n")}
// Total: ${allResources.length} items
//
// To add a new source database:
//   1. Export from Notion as CSV into resources/notion_raw/
//   2. Add an entry to SOURCE_FILES in scripts/import-csv.js
//   3. Run: node scripts/import-csv.js

window.InterviewPrepSeed = ${JSON.stringify(seed, null, 2)};
`;

  fs.writeFileSync(OUT_FILE, output, "utf8");
  console.log(`\nWrote ${allResources.length} resources to data.js`);
}

main();
