<#
PowerShell ICS -> Supabase bookings importer (no Node.js required)
Prereqs: Service role key; single-org assumption (first org row used).
Usage example:
  $env:SUPABASE_URL='https://YOURPROJECT.supabase.co'
  $env:SUPABASE_SERVICE_KEY='SERVICE_ROLE_KEY'
  $feeds = @(
    @{ property='Speranta Flat'; platform='booking'; url='https://ical.booking.com/v1/export?t=8123e217-45b4-403d-8fa0-9dcc65c26800' },
    @{ property='Speranta Flat'; platform='lekkeslaap'; url='https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=bXEzOHNicTJQT3Nkd1dHb1ZSaXhRUT09' },
    @{ property='Speranta Flat'; platform='fewo'; url='http://www.fewo-direkt.de/icalendar/12b719114ecd42adab4e9ade2d2458e6.ics?nonTentative' },
    @{ property='Speranta Flat'; platform='airbnb'; url='https://www.airbnb.com/calendar/ical/1237076374831130516.ics?s=01582d0497e99114aa6013156146cea4&locale=en-GB' },
    @{ property='TV House'; platform='booking'; url='https://ical.booking.com/v1/export?t=ea29c451-4d0b-4fa4-b7a8-e879a33a8940' },
    @{ property='TV House'; platform='lekkeslaap'; url='https://www.lekkeslaap.co.za/suppliers/icalendar.ics?t=QzZ2aFlFVHhxYnoxdGRVL3ZwelRGUT09' },
    @{ property='TV House'; platform='airbnb'; url='https://www.airbnb.com/calendar/ical/1402174824640448492.ics?s=373c5a71c137230a72f928e88728dcf3&locale=en-GB' }
  )
  .\import_ical_bookings.ps1 -Feeds $feeds -DaysPast 180

Parameters:
  -Feeds      Array of hashtables with property, platform, url
  -DaysPast   (Optional) only include events ending after (Now - DaysPast)

Caveats:
  - ICS may not include far historical bookings.
  - Guest names heuristically split by first space.
  - Financial fields left NULL for manual enrichment.
#>
param(
  [Parameter(Mandatory=$true)] [array]$Feeds,
  [int]$DaysPast = 0
)

function Get-EnvOrFail($name) {
  $v = [Environment]::GetEnvironmentVariable($name)
  if (-not $v) { throw "Missing environment variable $name" }
  return $v
}

$SupabaseUrl = Get-EnvOrFail 'SUPABASE_URL'
$ServiceKey  = Get-EnvOrFail 'SUPABASE_SERVICE_KEY'
$Headers = @{ apikey = $ServiceKey; Authorization = "Bearer $ServiceKey"; Prefer='return=representation' }

function Get-FirstOrgId {
  $resp = Invoke-RestMethod -Method Get -Uri "$SupabaseUrl/rest/v1/organizations?select=id&limit=1" -Headers $Headers
  if (-not $resp -or -not $resp[0].id) { throw 'No organization found. Seed organizations first.' }
  return $resp[0].id
}
$OrgId = Get-FirstOrgId

function Ensure-PropertyId($orgId, $name) {
  $encoded = [System.Web.HttpUtility]::UrlEncode($name)
  $url = "$SupabaseUrl/rest/v1/properties?select=id&org_id=eq.$orgId&name=eq.$encoded&limit=1"
  $resp = Invoke-RestMethod -Method Get -Uri $url -Headers $Headers -ErrorAction Stop
  if ($resp -and $resp.Count -gt 0) { return $resp[0].id }
  $body = @{ org_id = $orgId; name = $name; status='active' } | ConvertTo-Json -Depth 4
  $created = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/properties" -Headers $Headers -Body $body -ContentType 'application/json'
  return $created[0].id
}

