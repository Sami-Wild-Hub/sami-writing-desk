param(
  [Parameter(Mandatory = $false)][string]$Credentials,
  [switch]$Remove,
  [string]$DataRepo = (Join-Path $PSScriptRoot 'data.git'),
  [string]$DatabaseUrl,
  [string]$Household
)

$ErrorActionPreference = 'Stop'
$taskName = 'Samidore Outline Sync'
$sync = Join-Path $PSScriptRoot 'sync.mjs'
$configPath = Join-Path $PSScriptRoot 'config.json'

if ($Remove) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  exit 0
}

$node = (Get-Command node -ErrorAction Stop).Source
$version = (& $node --version).Trim()
if ($version -notmatch '^v24\.') { throw "Node 24 is required; found $version" }
if (-not $Credentials -or -not $DatabaseUrl -or -not $Household) { throw 'Credentials, DatabaseUrl, and Household are required.' }
Push-Location $PSScriptRoot
try {
  & npm.cmd ci
  if (-not (Test-Path -LiteralPath $DataRepo)) { & git clone --bare 'https://github.com/Sami-Wild-Hub/sami-writing-desk-data' $DataRepo }
  $config = [ordered]@{ credentials = (Resolve-Path -LiteralPath $Credentials).Path; databaseURL = $DatabaseUrl; household = $Household; dataRepo = (Resolve-Path -LiteralPath $DataRepo).Path; pollSeconds = 10 }
  $config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
  $action = New-ScheduledTaskAction -Execute $node -Argument "`"$sync`" watch" -WorkingDirectory $PSScriptRoot
  $logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon, $repeat) -Settings $settings -Principal $principal -Description 'Sami Writing Desk outline sync' -Force | Out-Null
  Start-ScheduledTask -TaskName $taskName
} finally { Pop-Location }

