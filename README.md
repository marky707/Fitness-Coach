# Adaptive Workout Coach

Adaptive Workout Coach is a web-based MVP for autoregulated training.

It tracks sleep, HRV, fatigue, workouts, cardio, and missed sessions, then generates a daily workout recommendation using an Upper/Lower/Recovery/Cardio framework.

## Tech stack
- Node.js + Express
- SQLite (`better-sqlite3`)
- Basic local auth (session-based)
- Plain responsive frontend (HTML/CSS/JS)

## Features
- Dashboard with today's adaptive recommendation
- Daily check-in form (sleep, HRV, energy, soreness, stress, body weight, notes)
- Screenshot upload for workout/cardio logs (stored now, OCR-ready architecture)
- Workout and cardio logging
- Recommendation engine with autoregulation rules
- AI coach prompt template endpoint for ChatGPT-style coaching behavior
- Seeded weekly plan:
  - Monday: Upper strength
  - Tuesday: Lower + Zone 2
  - Wednesday: Recovery / Zone 2
  - Thursday: Upper hypertrophy
  - Friday: Full body light stimulus
  - Saturday: Cardio
  - Sunday: Rest

## Autoregulation rules implemented
- Sleep < 6h or HRV < 25 -> reduce intensity/volume or switch to recovery
- Sleep >= 7h + solid HRV -> allow harder session
- Handles missed workouts by carrying over intelligently when appropriate
- Uses recent workout/cardio history to avoid overtraining patterns
- Zone 2 target range: **105-125 bpm**

## Run locally
```bash
npm install
npm start
```

Open: `http://localhost:3000`

Default login:
- Username: `coach`
- Password: `coach123`

You can override with env vars:
- `APP_USERNAME`
- `APP_PASSWORD`
- `SESSION_SECRET`

## API highlights
- `GET /api/dashboard`
- `GET /api/recommendation/today`
- `POST /api/checkins` (multipart form + screenshot)
- `POST /api/workouts`
- `POST /api/cardio`
- `GET /api/history`
- `GET /api/ai-prompt/today`

## Tests
```bash
npm test
```
