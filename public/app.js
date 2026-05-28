async function loadDashboard() {
  const dashboard = await fetch('/api/dashboard').then((r) => r.json());
  const recommendation = await fetch('/api/recommendation/today').then((r) => r.json());
  const prompt = await fetch('/api/ai-prompt/today').then((r) => r.json());

  const warningFlags = dashboard.warningFlags.length
    ? `<p class="warn">Flags: ${dashboard.warningFlags.join(', ')}</p>`
    : '<p>Flags: none</p>';

  const exerciseList = recommendation.exercises
    .map((x) => `<li>${x.name} — ${x.sets} sets x ${x.reps}</li>`)
    .join('');

  document.getElementById('dashboard').innerHTML = `
    <article class="card"><h3>Today's Recommended Workout</h3><p><strong>${recommendation.recommendedWorkout}</strong></p><p>${recommendation.summaryAssessment}</p></article>
    <article class="card"><h3>Readiness</h3><p>Sleep: ${dashboard.sleepHours ?? 'N/A'} h</p><p>HRV: ${dashboard.hrv ?? 'N/A'}</p><p>Recovery score: ${dashboard.recoveryScore}</p><p>Training phase: ${dashboard.currentTrainingPhase}</p>${warningFlags}</article>
    <article class="card"><h3>Workout Prescription</h3><ul>${exerciseList}</ul><p><strong>Intensity:</strong> ${recommendation.intensityGuidance}</p><p><strong>Cardio:</strong> ${recommendation.cardioRecommendation}</p><p><strong>Avoid:</strong> ${recommendation.avoid}</p></article>
    <article class="card"><h3>Recent Activity</h3><p>Last workout: ${dashboard.lastWorkoutCompleted ? `${dashboard.lastWorkoutCompleted.workout_type} (${dashboard.lastWorkoutCompleted.date})` : 'None'}</p><p>Last cardio: ${dashboard.lastCardioSession ? `${dashboard.lastCardioSession.minutes} min (${dashboard.lastCardioSession.date})` : 'None'}</p><p><strong>Why:</strong></p><ul>${recommendation.why.map((reason) => `<li>${reason}</li>`).join('')}</ul></article>
  `;

  document.getElementById('promptBox').textContent = prompt.prompt;
}

function wireForm(formId, endpoint) {
  const form = document.getElementById(formId);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    if (!res.ok) {
      alert('Request failed');
      return;
    }
    alert('Saved');
    form.reset();
    await loadDashboard();
  });
}

async function wireJsonForm(formId, endpoint) {
  const form = document.getElementById(formId);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      alert('Request failed');
      return;
    }
    alert('Saved');
    form.reset();
    await loadDashboard();
  });
}

wireForm('checkinForm', '/api/checkins');
wireJsonForm('workoutForm', '/api/workouts');
wireJsonForm('cardioForm', '/api/cardio');

loadDashboard();
