# Scrape Canvas — Fabric.js Whiteboard

Scrape Canvas is a lightweight, fast, and modern whiteboard built with React, Vite, and Fabric.js. It offers an Excalidraw‑like editing experience (pan, zoom, shapes, text, pen) with persistence via Firebase Firestore.

## Features

- **Editor UX**
  - Select, Hand (pan), Rectangle, Circle, Text, Pen.
  - Zoom in/out/reset (centered), sticky in‑canvas toolbar.
  - Undo/Redo (snapshot history, up to 50 steps).
  - Snap‑to‑grid during move (toggle).
- **Import/Export**
  - Export PNG (2x) and SVG.
  - Import JSON (reloads previous canvas state).
- **Persistence**
  - Save/Load canvas JSON to Firestore per `canvasId` route.
- **Responsive layout**
  - Full‑page white canvas, vertical scrolling, horizontal scroll only when content requires it.

## Tech Stack

- React 19 + Vite 7
- Fabric.js 6
- React Router DOM 7
- Firebase (Firestore)

## Getting Started

1) Install dependencies

```
npm install
```

2) Configure Firebase

Create a `.env.local` in the project root with your Firebase web app config (Vite uses the `VITE_` prefix):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=
```

3) Run the app

```
npm run dev
```

Open the printed local URL. Create a new canvas on the landing page and start drawing.

## Scripts

- `npm run dev` — start Vite dev server
- `npm run build` — production build
- `npm run preview` — preview the build locally

## Project Structure

```
canvas-editor/
├─ public/
├─ src/
│  ├─ lib/
│  │  └─ firebase.js           # Firebase app + Firestore
│  ├─ pages/
│  │  ├─ Home.jsx              # Landing page + CTA
│  │  └─ CanvasEditor.jsx      # Fabric.js editor
│  ├─ App.jsx                  # Router and layout
│  ├─ index.css                # Global styles
│  └─ main.jsx                 # App bootstrap
├─ index.html
├─ package.json
└─ vite.config.js
```

## Keyboard & Tips

- **Delete/Backspace** — delete selected object
- **Hand tool** — pan by dragging the canvas
- **Zoom** — use the toolbar controls (centered zoom)
- **Apply to selection** — change fill/stroke, then apply
- **Snap** — toggle on to align elements while moving

## Firestore Notes

- The app saves a sanitized JSON representation of the Fabric canvas to `canvases/{canvasId}`.
- If you see security errors, review your Firestore rules or ensure you are logged in if your rules require auth.

Example permissive development rule (not for production):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## Troubleshooting

- "Unsupported field value: undefined" on save
  - Fixed by sanitizing the Fabric JSON before `setDoc`. Make sure you’re on the latest code.
- Unwanted horizontal scrollbar
  - Canvas width clamps to viewport and only expands when content requires it. A hard refresh may help after updates.
- Toolbar looks off on dark mode
  - The editor keeps a white toolbar intentionally for contrast. Text and inputs are forced dark for readability.

## Roadmap Ideas

- Group/ungroup, duplicate, send to back/front
- Shape styles and color palettes
- Collaboration and presence
