# Workout

A remote-friendly, fixed seven-minute session. No setup or saved preferences are required.

- Five seconds to get ready, twelve 30-second exercises, and eleven five-second transitions: 420 seconds total.
- Pause for longer breaks at any time. Leaving the browser tab also pauses the session.
- Back or End pauses the timer and asks for confirmation. Cancelling leaves the session paused; select Resume to continue.
- Optional tones mark interval changes, the side-plank side change, and completion.
- Exercise illustrations are bundled locally from the existing `rn-apps/Workout` project. The exercise sequence is adapted from that project, with shorter transitions to fit exactly seven minutes. The TV UI and timer are independent of its mobile implementation.

Use a low, stable step and a secured bench, not an unstable chair. This routine is not individualized medical or fitness advice. Work at a comfortable pace and stop for pain or dizziness.

From the repository root:

```sh
npm run dev --workspace @kiosk/workout
npm test --workspace @kiosk/workout
npm run build --workspace @kiosk/workout
```

Development URL: `http://localhost:5175/apps/workout/`. Use `npm run dev:all` for the kiosk and all apps on the shared origin.