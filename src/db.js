const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'adaptive-coach.db'));

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL,
  workout_name TEXT NOT NULL,
  notes TEXT,
  UNIQUE(weekday)
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  sleep_hours REAL NOT NULL,
  hrv REAL NOT NULL,
  energy_level INTEGER NOT NULL,
  soreness_level INTEGER NOT NULL,
  stress_level INTEGER NOT NULL,
  body_weight REAL,
  notes TEXT,
  worked_out_yesterday INTEGER NOT NULL DEFAULT 0,
  screenshot_path TEXT,
  extracted_data_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  source TEXT,
  image_path TEXT NOT NULL,
  extracted_data_json TEXT,
  parse_status TEXT NOT NULL DEFAULT 'manual_pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  workout_type TEXT NOT NULL,
  exercises_json TEXT,
  sets_reps_weight_json TEXT,
  notes TEXT,
  completed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cardio_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  avg_hr INTEGER,
  zone2 INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS missed_workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  planned_workout TEXT NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  summary_assessment TEXT NOT NULL,
  recommendation_json TEXT NOT NULL,
  why_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const basePlan = [
  [1, 'Upper strength', 'Heavy upper body strength focus'],
  [2, 'Lower + Zone 2', 'Lower body strength then aerobic work'],
  [3, 'Recovery / Zone 2', 'Recovery and aerobic base'],
  [4, 'Upper hypertrophy', 'Higher volume upper body'],
  [5, 'Full body light stimulus', 'Lower fatigue full body'],
  [6, 'Cardio', 'Longer Zone 2 cardio day'],
  [0, 'Rest', 'Full rest and recovery']
];

const existingPlanCount = db.prepare('SELECT COUNT(*) as count FROM training_plan').get().count;
if (existingPlanCount === 0) {
  const insertPlan = db.prepare('INSERT INTO training_plan (weekday, workout_name, notes) VALUES (?, ?, ?)');
  const txn = db.transaction((rows) => {
    for (const row of rows) insertPlan.run(...row);
  });
  txn(basePlan);
}

const defaultUser = process.env.APP_USERNAME || 'coach';
const defaultPassword = process.env.APP_PASSWORD || 'coach123';
const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(defaultUser);
if (!existingUser) {
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(defaultUser, bcrypt.hashSync(defaultPassword, 10));
}

function seedSampleData() {
  const existingCheckin = db.prepare('SELECT COUNT(*) as count FROM checkins').get().count;
  if (existingCheckin > 0) return;

  db.prepare(`INSERT INTO checkins (date, sleep_hours, hrv, energy_level, soreness_level, stress_level, body_weight, notes, worked_out_yesterday)
              VALUES
              ('2026-05-26', 7.2, 33, 7, 4, 4, 188.4, 'Felt good, slight hamstring tightness', 1),
              ('2026-05-27', 5.8, 23, 4, 7, 7, 188.9, 'Poor sleep from travel day', 0),
              ('2026-05-28', 6.9, 29, 6, 5, 5, 188.2, 'Energy rebounding', 1)
  `).run();

  db.prepare(`INSERT INTO workout_logs (date, workout_type, exercises_json, sets_reps_weight_json, notes)
              VALUES
              ('2026-05-26', 'Upper strength', '["Bench","Pull-up","OHP"]', '{"Bench":"4x5x185"}', 'Solid performance'),
              ('2026-05-28', 'Recovery / Zone 2', '["Mobility","Walk"]', '{"Zone2":"35min@114bpm"}', 'Kept easy due to low HRV')
  `).run();

  db.prepare(`INSERT INTO cardio_logs (date, minutes, avg_hr, zone2, notes)
              VALUES
              ('2026-05-27', 32, 112, 1, 'Bike Zone 2')
  `).run();
}

seedSampleData();

module.exports = { db };
