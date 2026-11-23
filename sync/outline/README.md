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
