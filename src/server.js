const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const { rateLimit } = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { db } = require('./db');
const { calculateRecoveryScore, getAdaptiveRecommendation } = require('./recommendationEngine');
const { buildCoachPrompt } = require('./aiPromptTemplate');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production');
}

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

function safeFilename(originalName) {
  const base = path.basename(originalName || 'upload');
  const extension = path.extname(base).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
  const stem = path.basename(base, extension).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const safe = `${stem || 'upload'}${extension}`;
  return safe || 'upload';
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${safeFilename(file.originalname)}`)
});

const upload = multer({ storage });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(uploadDir));
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-only-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction }
}));

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  return req.session.csrfToken;
}

function requireCsrf(req, res, next) {
  const token = req.get('x-csrf-token') || req.body.csrfToken;
  if (!req.session.csrfToken || !token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  return next();
}

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

app.use('/api', apiLimiter);

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}

function trainingPlanMap() {
  const rows = db.prepare('SELECT weekday, workout_name FROM training_plan').all();
  return new Map(rows.map((r) => [r.weekday, { workoutName: r.workout_name }]));
}

function getLatestDashboardData() {
  const latestCheckin = db.prepare('SELECT * FROM checkins ORDER BY date DESC LIMIT 1').get();
  const lastWorkout = db.prepare('SELECT * FROM workout_logs ORDER BY date DESC LIMIT 1').get();
  const lastCardio = db.prepare('SELECT * FROM cardio_logs ORDER BY date DESC LIMIT 1').get();
  const missedWorkout = db.prepare('SELECT planned_workout FROM missed_workouts ORDER BY date DESC LIMIT 1').get()?.planned_workout;

  const checkin = latestCheckin && {
    sleepHours: Number(latestCheckin.sleep_hours),
    hrv: Number(latestCheckin.hrv),
    energyLevel: Number(latestCheckin.energy_level),
    sorenessLevel: Number(latestCheckin.soreness_level),
    stressLevel: Number(latestCheckin.stress_level)
  };

  const recommendation = getAdaptiveRecommendation({
    date: new Date(),
    checkin,
    lastWorkout: lastWorkout ? { date: lastWorkout.date, workoutType: lastWorkout.workout_type } : null,
    lastCardio,
    trainingPlanByWeekday: trainingPlanMap(),
    missedWorkout
  });

  return {
    latestCheckin,
    lastWorkout,
    lastCardio,
    recommendation,
    recoveryScore: calculateRecoveryScore(checkin)
  };
}

app.get('/login', (req, res) => {
  const csrfToken = ensureCsrfToken(req);
  res.send(`<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><link rel="stylesheet" href="/public/styles.css"/><title>Adaptive Workout Coach - Login</title></head><body><main class="container auth"><h1>Adaptive Workout Coach</h1><form method="post" action="/auth/login" class="card"><input type="hidden" name="csrfToken" value="${csrfToken}" /><label>Username<input name="username" required /></label><label>Password<input name="password" type="password" required /></label><button type="submit">Sign in</button><p class="hint">Default: coach / coach123</p></form></main></body></html>`);
});

app.post('/auth/login', authLimiter, requireCsrf, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send('Username and password are required');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).send('Invalid credentials');
  req.session.userId = user.id;
  res.redirect('/');
});

app.post('/auth/logout', requireCsrf, (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/auth/me', (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  return res.json({ authenticated: true });
});

app.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const csrfToken = ensureCsrfToken(req);
  res.send(`<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="csrf-token" content="${csrfToken}" /><link rel="stylesheet" href="/public/styles.css"/><title>Adaptive Workout Coach</title></head><body><main class="container"><header><h1>Adaptive Workout Coach</h1><form method="post" action="/auth/logout"><input type="hidden" name="csrfToken" value="${csrfToken}" /><button type="submit">Logout</button></form></header><section class="grid" id="dashboard"></section><section class="card"><h2>Daily Check-in</h2><form id="checkinForm" enctype="multipart/form-data"><input type="hidden" name="csrfToken" value="${csrfToken}" /><div class="grid2"><label>Date<input name="date" type="date" required /></label><label>Sleep duration (hours)<input name="sleepHours" type="number" step="0.1" required /></label><label>Average HRV<input name="hrv" type="number" step="0.1" required /></label><label>Energy 1-10<input name="energyLevel" type="number" min="1" max="10" required /></label><label>Soreness 1-10<input name="sorenessLevel" type="number" min="1" max="10" required /></label><label>Stress 1-10<input name="stressLevel" type="number" min="1" max="10" required /></label><label>Body weight<input name="bodyWeight" type="number" step="0.1" /></label><label>Worked out yesterday?<select name="workedOutYesterday"><option value="1">Yes</option><option value="0">No</option></select></label><label>Screenshot upload<input type="file" name="screenshot" accept="image/*" /></label></div><label>Notes<textarea name="notes"></textarea></label><label>Extracted data (manual JSON for now)<textarea name="extractedData" placeholder='{"oura_sleep_score":80}'></textarea></label><button type="submit">Save check-in</button></form></section><section class="card"><h2>Log Workout</h2><form id="workoutForm"><input type="hidden" name="csrfToken" value="${csrfToken}" /><div class="grid2"><label>Date<input name="date" type="date" required /></label><label>Workout type<input name="workoutType" placeholder="Upper strength" required /></label></div><label>Exercises (JSON)<textarea name="exercisesJson" placeholder='["Bench Press","Pull-up"]'></textarea></label><label>Sets/Reps/Weight (JSON)<textarea name="setsRepsWeightJson" placeholder='{"Bench Press":"4x6x185"}'></textarea></label><label>Notes<textarea name="notes"></textarea></label><button type="submit">Save workout</button></form></section><section class="card"><h2>Log Cardio</h2><form id="cardioForm"><input type="hidden" name="csrfToken" value="${csrfToken}" /><div class="grid2"><label>Date<input name="date" type="date" required /></label><label>Minutes<input name="minutes" type="number" required /></label><label>Average HR<input name="avgHr" type="number" /></label><label>Zone 2?<select name="zone2"><option value="1">Yes</option><option value="0">No</option></select></label></div><label>Notes<textarea name="notes"></textarea></label><button type="submit">Save cardio</button></form></section><section class="card"><h2>AI Coach Prompt (Template)</h2><pre id="promptBox" class="prompt"></pre></section></main><script src="/public/app.js"></script></body></html>`);
});

app.get('/api/dashboard', requireAuth, (_, res) => {
  const data = getLatestDashboardData();
  res.json({
    todayRecommendedWorkout: data.recommendation,
    sleepHours: data.latestCheckin?.sleep_hours,
    hrv: data.latestCheckin?.hrv,
    recoveryScore: data.recoveryScore,
    lastWorkoutCompleted: data.lastWorkout,
    lastCardioSession: data.lastCardio,
    currentTrainingPhase: data.recommendation.currentTrainingPhase,
    warningFlags: data.recommendation.warningFlags
  });
});

app.get('/api/recommendation/today', requireAuth, (_, res) => {
  const data = getLatestDashboardData();
  db.prepare(`INSERT INTO recommendations (date, summary_assessment, recommendation_json, why_json)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(date) DO UPDATE SET
                summary_assessment=excluded.summary_assessment,
                recommendation_json=excluded.recommendation_json,
                why_json=excluded.why_json`).run(
    new Date().toISOString().slice(0, 10),
    data.recommendation.summaryAssessment,
    JSON.stringify(data.recommendation),
    JSON.stringify(data.recommendation.why)
  );
  res.json(data.recommendation);
});

app.get('/api/ai-prompt/today', requireAuth, (_, res) => {
  const dashboard = getLatestDashboardData();
  const recentHistory = {
    checkins: db.prepare('SELECT * FROM checkins ORDER BY date DESC LIMIT 7').all(),
    workouts: db.prepare('SELECT * FROM workout_logs ORDER BY date DESC LIMIT 10').all(),
    cardio: db.prepare('SELECT * FROM cardio_logs ORDER BY date DESC LIMIT 10').all(),
    recommendations: db.prepare('SELECT * FROM recommendations ORDER BY date DESC LIMIT 5').all()
  };

  const prompt = buildCoachPrompt({
    profile: { phase: dashboard.recommendation.currentTrainingPhase, zone2TargetBpm: '105-125' },
    todayData: {
      checkin: dashboard.latestCheckin,
      recommendationPreview: dashboard.recommendation
    },
    recentHistory
  });

  res.json({ prompt });
});

app.post('/api/checkins', requireAuth, writeLimiter, requireCsrf, upload.single('screenshot'), (req, res) => {
  const { date, sleepHours, hrv, energyLevel, sorenessLevel, stressLevel, bodyWeight, notes, workedOutYesterday, extractedData } = req.body;
  const screenshotPath = req.file ? `/uploads/${req.file.filename}` : null;

  const extractedDataJson = extractedData && extractedData.trim() ? extractedData : null;

  db.prepare(`INSERT INTO checkins (date, sleep_hours, hrv, energy_level, soreness_level, stress_level, body_weight, notes, worked_out_yesterday, screenshot_path, extracted_data_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(date) DO UPDATE SET
                sleep_hours=excluded.sleep_hours,
                hrv=excluded.hrv,
                energy_level=excluded.energy_level,
                soreness_level=excluded.soreness_level,
                stress_level=excluded.stress_level,
                body_weight=excluded.body_weight,
                notes=excluded.notes,
                worked_out_yesterday=excluded.worked_out_yesterday,
                screenshot_path=COALESCE(excluded.screenshot_path, checkins.screenshot_path),
                extracted_data_json=excluded.extracted_data_json`).run(
    date,
    Number(sleepHours),
    Number(hrv),
    Number(energyLevel),
    Number(sorenessLevel),
    Number(stressLevel),
    bodyWeight ? Number(bodyWeight) : null,
    notes || null,
    Number(workedOutYesterday || 0),
    screenshotPath,
    extractedDataJson
  );

  if (req.file) {
    db.prepare('INSERT INTO uploads (date, source, image_path, extracted_data_json) VALUES (?, ?, ?, ?)')
      .run(date, 'manual_upload', screenshotPath, extractedDataJson);
  }

  res.json({ ok: true });
});

app.post('/api/workouts', requireAuth, writeLimiter, requireCsrf, (req, res) => {
  const { date, workoutType, exercisesJson, setsRepsWeightJson, notes } = req.body;
  db.prepare(`INSERT INTO workout_logs (date, workout_type, exercises_json, sets_reps_weight_json, notes)
              VALUES (?, ?, ?, ?, ?)`)
    .run(date, workoutType, exercisesJson || null, setsRepsWeightJson || null, notes || null);
  res.json({ ok: true });
});

app.post('/api/cardio', requireAuth, writeLimiter, requireCsrf, (req, res) => {
  const { date, minutes, avgHr, zone2, notes } = req.body;
  db.prepare('INSERT INTO cardio_logs (date, minutes, avg_hr, zone2, notes) VALUES (?, ?, ?, ?, ?)')
    .run(date, Number(minutes), avgHr ? Number(avgHr) : null, Number(zone2 || 1), notes || null);
  res.json({ ok: true });
});

app.get('/api/history', requireAuth, (_, res) => {
  res.json({
    checkins: db.prepare('SELECT * FROM checkins ORDER BY date DESC').all(),
    workouts: db.prepare('SELECT * FROM workout_logs ORDER BY date DESC').all(),
    cardio: db.prepare('SELECT * FROM cardio_logs ORDER BY date DESC').all(),
    recommendations: db.prepare('SELECT * FROM recommendations ORDER BY date DESC').all(),
    uploads: db.prepare('SELECT * FROM uploads ORDER BY created_at DESC').all()
  });
});

app.listen(PORT, () => {
  console.log(`Adaptive Workout Coach running on http://localhost:${PORT}`);
});
