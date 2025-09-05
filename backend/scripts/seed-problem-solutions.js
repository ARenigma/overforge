/*
  Seed problem_solutions using AI module for all problems in master_problems.
  Usage:
    node scripts/seed-problem-solutions.js --dry-run --limit 5 --start 0
    node scripts/seed-problem-solutions.js --limit 20
*/

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Load backend .env
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AI_MODULE_URL = process.env.AI_MODULE_URL || 'http://localhost:8000';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase envs. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = { dryRun: false, limit: null, start: 0 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') flags.dryRun = true;
    else if (a === '--limit') flags.limit = parseInt(args[++i] || '0', 10);
    else if (a === '--start') flags.start = parseInt(args[++i] || '0', 10);
  }
  return flags;
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

function buildApproachPrompt(problem) {
  const { title, description, category, technology } = problem;
  return `You are generating solution approaches for a coding interview problem.

PROBLEM:
Title: ${title}
Category: ${category}
Technology: ${technology}
Description: ${description}

TASK:
Propose 2-3 distinct solution approaches. Each must include the following fields:
- approach_key (kebab-case short key, e.g., "two-pointer", "hashmap", "recursive")
- title (concise approach name)
- summary (1-2 sentences)
- pros (array of strings)
- cons (array of strings)
- time_complexity (e.g., "O(n log n)")
- space_complexity (e.g., "O(n)" or "O(1)")

Respond EXACTLY with JSON in this shape and NOTHING ELSE (no prose, no code fences):
{
  "approaches": [
    {
      "approach_key": "two-pointer",
      "title": "Two Pointer",
      "summary": "...",
      "pros": ["..."],
      "cons": ["..."],
      "time_complexity": "O(n)",
      "space_complexity": "O(1)"
    }
  ]
}`;
}

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

function tryParseApproaches(raw) {
  if (!raw) return [];
  if (typeof raw === 'object') {
    // Could be { questions: [...] } or direct array
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.approaches)) return raw.approaches;
    if (raw.response && typeof raw.response === 'string') {
      return tryParseApproaches(raw.response);
    }
    if (raw.content && typeof raw.content === 'string') {
      return tryParseApproaches(raw.content);
    }
  }
  if (typeof raw === 'string') {
    // Try code-fence JSON first
    const fence = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/```\s*([\s\S]*?)\s*```/i);
    const text = fence ? fence[1] : raw;
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.approaches)) return parsed.approaches;
    } catch (_) {}

    // Fallback: extract { "approaches": [...] } substring
    const match = text.match(/\{[\s\S]*?"approaches"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/i);
    if (match) {
      try {
        const parsed2 = JSON.parse(match[0]);
        if (parsed2 && Array.isArray(parsed2.approaches)) return parsed2.approaches;
      } catch (_) {}
    }
  }
  return [];
}

function normalizeApproach(a) {
  return {
    approach_key: (a.approach_key || a.key || a.title || 'approach').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    title: a.title || a.approach || a.approach_key || 'Approach',
    summary: a.summary || a.description || '',
    pros: coerceArray(a.pros),
    cons: coerceArray(a.cons),
    time_complexity: a.time_complexity || a.time || '',
    space_complexity: a.space_complexity || a.space || ''
  };
}

async function generateApproachesViaAI(problem) {
  try {
    const payload = {
      title: problem.title,
      description: problem.description || '',
      category: problem.category || null,
      technology: problem.technology || null
    };
    const res = await axios.post(`${AI_MODULE_URL}/generate-approaches`, payload, { timeout: 35000 });
    if (res.data && res.data.success && Array.isArray(res.data.approaches)) {
      return res.data.approaches.map(normalizeApproach).slice(0, 3);
    }
    return [];
  } catch (err) {
    console.error('AI error:', err.response?.status, err.message);
    return [];
  }
}

async function fetchAllProblems() {
  const { data, error } = await supabase
    .from('master_problems')
    .select('id, title, description, category, technology')
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function hasSolutions(problemId) {
  const { data, error } = await supabase
    .from('problem_solutions')
    .select('id', { count: 'exact', head: true })
    .eq('problem_id', problemId);
  if (error) throw error;
  return (data && data.length) || false; // head:true often returns null data
}

async function upsertApproaches(problemId, approaches) {
  for (const a of approaches) {
    const row = {
      problem_id: problemId,
      approach_key: a.approach_key,
      title: a.title,
      summary: a.summary,
      pros: a.pros,
      cons: a.cons,
      time_complexity: a.time_complexity,
      space_complexity: a.space_complexity,
      confidence: 70,
      is_active: true
    };
    const { error } = await supabase
      .from('problem_solutions')
      .upsert(row, { onConflict: 'problem_id,approach_key' });
    if (error) throw error;
  }
}

async function main() {
  const { dryRun, limit, start } = parseArgs();
  console.log(`🔍 Seeding problem_solutions ${dryRun ? '(dry-run)' : '(live)'} AI_URL=${AI_MODULE_URL}`);
  const problems = await fetchAllProblems();
  const slice = problems.slice(start || 0, limit ? start + limit : undefined);
  let seeded = 0, skipped = 0, errors = 0;

  for (const p of slice) {
    try {
      const exists = await hasSolutions(p.id);
      if (exists) {
        console.log(`⏭️  Skip (exists) Problem ${p.id}: ${p.title}`);
        skipped++;
        continue;
      }
      console.log(`🧠 Generating approaches for Problem ${p.id}: ${p.title}`);
      const approaches = await generateApproachesViaAI(p);
      if (!approaches.length) {
        console.log(`⚠️  AI returned no approaches for Problem ${p.id}`);
        skipped++;
        continue;
      }
      if (dryRun) {
        console.log(`📝 DRY-RUN → Would insert ${approaches.length} approaches for Problem ${p.id}`);
      } else {
        await upsertApproaches(p.id, approaches);
        console.log(`✅ Inserted ${approaches.length} approaches for Problem ${p.id}`);
      }
      seeded++;
      await sleep(800); // gentle rate limiting
    } catch (e) {
      console.error(`❌ Error seeding Problem ${p.id}:`, e.message);
      errors++;
    }
  }

  console.log(`\n📊 Done. Seeded: ${seeded}, Skipped: ${skipped}, Errors: ${errors}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});


