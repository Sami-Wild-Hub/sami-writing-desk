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

Router rollout (do not run against production during development):

The published FamilyHub rules currently reject both `live/foreshadow` and
`kept/foreshadow` through `$other`. **Deployment is blocked until the router
applies and deploys the reviewable RFC 6902 patch in
`foreshadow-rules.patch.json` to FamilyHub's `database.rules.json`.** It permits
an optional packed string with the existing size limit and requires kept
foreshadow content to equal the replaced live content. Membership, revision CAS
and all other write rules stay the same. This task does not modify FamilyHub.

1. Apply/test/deploy the FamilyHub rules patch first. Reconcile pending edits
   with the existing worker, stop its scheduled task and
   let its lease expire. Merge/deploy the website/worker branch first and wait
   for Pages, then merge the `foreshadow-import` data branch into data `main`.
2. Update the dedicated watcher clone to the new website `main`, keeping its
   existing private config/service account and bare data clone. Run the existing
   `node sync/outline/sync.mjs once --config <watcher-config>` path. A newly added
   optional file is installed by normal reconciliation under the lease/CAS;
   no format migration or separate installer is needed. If pending live edits
   touch another file they merge; resolve any reported same-file conflict first.
3. Read back the foreshadow table/count and the synchronized revision in the
   website, restart the existing scheduled task, verify a successful round and
   dispatch the data repository's existing Outline sync workflow. Do not create
   a second task. Existing starter snapshots remain the original book snapshot.

The 伏笔表 tab follows 大纲. It supports status/chapter filters, row editing,
addition/deletion, scoped local drafts, and the existing repository/cloud conflict
choices. Editing quotes or chapter cells never rematches links: edit 埋设链接
(`C1#P2-P3`) and 回收章节链接 (`C2, C3`) explicitly. Source-row numbers are internal;
the author’s 伏笔ID cell is freely editable. Tables scroll horizontally on phones.

Private visual verification uses `tests/foreshadow.spec.ts` with
`FORESHADOW_SHOTS_DIR`, `FORESHADOW_DATA_REPO` and `FORESHADOW_SOURCE_ROOT`
(the novel directory containing `compiled/source/C*.md`). It builds the local
Firebase stub, loads private data only in memory, captures desktop/phone at scale
2 and checks three planting destinations and one recovery chapter per viewport.
Use `GITHUB_ACTIONS=true GITHUB_REPOSITORY=Sami-Wild-Hub/sami-writing-desk`
to exercise the production `/sami-writing-desk/` base path. Never commit private
fixtures or screenshots to the public website repository.

`node tests/foreshadow-emulator.mjs` checks the new path using disposable local
Git/RTDB/browser services and the production base path. It first proves the
published rules reject a save while retaining its draft, then installs the
proposed rules **only in that emulator** and checks browser → Git → browser and
kept-version replacement. It requires the local sibling data and FamilyHub CLI
checkouts already used by `npm run test:e2e:real`. It cleans up its temporary
services/data and does not deploy rules or read real credentials.

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
