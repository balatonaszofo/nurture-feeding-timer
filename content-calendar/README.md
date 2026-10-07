# Content Project Board

Lives at `https://nurtureday.com/content-calendar/` alongside the existing Nurture Day app. GitHub Pages serves the committed bundle; no local server or Tailscale is needed to visit it.

Sign in with the same Google account in both browsers for cloud sync. The Firebase configuration and sign-in persistence are shared with Nurture Day. Board records use a separate document, `users/{uid}/contentBoard/state`; care profile writes cannot overwrite them. Deploy the included Firestore rules before cloud use:

```
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project nurtureday
```

Device-only mode uses its own localStorage key and does not migrate or merge into the cloud. Export that board before switching accounts if you want to retain its projects. Cloud saves use Firestore transactions and expected project versions to reject stale edits. The initial board supports up to 100 projects, retains the latest 100 changes, and rejects writes beyond 800 KB.

Build with `npm run content:build`, test with `npm test`, and preview with `node scripts/preview-content-calendar.mjs`. Source is in `src/`; commit the rebuilt `board.js` whenever it changes.

For conversation access, open this board in Codex's browser and sign in to the same account. Supported browsers receive `list_content_projects`, `list_content_changes`, `create_content_project`, and `update_content_project` page tools, using the same validation and storage as the interface. These tools are available while the page is open. This static host does not provide an always-on MCP server or automatic chat-history synchronization. Ordinary browser interaction remains available when page tools are unsupported.
