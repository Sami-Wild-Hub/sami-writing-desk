# Outline workbench

The authenticated `outline` view reads and writes `households/<id>/outlineSync/<slug>`. The tab and book-shelf entry exist only when `outlineSync/<slug>/head` exists; `novelArchive` is never used for outline data and the client does not read its legacy `hasOutline` flag.

The sync worker stores the original `plot-data.json` and `placements.json` text gzip-packed in RTDB. The web payload derives `config: {spineGroupId, spineTitle}` from `head.config` and the plot data. Source archives and unknown provenance fields survive workspace edits and exports.

Local drafts are isolated by project, household, signed-in user and book. They retain the live revision used for the next CAS write. Drafts written by 5b65c3e (`revision` plus `workspace`) are accepted: the first page load compares both the draft and cloud files with the immutable starter by content, imports the draft when cloud is unchanged, or presents the cloud-version choices without discarding the local copy. Exported workspace, plot data and plan files use the original v5 format, including the legacy workspace format identifier and filename.

Presentation files for visual redesign:

- `src/styles/outline.css`: all outline styles.
- `src/lib/views/outline/frame.ts`: frame markup.
- `src/lib/views/outline/templates.js`: cards, lanes, navigation, pools and statistics.
- `src/lib/views/outline/forms.js`: inline editors and composers.

Keep the existing IDs and `data-*` hooks, semantic controls, and phone `.side` drawer. `sync.ts` owns the RTDB subscription, packed-file writes, CAS conflict actions and decode boundary; `controller.js` owns interactions, remote-state decisions and local persistence; `model.js` owns state and operations; `draft.js` owns local persistence; and `schema.ts` types the shared payload.

The existing offline replay uses `tests/outline-fixture.mjs`; sync acceptance uses the `maritime-story` files from the sibling data repository at runtime and never copies them into this site. `outline-scenario.mjs` replays the same visible controls against the original and new workbenches. Model, sync, interactions, persistence and archive lifecycle have separate test files. Private parity tests are opt-in and compare every Beat and time layer, the complete initial workspace, and both directions of all three interchange formats.

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
