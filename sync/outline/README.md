# Outline sync

Run the watcher with Node 24 after copying `config.example.json` to the ignored
`config.json` and filling in the local service-account path, RTDB URL, household,
and bare data-repository path:

```powershell
node sync/outline/sync.mjs once
node sync/outline/sync.mjs watch
```

`once --action` is the GitHub Actions mode. It only performs reconciliation when
the watcher lease is free. The script writes no credentials to this repository;
Git uses the machine's existing credentials and RTDB uses the configured key path.
