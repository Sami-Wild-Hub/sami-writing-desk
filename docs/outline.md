# Outline workbench

The authenticated `outline` view reads `books/<slug>/outline` once through the archive store. A book's private manifest sets `hasOutline`; books without it have no outline entry. The client never writes outline data to Firebase.

The private exporter wraps the original `plot-data.json` and `placements.json` without changing their fields. Its envelope adds `revision` and `config: {spineGroupId, spineTitle}`. Display names come from that private configuration and the source groups. Source archives and unknown provenance fields survive workspace edits and exports.

Local drafts are isolated by project, household, signed-in user and book. They retain their base revision. When the repository snapshot changes, the local draft stays active and a notice offers backup and explicit restore. Exported workspace, plot data and plan files use the original v5 format, including the legacy workspace format identifier and filename.

Presentation files for visual redesign:

- `src/styles/outline.css`: all outline styles.
- `src/lib/views/outline/frame.ts`: frame markup.
- `src/lib/views/outline/templates.js`: cards, lanes, navigation, pools and statistics.
- `src/lib/views/outline/forms.js`: inline editors and composers.

Keep the existing IDs and `data-*` hooks, semantic controls, and phone `.side` drawer. `controller.js` owns interactions, `model.js` owns state and operations, `draft.js` owns local persistence, and `schema.ts` validates the private envelope.

Tests use fictional data in `tests/outline-fixture.mjs`. `outline-scenario.mjs` replays the same visible controls against the original and new workbenches. Model, interactions, persistence and archive lifecycle have separate test files. Private parity tests are opt-in and compare every Beat and time layer, the complete initial workspace, and both directions of all three interchange formats.

To reproduce private screenshots, first run in the private novel checkout:

```powershell
python site/outline_preview.py --novel <slug> --out <private-folder>/outline-preview.json
```

Then run in this checkout, with inputs and outputs in a system temporary directory or CodexTasks:

```powershell
$env:GITHUB_ACTIONS='true'
$env:GITHUB_REPOSITORY='Sami-Wild-Hub/sami-writing-desk'
$env:NOVEL_STUB_DB='<private-folder>/outline-preview.json'
$env:NOVEL_OUTLINE_ORIGINAL='<private-novel-folder>/outline/view.html'
$env:NOVEL_OUTLINE_SHOTS_DIR='<private-folder>/outline-shots'
npm.cmd run test:browser -- tests/outline-private.spec.ts
```

This produces paired full-page and viewport screenshots under `original/` and `build/` at 390, 1280 and 2560 pixels. The original is opened in an offline browser context. Private content stays in runtime test inputs and those screenshot directories.

For an independent offline original-control replay:

```powershell
node scripts/outline-original.mjs <original-view.html> <private-shots-directory>
```
