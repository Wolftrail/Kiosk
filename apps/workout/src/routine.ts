export const exercises = [
  { id: 'jumping_jacks', name: 'Jumping jacks', cue: 'Land softly, reach overhead, and keep a steady pace.', easier: 'Step one foot out at a time.' },
  { id: 'wall_sit', name: 'Wall sit', cue: 'Back against the wall. Keep your knees above your ankles.', easier: 'Stay higher on the wall.' },
  { id: 'push_ups', name: 'Push-ups', cue: 'Keep your body straight. Lower with control, then press up.', easier: 'Use your knees or a wall.' },
  { id: 'crunches', name: 'Crunches', cue: 'Lift your shoulders gently. Keep your neck relaxed.', easier: 'Use a smaller movement.' },
  { id: 'step_ups', name: 'Step-ups', cue: 'Use a low, stable step. Alternate your leading foot.', easier: 'March in place instead.' },
  { id: 'squats', name: 'Squats', cue: 'Sit your hips back. Keep your heels down and chest lifted.', easier: 'Lower only as far as comfortable.' },
  { id: 'tricep_dips', name: 'Triceps dips', cue: 'Use a secured bench. Bend your elbows gently, then press up.', easier: 'Keep your knees bent and the movement small.' },
  { id: 'plank', name: 'Plank', cue: 'Elbows under shoulders. Keep your hips level and breathe.', easier: 'Rest your knees on the floor.' },
  { id: 'high_knees', name: 'High knees', cue: 'Run in place, lifting your knees. Land softly.', easier: 'March with controlled knee lifts.' },
  { id: 'lunges', name: 'Lunges', cue: 'Step back and lower gently. Alternate legs.', easier: 'Hold a wall for balance.' },
  { id: 'push_up_rotation', name: 'Push-up & rotation', cue: 'Do a push-up, then open one arm toward the ceiling. Alternate.', easier: 'Use your knees and make the rotation small.' },
  { id: 'side_plank', name: 'Side plank', cue: 'Elbow under shoulder. Lift your hips; change sides halfway.', easier: 'Keep your lower knee on the floor.' },
] as const

export const PREP_SECONDS = 5
export const EXERCISE_SECONDS = 30
export const REST_SECONDS = 5
export const TOTAL_SECONDS = PREP_SECONDS + exercises.length * EXERCISE_SECONDS + (exercises.length - 1) * REST_SECONDS

export type WorkoutStage = {
  kind: 'ready' | 'exercise' | 'rest' | 'complete'
  exerciseIndex: number
  remaining: number
  duration: number
  switchSide: boolean
}

export function getStage(elapsedSeconds: number): WorkoutStage {
  let elapsed = Math.max(0, elapsedSeconds)
  if (elapsed >= TOTAL_SECONDS) {
    return { kind: 'complete', exerciseIndex: exercises.length - 1, remaining: 0, duration: 0, switchSide: false }
  }
  if (elapsed < PREP_SECONDS) {
    return { kind: 'ready', exerciseIndex: 0, remaining: Math.ceil(PREP_SECONDS - elapsed), duration: PREP_SECONDS, switchSide: false }
  }
  elapsed -= PREP_SECONDS
  for (let exerciseIndex = 0; exerciseIndex < exercises.length; exerciseIndex += 1) {
    if (elapsed < EXERCISE_SECONDS) {
      return {
        kind: 'exercise', exerciseIndex, remaining: Math.ceil(EXERCISE_SECONDS - elapsed),
        duration: EXERCISE_SECONDS, switchSide: exerciseIndex === exercises.length - 1 && elapsed >= 15,
      }
    }
    elapsed -= EXERCISE_SECONDS
    if (exerciseIndex < exercises.length - 1 && elapsed < REST_SECONDS) {
      return { kind: 'rest', exerciseIndex: exerciseIndex + 1, remaining: Math.ceil(REST_SECONDS - elapsed), duration: REST_SECONDS, switchSide: false }
    }
    elapsed -= REST_SECONDS
  }
  throw new Error('Workout timeline could not be resolved')
}

export function getNextExerciseElapsed(elapsedSeconds: number) {
  const stage = getStage(elapsedSeconds)
  if (stage.kind === 'complete') return TOTAL_SECONDS
  if (stage.kind === 'ready' || stage.kind === 'rest') {
    return PREP_SECONDS + stage.exerciseIndex * (EXERCISE_SECONDS + REST_SECONDS)
  }
  return Math.min(TOTAL_SECONDS, PREP_SECONDS + stage.exerciseIndex * (EXERCISE_SECONDS + REST_SECONDS) + EXERCISE_SECONDS)
}

export function formatTime(seconds: number) {
  const rounded = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}