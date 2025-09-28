# Astro Sonar Demo (Vite + React)

## Quick start
1. Ensure Node 18+ is installed.
2. Install deps:
   ```bash
   npm i
   ```
3. Replace `src/AstroSonar.jsx` with the full component code you have in the ChatGPT canvas.
4. Run the dev server:
   ```bash
   npm run dev
   ```
5. Open the printed URL (default http://localhost:5173), click **Play** to unlock audio.

## Notes
- This project pins `tone@^15.1.22`. If you upgrade, keep an eye on breaking changes.
- WebAudio requires a user gesture; the Play button calls `Tone.start()` for you.
