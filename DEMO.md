# Demo video (limit 3:00)

The video is one take of the page's narrated tour. Open the hosted demo with `?tour=1` and press **Start tour**:

https://cast-the-party.onrender.com/?tour=1

The tour drives the real page in that browser. The words it speaks and the order of the screens live in [`public/tour.js`](public/tour.js); this file only says how to record it.

## What the tour does

1. Title card, the problem, the six characters and their YouCam layers.
2. **One live render**: the Night Editor on demo face A (hairstyle, hair colour, makeup, earrings, hat = 6 units), narrated while the five YouCam tasks run (about 50 seconds).
3. The costume tag: the before/after divider moves, then the change maps, the punch card, the hair-shade check, the shopping list and the hat portrait.
4. The Supper-Club Singer's example tag (no units): platinum on dark hair came out olive.
5. End card with the APIs used, the demo URL and the repository.

If a live render is not possible (no renders left for the visitor, the daily cap reached, or YouCam refuses the task), the tour opens the Night Editor's example tag and says so. The narration is the browser's built-in speech voice. In tour mode the store names on the shopping links are hidden, so no third-party marks appear in the video.

## Before recording

- Open the demo URL a minute early: the free server sleeps after 15 minutes without visitors.
- Check the budget line at the top: at least 1 live render left for you and 6 units left today.
- Record the page area only (no tabs, address bar or bookmarks), with system audio on and the microphone off.
- The tab title changes to "Tour finished: stop recording" when the last line has been spoken.
