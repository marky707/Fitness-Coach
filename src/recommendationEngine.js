const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const READINESS_THRESHOLDS = {
  low: { sleep: 6, hrv: 25, energy: 4, soreness: 8, stress: 8 },
  high: { sleep: 7, hrv: 30, energy: 7, soreness: 5, stress: 5 }
};

const BASE_WORKOUTS = {
  'Upper strength': {
    focus: 'upper',
    exercises: [
      { name: 'Barbell bench press', sets: 4, reps: '4-6' },
      { name: 'Weighted pull-up', sets: 4, reps: '4-6' },
      { name: 'Overhead press', sets: 3, reps: '5-8' },
      { name: 'Chest-supported row', sets: 3, reps: '6-8' },
      { name: 'Farmer carry', sets: 3, reps: '40m' }
    ],
    cardio: 'Optional 15-20 min easy walk'
  },
  'Lower + Zone 2': {
    focus: 'lower',
    exercises: [
      { name: 'Back squat', sets: 4, reps: '4-6' },
      { name: 'Romanian deadlift', sets: 3, reps: '6-8' },
      { name: 'Walking lunge', sets: 3, reps: '8/leg' },
      { name: 'Leg curl', sets: 3, reps: '8-10' },
      { name: 'Standing calf raise', sets: 3, reps: '10-12' }
    ],
    cardio: 'Zone 2 for 25-35 min at 105-125 bpm'
  },
  'Recovery / Zone 2': {
    focus: 'recovery',
    exercises: [
      { name: 'Mobility flow', sets: 1, reps: '20 min' },
      { name: 'Bodyweight squat', sets: 2, reps: '10-12' },
      { name: 'Band pull-apart', sets: 2, reps: '15-20' },
      { name: 'Dead bug', sets: 2, reps: '8-10/side' }
    ],
    cardio: 'Zone 2 for 30-45 min at 105-125 bpm'
  },
  'Upper hypertrophy': {
    focus: 'upper',
    exercises: [
      { name: 'Incline dumbbell press', sets: 4, reps: '8-12' },
      { name: 'Lat pulldown', sets: 4, reps: '8-12' },
      { name: 'Machine shoulder press', sets: 3, reps: '10-12' },
      { name: 'Cable row', sets: 3, reps: '10-12' },
      { name: 'Cable lateral raise', sets: 3, reps: '12-15' },
      { name: 'Cable curl + triceps pressdown', sets: 3, reps: '12-15' }
    ],
    cardio: 'Optional 15-20 min easy Zone 2'
  },
  'Full body light stimulus': {
    focus: 'full',
    exercises: [
      { name: 'Goblet squat', sets: 3, reps: '8-10' },
      { name: 'Push-up', sets: 3, reps: 'AMRAP-2' },
      { name: 'Single-arm row', sets: 3, reps: '10-12' },
      { name: 'Hip hinge (kettlebell)', sets: 3, reps: '10-12' },
      { name: 'Plank', sets: 3, reps: '30-45s' }
    ],
    cardio: 'Zone 2 for 20-30 min at 105-125 bpm'
  },
  Cardio: {
    focus: 'cardio',
    exercises: [
      { name: 'Breathing and mobility warm-up', sets: 1, reps: '10 min' }
    ],
    cardio: 'Zone 2 for 40-60 min at 105-125 bpm'
  },
  Rest: {
    focus: 'recovery',
    exercises: [
      { name: 'Walk and mobility', sets: 1, reps: '20-30 min' }
    ],
    cardio: 'Optional easy walk'
  }
};

