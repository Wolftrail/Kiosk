import assert from 'node:assert/strict'
import test from 'node:test'
import { exercises, formatTime, getNextExerciseElapsed, getStage, TOTAL_SECONDS } from '../src/routine.ts'

test('routine lasts exactly seven minutes with twelve exercise intervals', () => {
  assert.equal(TOTAL_SECONDS, 420)
  const counts = { ready: 0, exercise: 0, rest: 0 }
  for (let elapsed = 0; elapsed < TOTAL_SECONDS; elapsed += 1) {
    const stage = getStage(elapsed)
    assert.notEqual(stage.kind, 'complete')
    counts[stage.kind as keyof typeof counts] += 1
    assert.ok(stage.remaining > 0 && stage.remaining <= stage.duration)
    assert.ok(stage.exerciseIndex >= 0 && stage.exerciseIndex < exercises.length)
  }
  assert.deepEqual(counts, { ready: 5, exercise: 360, rest: 55 })
})

test('stage boundaries select the upcoming exercise during rest', () => {
  assert.equal(getStage(0).kind, 'ready')
  assert.equal(getStage(4.9).remaining, 1)
  assert.equal(getStage(5).kind, 'exercise')
  assert.equal(getStage(34.9).remaining, 1)
  assert.equal(getStage(35).kind, 'rest')
  assert.equal(getStage(35).exerciseIndex, 1)
  assert.equal(getStage(40).kind, 'exercise')
  assert.equal(getStage(40).exerciseIndex, 1)
  assert.equal(getStage(390).exerciseIndex, 11)
  assert.equal(getStage(404.9).switchSide, false)
  assert.equal(getStage(405).switchSide, true)
  assert.equal(getStage(420).kind, 'complete')
  assert.equal(getStage(1000).kind, 'complete')
  assert.equal(getStage(-1).remaining, 5)
})

test('next exercise starts the previewed move or advances with a transition', () => {
  assert.equal(getNextExerciseElapsed(0), 5)
  assert.equal(getNextExerciseElapsed(12), 35)
  assert.equal(getNextExerciseElapsed(35), 40)
  assert.equal(getNextExerciseElapsed(72), 75)
  assert.equal(getNextExerciseElapsed(400), TOTAL_SECONDS)
  assert.equal(getNextExerciseElapsed(TOTAL_SECONDS), TOTAL_SECONDS)
  for (let elapsed = 0; elapsed < TOTAL_SECONDS; elapsed += 1) {
    assert.ok(getNextExerciseElapsed(elapsed) > elapsed)
    assert.ok(getNextExerciseElapsed(elapsed) <= TOTAL_SECONDS)
  }
})

test('remaining time rounds up and never displays negative values', () => {
  assert.equal(formatTime(420), '7:00')
  assert.equal(formatTime(60.1), '1:01')
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(-1), '0:00')
})