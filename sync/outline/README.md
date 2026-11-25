# Outline sync

Run the watcher with Node 24 after copying `config.example.json` to the ignored
`config.json` and filling in the local service-account path, RTDB URL, household,
and bare data-repository path:

```powershell
node sync/outline/sync.mjs once
node sync/outline/sync.mjs watch
node sync/outline/sync.mjs preview --novel maritime-story --out C:/private/outline-preview.json
```

`once --action` is the GitHub Actions mode. It only performs reconciliation when
the watcher lease is free. The script writes no credentials to this repository;
Git uses the machine's existing credentials and RTDB uses the configured key path.
`preview` writes the outline payload used by private screenshot tests without
reading RTDB. The installer writes `sync.log` beside the script; a manually
created config without `log` reports errors to stderr.

## Foreshadow table

`outline/<slug>/foreshadow.json` is an optional third document in the same book
revision as `plot-data.json` and `placements.json`. Its schema-1 columns define
the table headers/order; author cells, newlines, source metadata and derived link
metadata survive saves. Rows use the existing `(sheet, source_row)` identity;
new rows get the next source row. The data file needs no schema change.
The browser validates this document with the same validator as the worker.
No table is created for a book without the file. File-level merges, conflicts,
`Outline-Sync` trailers, the coordinator lease and RTDB CAS cover all three files.
The RTDB adapter and watcher need no separate storage or scheduling path.

The 伏笔表 tab follows 大纲. Cells are edited in place like a spreadsheet and save
on leaving the cell (or after a short pause); 是否已收 is a dropdown with 未收 / 已收 /
部分回收 / 不需要. Rows are archived with 不需要 instead of deleted. The quote in
伏笔／线索内容 links to its 埋设章节 paragraph, and each `Cn` in 实际回收章节 links in
place; `derived.recovery_chapters` is recomputed from that cell when it is edited.
回收方式／揭示内容 stays in the file but is not shown. Shortcuts: Enter / Shift+Enter
move down / up, Alt+Enter inserts a line break, Alt+0–3 set the status, Alt+S opens it,
Ctrl/⌘+Enter adds a row below. Source-row numbers are internal; the author’s 伏笔ID
cell is freely editable and new rows continue numeric IDs. Phones show each row as a
card. The default view hides 已收 and 不需要 rows, and filter selection is stored
locally per account and book.

Private visual verification uses `tests/foreshadow.spec.ts` with
`FORESHADOW_SHOTS_DIR`, `FORESHADOW_DATA_REPO` and `FORESHADOW_SOURCE_ROOT`
(the novel directory containing `compiled/source/C*.md`). It builds the local
Firebase stub, loads private data only in memory, captures desktop/phone at scale
2 and checks three planting destinations and one recovery chapter per viewport.
Use `GITHUB_ACTIONS=true GITHUB_REPOSITORY=Sami-Wild-Hub/sami-writing-desk`
to exercise the production `/sami-writing-desk/` base path. Never commit private
fixtures or screenshots to the public website repository.

`node tests/foreshadow-emulator.mjs` checks the new path using FamilyHub
`origin/main` rules, disposable local Git/RTDB/browser services and the
production base path. It checks browser → Git → browser and kept-version
replacement. It requires the local sibling data and FamilyHub CLI checkouts
already used by `npm run test:e2e:real`. It cleans up its temporary services/data
and does not deploy rules or read real credentials.

Code-size exception: the existing `reconcileOnce` function in `reconcile.mjs`
exceeds 80 lines because it retains the single ordered reconciliation decision
flow; this change adds the third document through shared document operations.

## Combined category cutover

The watcher imports the same v7 validator as the browser. The RTDB envelope and
Firebase rules are unchanged; only the two compressed documents change.

Resolve pending repo conflicts, then prepare from the latest live v7 documents:

```powershell
node sync/outline/migrate-combined-cli.mjs prepare --config <watcher-config> --data <data-checkout>
```

`prepare` reads the latest live copy, writes only the selected data checkout, and
reads it back to validate all/visible cards, placements, lines, category counts and
mismatch marks. It renames the third category and each line's corresponding
`time_order` key to `combined`. Card content, merged originals, ordering, placements,
provenance and extension fields are preserved; schema versions remain `7.0`.

For the final cutover, have the router stop the scheduled watcher and ensure
pending edits are reconciled. Prepare again if live changed. Publish those files
and the updated site/worker together; wait for the Pages deployment. After the old watcher lease
expires, run the same command with `install` in place of `prepare`. It refuses
uncommitted data, holds the coordinator lease, checks that published data exactly
equals the conversion of current live, and uses CAS to prevent overwriting an
intervening edit. It also converts starter/kept snapshots and reads back data main
and RTDB counts. If live changed, prepare and publish again.
Then update the dedicated watcher clone, have the router restart the scheduled
task, verify one successful round, and dispatch the data repository's Outline sync
workflow. Preparation alone does not change RTDB or the scheduled task.

Browser and worker accept only `past`, `current`, `combined` and the corresponding
three time-order keys. Existing incompatible browser drafts remain stored under
their current account/book key and show the existing draft read-error notice.

The page's “立即同步” button dispatches `outline-sync.yml` on data `main` through
the GitHub REST API. Its first use requests a fine-grained token with Actions write
permission on `Sami-Wild-Hub/sami-writing-desk-data`; it is stored only in this
browser's localStorage. Invalid/insufficient authorization clears it and asks again.
“查看同步结果” opens the workflow page. API success means dispatch accepted, not
that the workflow has finished. See [GitHub's dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
