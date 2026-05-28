const test = require('node:test');
const assert = require('node:assert/strict');
const { getAdaptiveRecommendation } = require('../src/recommendationEngine');

function basePlanMap() {
  return new Map([
    [1, { workoutName: 'Upper strength' }],
    [2, { workoutName: 'Lower + Zone 2' }],
    [3, { workoutName: 'Recovery / Zone 2' }],
    [4, { workoutName: 'Upper hypertrophy' }],
    [5, { workoutName: 'Full body light stimulus' }],
    [6, { workoutName: 'Cardio' }],
    [0, { workoutName: 'Rest' }]
  ]);
}

test('switches to recovery when readiness is low', () => {
  const rec = getAdaptiveRecommendation({
    date: new Date('2026-05-25'),
    checkin: { sleepHours: 5.4, hrv: 22, energyLevel: 4, sorenessLevel: 8, stressLevel: 8 },
    trainingPlanByWeekday: basePlanMap()
  });

  assert.equal(rec.recommendedWorkout, 'Recovery / Zone 2');
  assert.ok(rec.warningFlags.includes('Poor sleep'));
  assert.ok(rec.warningFlags.includes('Low HRV'));
});

test('keeps planned workout and allows harder guidance when readiness is high', () => {
  const rec = getAdaptiveRecommendation({
    date: new Date('2026-05-26'),
    checkin: { sleepHours: 7.8, hrv: 36, energyLevel: 8, sorenessLevel: 3, stressLevel: 3 },
    trainingPlanByWeekday: basePlanMap()
  });

  assert.equal(rec.recommendedWorkout, 'Lower + Zone 2');
  assert.match(rec.intensityGuidance, /RPE 8-9/);
});
