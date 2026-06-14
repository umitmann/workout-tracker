# Scenario: Rest timer between sets

## Intent
After completing a set, a user needs to rest before the next one — but today the app gives no indication of how long they have been resting. A user who wants to keep rest consistent across sessions (e.g., always 90 seconds between sets) or who wants to rest "until ready" and then know how long that took has no tool for this. Rest duration is training data: shorter rests increase metabolic stress; longer rests support strength recovery. The logger should offer a rest timer that starts after each set, supports both a fixed countdown and an open-ended (variable) mode, and gets out of the way when the user is ready to continue.

## Contract
- given: a set has just been added to a workout in progress
- when: the set is confirmed (the "Add" button is tapped)
- then: a rest timer becomes available — either auto-starts or is one tap away, depending on the user's rest mode setting
- given: the user has selected "fixed rest" mode (e.g., 90 seconds)
- when: the timer is active
- then: a countdown from the configured duration is shown; when it reaches zero an alert or vibration fires
- given: the user has selected "variable rest" mode
- when: the timer is active
- then: an elapsed-time counter runs upwards (stopwatch); the user taps a "Done resting" control to stop it
- when: the timer is dismissed (either by the user or on countdown completion + acknowledgement)
- then: the elapsed rest time is logged alongside the preceding set (visible in the completed workout summary and history)
- invariant: the timer does not block set entry — the user can add the next set at any moment regardless of timer state
- invariant: if the user adds the next set while the timer is still running, the timer stops and the actual elapsed time is recorded
- invariant: the rest timer does not appear on completed (read-only) workouts
- invariant: the rest duration recorded is always the actual elapsed time, not the configured target — if the user configured 90 s but added the next set at 60 s, 60 s is recorded

## Steps
1. Start an in-progress workout, add an exercise and add one set
2. A rest timer appears (or a "Start rest" button appears) — tap to start if not auto-started
3. **Fixed rest path:** configure timer to 90 seconds; observe countdown; let it reach zero; acknowledge alert; rest duration (90 s) is recorded on the preceding set
4. Add the next set — verify timer is dismissed and does not auto-restart until the new set is added
5. **Variable rest path:** switch rest mode to "variable"; add a set; tap "Start rest"; stopwatch counts up; tap "Done resting" at ~45 s; 45 s is recorded on the set
6. Add another set while the timer is at 30 s (without tapping "Done resting") — timer stops; 30 s is recorded as actual elapsed rest
7. Complete workout — completed summary shows rest duration alongside each set row
8. Open exercise history — rest durations are visible per session entry
