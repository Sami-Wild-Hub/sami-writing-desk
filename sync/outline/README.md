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

## v7 cutover

The watcher imports the same v7 validator as the browser. The RTDB envelope and
Firebase rules are unchanged; only the two compressed documents change.

Resolve pending repo conflicts, then prepare from the latest live v6 documents
using the approved private merge/lead Markdown:

```powershell
node sync/outline/migrate-v7-cli.mjs prepare --config <watcher-config> --spec <04-final.md> --data <data-checkout>
```

`prepare` reads the latest live copy, writes only the selected data checkout, and
reads it back to validate card/placement counts. It merges the approved groups,
moves the specified card, and assigns each line one `lead_participant`. Merged
lines and the moved card's destination use XMind time order within each category;
other lines retain their live time order. Beat reveal order and card content/category
are preserved. Unsourced editorial cards use their original sequence for anchoring;
new cards without that provenance use their existing time position.

For the final cutover, have the router stop the scheduled watcher and ensure
pending edits are reconciled. Prepare again if live changed. Publish those files
and the v7 site/worker together. After the old watcher lease
expires, run the same command with `install` in place of `prepare`. It refuses
uncommitted data, checks that published data exactly equals the conversion of
current live, and uses CAS to prevent overwriting an intervening edit. It also
converts starter/kept snapshots. If live changed, prepare and publish again.
Then update the dedicated watcher clone, have the router restart the scheduled
task, verify one successful round, and dispatch the data repository's Outline sync
workflow. Preparation alone does not change RTDB or the scheduled task.

The page's “立即同步” button dispatches `outline-sync.yml` on data `main` through
the GitHub REST API. Its first use requests a fine-grained token with Actions write
permission on `Sami-Wild-Hub/sami-writing-desk-data`; it is stored only in this
browser's localStorage. Invalid/insufficient authorization clears it and asks again.
“查看同步结果” opens the workflow page. API success means dispatch accepted, not
that the workflow has finished. See [GitHub's dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
