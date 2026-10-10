# Run manually in your own isolated Windows lab. This saves RAW local output for review.
# No output is sent, published or copied into src/fixtures automatically.
param(
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$')][string]$LabName,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9.]{7,15}$')][string]$LabAddress,
  [ValidateRange(1,65535)][int]$Port = 443
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Choose a NEW local output directory; existing data will not be overwritten.' }
$target = New-Item -ItemType Directory -Path $OutputDirectory
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Write-Capture([string]$Name, [object]$Value) {
  [System.IO.File]::WriteAllText((Join-Path $target.FullName $Name), [string]$Value, $utf8)
}
$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber
$metadata = [ordered]@{
  schemaVersion = 1
  provenance = 'real-raw-pending-review'
  os = $os
  shellVersion = $PSVersionTable.PSVersion.ToString()
  locale = (Get-Culture).Name
  capturedAt = (Get-Date).ToUniversalTime().ToString('o')
  reviewed = $false
  instructions = 'Review locally; map all names, addresses, MACs and identifiers consistently. Never submit these raw files. Add only redacted examples with expected parser output and sha256 to the real manifest.'
}
Write-Capture 'capture-metadata.json' ($metadata | ConvertTo-Json -Depth 4)
Write-Capture 'ipconfig.txt' ((& ipconfig.exe /all) -join "`n")
Write-Capture 'route.txt' ((& route.exe print) -join "`n")
Write-Capture 'ping.txt' ((& ping.exe -n 2 $LabAddress) -join "`n")
Write-Capture 'tracert.txt' ((& tracert.exe -d -h 5 -w 500 $LabAddress) -join "`n")
# Native error text (e.g. NXDOMAIN) is itself useful diagnostic data in Windows PowerShell 5.1.
$previousErrorPreference = $ErrorActionPreference
try {
  $ErrorActionPreference = 'Continue'
  $lookup = (& nslookup.exe $LabName 2>&1) -join "`n"
} finally { $ErrorActionPreference = $previousErrorPreference }
Write-Capture 'nslookup.txt' $lookup
$ip = Get-NetIPConfiguration | Select-Object InterfaceIndex, InterfaceAlias,
  @{n='IPv4Address';e={@($_.IPv4Address.IPAddress)}},
  @{n='IPv6Address';e={@($_.IPv6Address.IPAddress)}},
  @{n='IPv4DefaultGateway';e={@($_.IPv4DefaultGateway.NextHop)}},
  @{n='DNSServer';e={@($_.DNSServer.ServerAddresses)}}
Write-Capture 'powershell-ip.json' ($ip | ConvertTo-Json -Depth 4)
$tcp = Test-NetConnection $LabName -Port $Port -WarningAction SilentlyContinue |
  Select-Object ComputerName, RemoteAddress, RemotePort, InterfaceAlias,
  @{n='SourceAddress';e={$_.SourceAddress.IPAddress}}, TcpTestSucceeded
Write-Capture 'powershell-tcp.json' ($tcp | ConvertTo-Json -Depth 4)
try {
  $dns = Resolve-DnsName $LabName -ErrorAction Stop |
    Select-Object Name, Type, TTL, Section, IPAddress, NameHost, NameExchange, Preference, Strings, NameTarget, Priority, Weight, Port
  Write-Capture 'powershell-dns.json' ($dns | ConvertTo-Json -Depth 4)
} catch { Write-Capture 'powershell-dns-error.txt' $_.Exception.Message }
Write-Output 'Saved locally for manual review. These are raw diagnostics, not approved fixtures. Nothing has been uploaded.'
