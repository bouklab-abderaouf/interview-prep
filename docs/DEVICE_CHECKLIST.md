# Device and browser checklist

Production readiness phase 6. The automated suites run in desktop
Chromium with a fake microphone; real users won't. Audio capture
(AudioWorklet at 16 kHz), echo cancellation, playback scheduling and mic
permissions differ by browser and OS in ways only a real device shows.

**Cost:** each row with a call is one live session (one interview or demo
from the daily limits, and real Gemini Live quota). Do the demo rows first:
they're 2 minutes each.

**How:** for each row, start a session, answer two questions, interrupt
the interviewer once (barge-in), then stop. Mark ✓, ✗ or n/a, and note
anything odd. A ✗ becomes a task in phase 6 of
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Browsers × devices

| Browser / device | Demo (2 min) | Full interview | Notes |
|---|---|---|---|
| Chrome, Windows (speakers) | | | |
| Chrome, Windows (headphones) | | | |
| Edge, Windows | | | |
| Firefox, Windows or macOS | | | Different AudioWorklet and resampling paths |
| Safari, macOS | | | Strict autoplay rules; check the interviewer is heard |
| Safari, iPhone (iOS) | | | The usual suspect: AudioWorklet, echo cancellation, playback after the screen locks |
| Chrome, Android | | | |
| Any, Bluetooth headset | | | Bluetooth mics often drop to 8–16 kHz "call" mode |

## Situations

| Situation | Expected | Result |
|---|---|---|
| Mic permission denied at the prompt | Clear message; **no token requested** (check the Network tab: no `/api/live/token`) | |
| Mic permission revoked mid-session (site settings) | The session ends cleanly with a message; turns so far saved | |
| Default mic switched mid-session (plug in headphones) | Keeps working, or ends cleanly with a message | |
| Tab in the background for 30 seconds mid-session | Audio continues; transcript catches up | |
| Laptop lid closed, then reopened | The session ends cleanly; answers saved as "Needs scoring" | |
| Wi-Fi off for 10 seconds mid-session | "The connection dropped…" message; answers saved | |
| Throttled network (DevTools: Slow 4G) | Usable; the interviewer may lag but no crash | |
| Camera denied, mic allowed | The interview works; the mirror shows its own message | |
| Two tabs, two interviews at once | The second one either works or says the interviewer is busy | |
| Page refreshed mid-interview | Turns flushed on unload; the session shows under Interviews | |
| Back button mid-interview | Same as refresh: nothing lost | |

## Accessibility (quick, by hand)

| Check | Result |
|---|---|
| The whole interview room is usable with the keyboard (Tab, Enter, Space) | |
| A screen reader (NVDA, VoiceOver) announces the AI disclosure before Start | |
| 200% browser zoom: no overlapping controls in the room or on /interviews | |