function calculateRecoveryScore(checkin) {
  if (!checkin) return 50;
  const sleep = Math.max(0, Math.min(10, Number(checkin.sleepHours) || 0));
  const hrv = Math.max(0, Math.min(60, Number(checkin.hrv) || 0));
  const energy = Math.max(0, Math.min(10, Number(checkin.energyLevel) || 0));
  const sorenessPenalty = Math.max(0, Math.min(10, Number(checkin.sorenessLevel) || 0));
  const stressPenalty = Math.max(0, Math.min(10, Number(checkin.stressLevel) || 0));

  const raw = sleep * 8 + hrv * 0.9 + energy * 5 - sorenessPenalty * 3 - stressPenalty * 3;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function buildPlanForDay(date, trainingPlanByWeekday) {
  const weekday = date.getDay();
  return trainingPlanByWeekday.get(weekday) || { workoutName: 'Recovery / Zone 2' };
}

function classifyReadiness(checkin) {
  if (!checkin) return 'moderate';
  const low = checkin.sleepHours < READINESS_THRESHOLDS.low.sleep
    || checkin.hrv < READINESS_THRESHOLDS.low.hrv
    || checkin.energyLevel <= READINESS_THRESHOLDS.low.energy
    || checkin.sorenessLevel >= READINESS_THRESHOLDS.low.soreness
    || checkin.stressLevel >= READINESS_THRESHOLDS.low.stress;
  if (low) return 'low';

  const high = checkin.sleepHours >= READINESS_THRESHOLDS.high.sleep
    && checkin.hrv >= READINESS_THRESHOLDS.high.hrv
    && checkin.energyLevel >= READINESS_THRESHOLDS.high.energy
    && checkin.sorenessLevel <= READINESS_THRESHOLDS.high.soreness
    && checkin.stressLevel <= READINESS_THRESHOLDS.high.stress;
  if (high) return 'high';

  return 'moderate';
}

function getAdaptiveRecommendation({ date, checkin, lastWorkout, lastCardio, trainingPlanByWeekday, missedWorkout }) {
  const today = date || new Date();
  const dayName = WEEKDAY_NAMES[today.getDay()];
  const basePlan = buildPlanForDay(today, trainingPlanByWeekday);
  let workoutName = basePlan.workoutName;
  const readiness = classifyReadiness(checkin);
  const recoveryScore = calculateRecoveryScore(checkin);

  if (missedWorkout && !['Recovery / Zone 2', 'Cardio', 'Rest'].includes(workoutName) && readiness !== 'low') {
    workoutName = missedWorkout;
  }

  const lastWorkoutDate = lastWorkout?.date ? new Date(lastWorkout.date) : null;
  const didSamePatternRecently = lastWorkoutDate && BASE_WORKOUTS[lastWorkout.workoutType]?.focus === BASE_WORKOUTS[workoutName]?.focus;
  if (didSamePatternRecently && readiness === 'low') {
    workoutName = 'Recovery / Zone 2';
  }

  if (readiness === 'low') {
    workoutName = ['Cardio', 'Recovery / Zone 2', 'Rest'].includes(workoutName) ? workoutName : 'Recovery / Zone 2';
  }

  const base = BASE_WORKOUTS[workoutName] || BASE_WORKOUTS['Recovery / Zone 2'];

  const multiplier = readiness === 'high' ? 1.1 : readiness === 'low' ? 0.7 : 1;
  const exercises = base.exercises.map((exercise) => ({
    ...exercise,
    sets: Math.max(1, Math.round(exercise.sets * multiplier))
  }));

  const intensityGuidance = readiness === 'high'
    ? 'Push 1-2 top sets to RPE 8-9, final rep quality first, optional small overload.'
    : readiness === 'low'
      ? 'Keep all sets at RPE 6-7, no failure, reduce load by 10-20% and focus on quality movement.'
      : 'Train at RPE 7-8 with controlled reps and leave 1-3 reps in reserve.';

  const avoid = readiness === 'low'
    ? 'Avoid max efforts, failure sets, heavy eccentrics, and high-impact conditioning.'
    : 'Avoid junk volume and failure on every set.';

  const reasons = [
    `Base schedule for ${dayName} is ${basePlan.workoutName}.`,
    `Readiness classified as ${readiness} using sleep, HRV, energy, soreness, and stress.`,
    `Recovery score: ${recoveryScore}/100.`
  ];

  if (missedWorkout) reasons.push(`Detected missed workout pattern and considered carry-over of ${missedWorkout}.`);
  if (lastWorkout) reasons.push(`Last workout logged: ${lastWorkout.workoutType} on ${new Date(lastWorkout.date).toLocaleDateString()}.`);
  if (lastCardio) reasons.push(`Last cardio logged on ${new Date(lastCardio.date).toLocaleDateString()}.`);

  const summaryAssessment = readiness === 'low'
    ? 'Your recovery markers are suppressed today. Prioritize recovery and aerobic base work.'
    : readiness === 'high'
      ? 'Your recovery markers are strong. You can progress with a harder session today.'
      : 'Your recovery markers are workable. Complete the planned session with controlled effort.';

  return {
    dayName,
    recoveryScore,
    currentTrainingPhase: 'Base hypertrophy + fat-loss autoregulation',
    warningFlags: [
      checkin?.sleepHours < 6 ? 'Poor sleep' : null,
      checkin?.hrv < 25 ? 'Low HRV' : null,
      checkin?.sorenessLevel >= 8 ? 'High soreness' : null,
      checkin?.stressLevel >= 8 ? 'High stress' : null
    ].filter(Boolean),
    summaryAssessment,
    recommendedWorkout: workoutName,
    exercises,
    intensityGuidance,
    cardioRecommendation: base.cardio,
    avoid,
    why: reasons
  };
}

module.exports = {
  BASE_WORKOUTS,
  calculateRecoveryScore,
  getAdaptiveRecommendation
};