function Parse-Ics($content) {
  $lines = $content -split "`r?`n"
  $events = @()
  $current = @{}
  foreach ($line in $lines) {
    if ($line -match '^BEGIN:VEVENT') { $current = @{} }
    elseif ($line -match '^END:VEVENT') { $events += $current; $current=@{} }
    elseif ($line -match '^(DTSTART).*:(.+)$') { $current.start = $Matches[2] }
    elseif ($line -match '^(DTEND).*:(.+)$')   { $current.end   = $Matches[2] }
    elseif ($line -match '^SUMMARY:(.+)$')     { $current.summary = $Matches[1] }
    elseif ($line -match '^DESCRIPTION:(.+)$') { if (-not $current.summary) { $current.summary = $Matches[1] } }
  }
  return $events | Where-Object { $_.start -and $_.end }
}

function Convert-IcsDate($raw) {
  # Handle formats like 20251128T120000Z
  if ($raw -match 'Z$') { return [DateTime]::ParseExact($raw,'yyyyMMddTHHmmssZ',[System.Globalization.CultureInfo]::InvariantCulture,[System.Globalization.DateTimeStyles]::AssumeUniversal) }
  elseif ($raw -match '^\d{8}$') { return [DateTime]::ParseExact($raw,'yyyyMMdd',[System.Globalization.CultureInfo]::InvariantCulture) }
  else { return [DateTime]$raw }
}

function Split-Guest($summary) {
  if (-not $summary) { return @{ first=$null; last=$null } }
  $clean = ($summary -replace 'Reservation:','').Trim()
  $parts = $clean -split '\s+'
  if ($parts.Count -eq 1) { return @{ first=$parts[0]; last=$null } }
  return @{ first=$parts[0]; last=($parts[1..($parts.Count-1)] -join ' ') }
}

$AllRows = @()
$Cutoff = if ($DaysPast -gt 0) { (Get-Date).AddDays(-$DaysPast) } else { $null }

foreach ($f in $Feeds) {
  Write-Host "Fetching ICS: $($f.platform) $($f.property)"
  try {
    $raw = Invoke-WebRequest -Uri $f.url -UseBasicParsing -ErrorAction Stop
  } catch {
    Write-Warning "Failed to fetch $($f.url): $_"; continue
  }
  $events = Parse-Ics $raw.Content
  $propId = Ensure-PropertyId $OrgId $f.property
  foreach ($ev in $events) {
    $start = Convert-IcsDate $ev.start
    $end   = Convert-IcsDate $ev.end
    if ($Cutoff -and $end -lt $Cutoff) { continue }
    $guest = Split-Guest $ev.summary
    $AllRows += [PSCustomObject]@{
      org_id = $OrgId
      property_id = $propId
      property_name = $null
      platform = $f.platform
      guest_first_name = $guest.first
      guest_last_name  = $guest.last
      check_in  = $start.ToUniversalTime().ToString('o')
      check_out = $end.ToUniversalTime().ToString('o')
      status = 'confirmed'
      total_amount = $null
      currency = 'ZAR'
    }
  }
  Write-Host "Parsed $($events.Count) events from $($f.platform)"
}

# Deduplicate
$Dedup = @{}
foreach ($r in $AllRows) {
  $k = "$($r.property_id)|$($r.platform)|$($r.check_in)|$($r.check_out)"
  if (-not $Dedup.ContainsKey($k)) { $Dedup[$k] = $r }
}
$Final = $Dedup.Values
Write-Host "Upserting $($Final.Count) unique booking spans..."

# Batch insert (chunk to avoid large payload issues)
$BatchSize = 200
for ($i=0; $i -lt $Final.Count; $i+=$BatchSize) {
  $chunk = $Final[$i..([Math]::Min($i+$BatchSize-1,$Final.Count-1))]
  $json = $chunk | ConvertTo-Json -Depth 6
  try {
    $resp = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/bookings?on_conflict=org_id,property_id,platform,check_in,check_out" -Headers $Headers -Body $json -ContentType 'application/json'
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
      Write-Warning "Conflict (duplicate) ignoring chunk starting $i"
    } else { Write-Warning "Insert error chunk $i: $_" }
  }
}

Write-Host "Done. Review bookings table; enrich financials manually."
