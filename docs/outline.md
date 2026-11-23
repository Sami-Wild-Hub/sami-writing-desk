# Storyline outline workbench

The authenticated outline view reads `households/<id>/outlineSync/<slug>`; its entry exists when `head` exists. Both tabs share one v7 model and the existing CAS cloud save, local draft, conflict, export/import, and replacement-recovery path.

`plot-data.json` contains:

- `schema_version: "7.0"`, `beats`, `plot_units`, `storyline_groups`, `participants`, `participant_order`.
- Every unit has one `category`: `past`, `current`, or `combined`. Merged source units stay in the document and are excluded from the visible card lists.
- Each storyline has a title, at least one participant, and `time_order: {past:[], current:[], combined:[]}` of visible card IDs. Every visible card appears exactly once.
- Original source nodes, branches, source references, merged units, extension fields and archived provenance are retained. Archived fields do not drive presentation or ordering.

`placements.json` contains `schema_version: "7.0"`, `placements: [{unit_id, beat_id, order}]`, `beat_notes` and any extension fields. Category belongs only to the card. Reveal order is Beat order followed by placement order. Reordering time does not move placements; reordering placements does not change time. A drop into another category moves the card to that time column's end unless the time drop specifies its position.

Each storyline's `lead_participant` selects its section; participant order controls section order and generated names. Past, Current and Combined have equal controls. Mismatch marks compare placed cards of one storyline/category with its time order; the longest shared order is kept, preferring earlier cards on ties. Marks never constrain edits. The library retains the pending/placed/written filters.

Optional `config.json` accepts `defaultStorylineId`; its default is the first storyline. All storylines have equal status.

Source entry points:

- `model.js`, `validation.js`, `ordering.js`: shared browser/worker contracts and edits.
- `controller.js`, `cloud-controller.js`, `sync.ts`, `draft.js`: interactions, local drafts, packed cloud files and CAS conflicts.
- `presentation.js`, `templates.js`, `render-outline.js`, `render-story.js`, `drag.js`: approved sample presentation bound to the live model.
- `sync/outline/migrate-combined.mjs`, `migrate-combined-cli.mjs`: one-time category conversion and guarded cutover. Browser and worker accept only the current category values and three time-order keys.

The workbench remembers where it was left (tab, storyline, Beat, open library groups, status filters, 只看未排 and pane scroll) under `<draft key>:view` in localStorage, per account and book; storylines or Beats that no longer exist fall back to the defaults. `view-state.js` owns this.

Local drafts use the existing account/book key. An incompatible draft stays in localStorage and displays the existing read-error notice; it is not converted or saved to the cloud.

Run `npm run test:unit`, `npm run test:browser` and `npm run test:e2e:real`. Private outline tests load the sibling data checkout at runtime, or `OUTLINE_DATA_REPO`; public CI skips those tests when the private source is absent. They do not embed a substitute book. The real acceptance harness uses temporary git remotes and an RTDB emulator and cleans them on exit. Default viewport is 1440×900 for the storyline UI.
