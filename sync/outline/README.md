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

## v6 cutover

The watcher imports the same v6 validator as the browser. The RTDB envelope and
Firebase rules are unchanged; only the two compressed documents change.

Stop the scheduled watcher before preparing the final cutover. Resolve pending
repo conflicts, then use the approved private sample as the prefill input:

```powershell
node sync/outline/migrate-v6-cli.mjs prepare --config <watcher-config> --sample <approved-sample.html> --data <data-checkout>
```

`prepare` reads the latest live copy and writes only the selected data checkout.
Publish those files and the v6 site/worker together. After the old watcher lease
expires, run the same command with `install` in place of `prepare`. It refuses
uncommitted data, checks that published data exactly equals the conversion of
current live, and uses CAS to prevent overwriting an intervening edit. It also
converts starter/kept snapshots. If live changed, prepare and publish again.
Then update the dedicated watcher clone, restart the scheduled task, verify one
successful round, and dispatch the data repository's Outline sync workflow.
