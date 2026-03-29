$ErrorActionPreference = "Stop"

$Token = [Environment]::GetEnvironmentVariable("NOTION_TOKEN", "Process")
if (-not $Token) {
  $Token = [Environment]::GetEnvironmentVariable("NOTION_TOKEN", "User")
}
if (-not $Token) {
  throw "NOTION_TOKEN is not set in the current process or user environment."
}

$Headers = @{
  Authorization    = "Bearer $Token"
  "Notion-Version" = "2022-06-28"
  "Content-Type"   = "application/json"
}

$Ids = @{
  Home             = "3319f5f6-66d0-805b-8ad5-f358f6a1b494"
  Projects         = "3319f5f6-66d0-81ab-b6e8-c4fe3e2047be"
  Infrastructure   = "3319f5f6-66d0-81cc-9115-cefdc9744e1b"
  Vendors          = "3319f5f6-66d0-8106-930b-fa443a4e6038"
  AccessIndex      = "3319f5f6-66d0-8160-b214-df4c8ad91c1e"
  Runbooks         = "3319f5f6-66d0-814c-827d-c665d9a03920"
  Incidents        = "3319f5f6-66d0-81c3-92de-e0f662adf912"
  Templates        = "3319f5f6-66d0-811b-ac7f-d7a8bb77d99e"
  Tmt              = "3319f5f6-66d0-8158-9d16-c6753643c9d6"
  TmtAccess        = "3319f5f6-66d0-815f-afec-cb9d4842bb4f"
  HostingInfra     = "3319f5f6-66d0-8122-a52c-cf4f2d77f6b9"
  DnsNetwork       = "3319f5f6-66d0-81b1-be6b-c80956a07ec1"
  SourceCi         = "3319f5f6-66d0-8185-a730-f7edd5c49bfb"
  MobileStore      = "3319f5f6-66d0-8120-a0c5-fdf5bc0b5c16"
  AppBackend       = "3319f5f6-66d0-8159-a98e-ce4b7d397fb8"
  VendorDo         = "3319f5f6-66d0-81f5-afaa-ca906b92849d"
  VendorCf         = "3319f5f6-66d0-81fc-9be3-dde625e713c7"
  VendorGh         = "3319f5f6-66d0-8178-958b-c847502fd09c"
  VendorExpo       = "3319f5f6-66d0-8143-bdc8-c7af7cf050c5"
  VendorApple      = "3319f5f6-66d0-81d0-840b-d4be6a873441"
  VendorNotion     = "3319f5f6-66d0-81f1-adaa-dbf8abee6fc7"
  RunbookDeploy    = "3319f5f6-66d0-81a0-b9c7-c4eafb8adc16"
  RunbookRollback  = "3319f5f6-66d0-8164-9c32-f028124e3cba"
  RunbookBootstrap = "3319f5f6-66d0-8158-9933-fd54567c25fe"
}

function Invoke-Notion {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    $Body
  )

  $uri = "https://api.notion.com/v1/$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
  }

  $json = $Body | ConvertTo-Json -Depth 30 -Compress
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -Body $json
}

function Get-Children {
  param([Parameter(Mandatory = $true)][string]$BlockId)

  $results = @()
  $cursor = $null
  do {
    $path = "blocks/$BlockId/children?page_size=100"
    if ($cursor) {
      $path += "&start_cursor=$cursor"
    }
    $response = Invoke-Notion -Method GET -Path $path
    $results += $response.results
    $cursor = if ($response.has_more) { $response.next_cursor } else { $null }
  } while ($cursor)

  return $results
}

function Get-PlainText {
  param($RichText)

  if (-not $RichText) {
    return ""
  }

  return (($RichText | ForEach-Object { $_.plain_text }) -join "").Trim()
}

function Get-BlockText {
  param($Block)

  switch ($Block.type) {
    "paragraph" { return Get-PlainText $Block.paragraph.rich_text }
    "bulleted_list_item" { return Get-PlainText $Block.bulleted_list_item.rich_text }
    "numbered_list_item" { return Get-PlainText $Block.numbered_list_item.rich_text }
    "heading_1" { return Get-PlainText $Block.heading_1.rich_text }
    "heading_2" { return Get-PlainText $Block.heading_2.rich_text }
    "heading_3" { return Get-PlainText $Block.heading_3.rich_text }
    "callout" { return Get-PlainText $Block.callout.rich_text }
    "code" { return Get-PlainText $Block.code.rich_text }
    default { return "" }
  }
}

function New-RichText {
  param([Parameter(Mandatory = $true)][string]$Text)

  return @(
    @{
      type = "text"
      text = @{
        content = $Text
      }
    }
  )
}

function New-Paragraph {
  param([Parameter(Mandatory = $true)][string]$Text)

  return @{
    object    = "block"
    type      = "paragraph"
    paragraph = @{
      rich_text = (New-RichText $Text)
    }
  }
}

function New-Bullet {
  param([Parameter(Mandatory = $true)][string]$Text)

  return @{
    object             = "block"
    type               = "bulleted_list_item"
    bulleted_list_item = @{
      rich_text = (New-RichText $Text)
    }
  }
}

function New-Heading2 {
  param([Parameter(Mandatory = $true)][string]$Text)

  return @{
    object    = "block"
    type      = "heading_2"
    heading_2 = @{
      rich_text = (New-RichText $Text)
    }
  }
}

function New-Divider {
  return @{
    object  = "block"
    type    = "divider"
    divider = @{}
  }
}

function New-Callout {
  param(
    [Parameter(Mandatory = $true)][string]$Text,
    [Parameter(Mandatory = $true)][string]$Emoji
  )

  return @{
    object  = "block"
    type    = "callout"
    callout = @{
      rich_text = (New-RichText $Text)
      icon      = @{
        type  = "emoji"
        emoji = $Emoji
      }
    }
  }
}

function New-Code {
  param([Parameter(Mandatory = $true)][string]$Text)

  return @{
    object = "block"
    type   = "code"
    code   = @{
      rich_text = (New-RichText $Text)
      language  = "plain text"
    }
  }
}

function Set-PageTitle {
  param(
    [Parameter(Mandatory = $true)][string]$PageId,
    [Parameter(Mandatory = $true)][string]$Title
  )

  Invoke-Notion -Method PATCH -Path "pages/$PageId" -Body @{
    properties = @{
      title = @{
        title = @(
          @{
            type = "text"
            text = @{
              content = $Title
            }
          }
        )
      }
    }
  } | Out-Null
}

function Append-Blocks {
  param(
    [Parameter(Mandatory = $true)][string]$BlockId,
    [Parameter(Mandatory = $true)][array]$Blocks
  )

  if ($Blocks.Count -eq 0) {
    return
  }

  Invoke-Notion -Method PATCH -Path "blocks/$BlockId/children" -Body @{
    children = $Blocks
  } | Out-Null
}

function Archive-Block {
  param([Parameter(Mandatory = $true)][string]$BlockId)

  Invoke-Notion -Method PATCH -Path "blocks/$BlockId" -Body @{ archived = $true } | Out-Null
}

function Archive-Page {
  param([Parameter(Mandatory = $true)][string]$PageId)

  Invoke-Notion -Method PATCH -Path "pages/$PageId" -Body @{ archived = $true } | Out-Null
}

function Clear-PageContent {
  param(
    [Parameter(Mandatory = $true)][string]$PageId,
    [string[]]$KeepTypes = @("child_page")
  )

  foreach ($child in (Get-Children -BlockId $PageId)) {
    if ($KeepTypes -contains $child.type) {
      continue
    }
    Archive-Block -BlockId $child.id
  }
}

function Get-OrCreateChildPage {
  param(
    [Parameter(Mandatory = $true)][string]$ParentPageId,
    [Parameter(Mandatory = $true)][string]$Title
  )

  foreach ($child in (Get-Children -BlockId $ParentPageId)) {
    if ($child.type -eq "child_page" -and $child.child_page.title -eq $Title) {
      return $child.id
    }
  }

  $response = Invoke-Notion -Method POST -Path "pages" -Body @{
    parent     = @{ type = "page_id"; page_id = $ParentPageId }
    properties = @{
      title = @{
        title = @(
          @{
            type = "text"
            text = @{
              content = $Title
            }
          }
        )
      }
    }
  }

  return $response.id
}

function Get-CodeTexts {
  param([Parameter(Mandatory = $true)][string]$PageId)

  return @(
    Get-Children -BlockId $PageId |
      Where-Object { $_.type -eq "code" } |
      ForEach-Object { Get-PlainText $_.code.rich_text }
  )
}

function Get-TextNotes {
  param([Parameter(Mandatory = $true)][string]$PageId)

  return @(
    Get-Children -BlockId $PageId |
      Where-Object { $_.type -ne "code" -and $_.type -ne "child_page" } |
      ForEach-Object { Get-BlockText $_ } |
      Where-Object { $_ }
  )
}

function New-HeaderBlocks {
  param(
    [Parameter(Mandatory = $true)][string]$Purpose,
    [Parameter(Mandatory = $true)][string]$CanonicalSource,
    [Parameter(Mandatory = $true)][string]$ReadThisWhen,
    [Parameter(Mandatory = $true)][string]$Sensitive
  )

  return @(
    (New-Paragraph "Purpose: $Purpose"),
    (New-Paragraph "Canonical Source: $CanonicalSource"),
    (New-Paragraph "Read This When: $ReadThisWhen"),
    (New-Paragraph "Last Updated: 2026-03-28"),
    (New-Paragraph "Sensitive: $Sensitive"),
    (New-Divider)
  )
}

function Reset-Page {
  param(
    [Parameter(Mandatory = $true)][string]$PageId,
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][array]$Blocks,
    [string[]]$KeepTypes = @()
  )

  Set-PageTitle -PageId $PageId -Title $Title
  Clear-PageContent -PageId $PageId -KeepTypes $KeepTypes
  Append-Blocks -BlockId $PageId -Blocks $Blocks
}

$HostingCodes = Get-CodeTexts -PageId $Ids.HostingInfra
$HostingNotes = Get-TextNotes -PageId $Ids.HostingInfra
$DnsNotes = Get-TextNotes -PageId $Ids.DnsNetwork
$SourceNotes = Get-TextNotes -PageId $Ids.SourceCi
$MobileNotes = Get-TextNotes -PageId $Ids.MobileStore
$BackendNotes = Get-TextNotes -PageId $Ids.AppBackend

$DoTokenRaw = if ($HostingCodes.Count -ge 1) { $HostingCodes[0] } else { "PASTE TOKEN HERE" }
$ProdRootRaw = if ($HostingCodes.Count -ge 2) { $HostingCodes[1] } else { "PASTE PROD ROOT ACCESS HERE" }
$TestRootRaw = if ($HostingCodes.Count -ge 3) { $HostingCodes[2] } else { "PASTE TEST ROOT ACCESS HERE" }
$DeployKeyRaw = if ($HostingCodes.Count -ge 4) { $HostingCodes[3] } else { "PASTE DEPLOY KEY METADATA HERE" }

Set-PageTitle -PageId $Ids.Vendors -Title "Vendors"
Set-PageTitle -PageId $Ids.AccessIndex -Title "Access Index"
Set-PageTitle -PageId $Ids.Runbooks -Title "Runbooks"
Set-PageTitle -PageId $Ids.HostingInfra -Title "Hosting & Infra"
Set-PageTitle -PageId $Ids.DnsNetwork -Title "DNS & Network"
Set-PageTitle -PageId $Ids.SourceCi -Title "Source Control & CI/CD"
Set-PageTitle -PageId $Ids.MobileStore -Title "Mobile & Store"
Set-PageTitle -PageId $Ids.AppBackend -Title "App & Backend"
Set-PageTitle -PageId $Ids.TmtAccess -Title "Tall Man Training"
Archive-Page -PageId $Ids.Infrastructure

$BackupRunbookId = Get-OrCreateChildPage -ParentPageId $Ids.Runbooks -Title "Tall Man Training - Backup & Recovery"
$LocalWorkstationId = Get-OrCreateChildPage -ParentPageId $Ids.Home -Title "Local Workstation"

$HomeBlocks = @(New-HeaderBlocks `
  -Purpose "Workspace landing page for operational context across projects." `
  -CanonicalSource "Notion workspace home" `
  -ReadThisWhen "You need the top-level structure, naming rules, or shared operating model." `
  -Sensitive "no") + @(
  (New-Callout "Repo docs keep code-coupled truth. Notion keeps current operational state, access, runbooks, incidents, and active planning." "🧭"),
  (New-Heading2 "Start Here"),
  (New-Bullet "Projects contains project hubs and current operating state."),
  (New-Bullet "Access Index is the only place raw secret values should live."),
  (New-Bullet "Runbooks holds executable procedures, not environment summaries."),
  (New-Bullet "Vendors holds provider ownership, billing, and access context."),
  (New-Bullet "Incidents records operational history and lessons."),
  (New-Heading2 "Shared Context"),
  (New-Bullet "Local Workstation stores the current machine baseline and terminal/tooling capability shared across projects.")
)

$ProjectsBlocks = @(New-HeaderBlocks `
  -Purpose "Index of project hubs." `
  -CanonicalSource "Project pages under Projects" `
  -ReadThisWhen "You need orientation, current status, or the main operational entry point for a specific project." `
  -Sensitive "no") + @(
  (New-Callout "Project root pages are orientation pages. Active execution lives in each project's Ops page." "📁"),
  (New-Bullet "Keep each project root short: purpose, status, repo docs, public links, operational surfaces, next milestone."),
  (New-Bullet "Do not duplicate secret values, vendor details, or procedural content inside the project root.")
)

$AccessIndexBlocks = @(New-HeaderBlocks `
  -Purpose "Canonical home for credentials and access metadata." `
  -CanonicalSource "Access Index project pages" `
  -ReadThisWhen "You need to locate or rotate a credential, confirm access method, or see which environments depend on a system." `
  -Sensitive "yes") + @(
  (New-Callout "Raw secret values belong only in Access Index pages. Project pages, vendor pages, and runbooks should reference these pages instead of copying values." "🔐"),
  (New-Bullet "Use fixed fields: System, Purpose, Auth Method, Where The Secret Lives, Owner, Environments Used, Rotation / Reset, Raw Value."),
  (New-Bullet "Prefer one access page per domain, not one page per individual token.")
)

$VendorsBlocks = @(New-HeaderBlocks `
  -Purpose "Index of provider ownership and account context." `
  -CanonicalSource "Vendor pages" `
  -ReadThisWhen "You need the owning account, billing context, or a provider-level summary without opening project-specific operational notes." `
  -Sensitive "no") + @(
  (New-Bullet "Keep provider pages short and reusable across projects."),
  (New-Bullet "Do not store raw secret values here. Link back to Access Index instead.")
)

$RunbooksBlocks = @(New-HeaderBlocks `
  -Purpose "Canonical home for executable operator procedures." `
  -CanonicalSource "Runbook pages" `
  -ReadThisWhen "You need to perform a deploy, rollback, restore, or bootstrap task." `
  -Sensitive "no") + @(
  (New-Bullet "Each runbook should state the owning project and the related Access Index page."),
  (New-Bullet "Avoid long environment summaries. Keep only the minimum context needed to execute the procedure.")
)

$IncidentsBlocks = @(New-HeaderBlocks `
  -Purpose "Historical record of operational incidents and lessons." `
  -CanonicalSource "Incident pages" `
  -ReadThisWhen "You are debugging a repeat issue or reviewing historical operational decisions." `
  -Sensitive "no") + @(
  (New-Bullet "Capture what happened, impact, resolution, and durable lessons.")
)

$TemplatesBlocks = @(New-HeaderBlocks `
  -Purpose "Reusable page shapes for new projects, vendors, access pages, and incidents." `
  -CanonicalSource "Template pages" `
  -ReadThisWhen "You are creating a new project or extending the workspace structure." `
  -Sensitive "no") + @(
  (New-Bullet "Template pages should define structure and field names, not carry active project state.")
)

$LocalWorkstationBlocks = @(New-HeaderBlocks `
  -Purpose "Shared baseline for the current development workstation used across projects." `
  -CanonicalSource "Local machine state" `
  -ReadThisWhen "You need to know what this machine can do without re-discovering the toolchain or hardware." `
  -Sensitive "no") + @(
  (New-Callout "This page replaces the old repo-local local capabilities doc. Keep project-specific operational state out of it." "💻"),
  (New-Heading2 "Hardware"),
  (New-Bullet "Machine: ASUSTeK ROG Zephyrus G14 GA402XY"),
  (New-Bullet "CPU: AMD Ryzen 9 7940HS"),
  (New-Bullet "RAM: 47 GB usable system memory"),
  (New-Bullet "GPU: NVIDIA GeForce RTX 4090 Laptop GPU plus AMD Radeon 780M"),
  (New-Bullet "Local ML / AI note: capable of moderate local inference or GPU-assisted experimentation, but not treated as a dedicated training box."),
  (New-Heading2 "Tooling"),
  (New-Bullet "Terminal tooling: rg, fd, jq, bat, delta, fzf, httpie, gh"),
  (New-Bullet "Mobile tooling: Android SDK at C:\\Android\\SDK, Android emulator support, Expo / EAS workflows"),
  (New-Bullet "Access tooling: SSH config present and key-based access configured for Tall Man Training infrastructure")
)

Reset-Page -PageId $Ids.Home -Title "Infrastructure HQ Home" -Blocks $HomeBlocks -KeepTypes @("child_page")
Reset-Page -PageId $Ids.Projects -Title "Projects" -Blocks $ProjectsBlocks -KeepTypes @("child_page")
Reset-Page -PageId $Ids.AccessIndex -Title "Access Index" -Blocks $AccessIndexBlocks -KeepTypes @("child_page")
Reset-Page -PageId $Ids.Vendors -Title "Vendors" -Blocks $VendorsBlocks -KeepTypes @("child_page")
Reset-Page -PageId $Ids.Runbooks -Title "Runbooks" -Blocks $RunbooksBlocks -KeepTypes @("child_page")
Reset-Page -PageId $Ids.Incidents -Title "Incidents" -Blocks $IncidentsBlocks -KeepTypes @("child_page")
Reset-Page -PageId $Ids.Templates -Title "Templates" -Blocks $TemplatesBlocks -KeepTypes @("child_page")
Reset-Page -PageId $LocalWorkstationId -Title "Local Workstation" -Blocks $LocalWorkstationBlocks

Reset-Page -PageId $Ids.Tmt -Title "Tall Man Training" -Blocks @()
$OpsId = Get-OrCreateChildPage -ParentPageId $Ids.Tmt -Title "Ops"

$TmtBlocks = @(New-HeaderBlocks `
  -Purpose "Primary orientation page for Tall Man Training." `
  -CanonicalSource "Repo docs plus Tall Man Training Ops" `
  -ReadThisWhen "You need the current project state, canonical repo docs, public links, or the next operational surface to open." `
  -Sensitive "no") + @(
  (New-Callout "Tall Man Training uses the repo for durable technical truth and Notion for current operational state." "🏋️"),
  (New-Heading2 "Current Status"),
  (New-Bullet "Shared Expo / React Native client is shipped on web and can be tested natively on Android and iPhone."),
  (New-Bullet "Production and test environments run on separate DigitalOcean droplets behind Cloudflare."),
  (New-Bullet "Current engineering focus is native delivery validation and the supporting operator workflow."),
  (New-Heading2 "Canonical Repo Docs"),
  (New-Bullet "README.md - onboarding, quick start, and deploy entry points"),
  (New-Bullet "docs/architecture-decisions.md - durable technical invariants"),
  (New-Bullet "docs/dev-guide.md - contributor workflow and versioning"),
  (New-Bullet "docs/infrastructure.md - runtime contract and hosting topology"),
  (New-Bullet "docs/changelog.md - shipped history"),
  (New-Heading2 "Public Links"),
  (New-Bullet "Production: https://tallman.seanwilkie.me"),
  (New-Bullet "Test: https://tallmantest.seanwilkie.me"),
  (New-Bullet "GitHub: DrW00kie1/tall-man-training"),
  (New-Bullet "Expo / EAS: @seanwilkie/tall-man-training"),
  (New-Heading2 "Operational Surfaces"),
  (New-Bullet "Ops - active project state, environment snapshot, deployment notes, and next milestone"),
  (New-Bullet "Access Index > Tall Man Training - all credentials and access metadata"),
  (New-Bullet "Runbooks - deploy, rollback, backup & recovery, and server bootstrap procedures"),
  (New-Bullet "Vendors - provider ownership and account context"),
  (New-Heading2 "Current Priorities / Next Milestone"),
  (New-Bullet "Keep the shared client stable across web, Android, and iPhone."),
  (New-Bullet "Treat iOS packaged builds as milestone checkpoints until a local Mac build loop exists."),
  (New-Bullet "Keep deployment and access automation centralized around the documented aliases and runbooks.")
)

Append-Blocks -BlockId $Ids.Tmt -Blocks $TmtBlocks

$OpsBlocks = @(New-HeaderBlocks `
  -Purpose "Active operating page for Tall Man Training." `
  -CanonicalSource "Current operational state for Tall Man Training" `
  -ReadThisWhen "You need to understand what exists now, where it runs, what is next, or which operational link to open." `
  -Sensitive "no") + @(
  (New-Callout "Use this page for current state and next actions. Use repo docs for durable technical truth." "⚙️"),
  (New-Heading2 "Environment Snapshot"),
  (New-Bullet "Production: tallman.seanwilkie.me on tmt-prod"),
  (New-Bullet "Test: tallmantest.seanwilkie.me on tmt-test"),
  (New-Bullet "Both environments run the same Cloudflare -> DigitalOcean -> Caddy -> PocketBase shape."),
  (New-Heading2 "Current Capability Snapshot"),
  (New-Bullet "Web/PWA is the stable production delivery surface."),
  (New-Bullet "Android can be validated locally through the emulator and native Expo tooling."),
  (New-Bullet "iPhone validation currently uses packaged preview builds rather than a local Mac simulator loop."),
  (New-Heading2 "Operator Links"),
  (New-Bullet "Access Index > Tall Man Training for credentials and access inventory"),
  (New-Bullet "Runbooks for deploy, rollback, backup & recovery, and server bootstrap"),
  (New-Bullet "Vendor pages for DigitalOcean, Cloudflare, GitHub, Expo / EAS, Apple Developer, and Notion"),
  (New-Heading2 "Next Milestone"),
  (New-Bullet "Continue shared-client polish while keeping iOS packaged builds batched and deliberate."),
  (New-Bullet "Preserve clean documentation boundaries: repo for code-coupled truth, Notion for current state.")
)

Reset-Page -PageId $OpsId -Title "Ops" -Blocks $OpsBlocks

$TmtAccessBlocks = @(New-HeaderBlocks `
  -Purpose "Canonical access inventory for Tall Man Training." `
  -CanonicalSource "Access Index > Tall Man Training" `
  -ReadThisWhen "You need any secret, credential, or provider access path for Tall Man Training." `
  -Sensitive "yes") + @(
  (New-Callout "This is the only Tall Man Training area where raw secret values should live." "🔐"),
  (New-Bullet "Hosting & Infra covers DigitalOcean access, servers, and deployment SSH."),
  (New-Bullet "DNS & Network covers Cloudflare, DNS, certificates, and public edge settings."),
  (New-Bullet "Source Control & CI/CD covers GitHub, Actions, deploy automation, and repo integrations."),
  (New-Bullet "Mobile & Store covers Expo / EAS and Apple distribution access."),
  (New-Bullet "App & Backend covers PocketBase and app-facing service credentials.")
)

Reset-Page -PageId $Ids.TmtAccess -Title "Tall Man Training" -Blocks $TmtAccessBlocks -KeepTypes @("child_page")

$HostingBlocks = @(New-HeaderBlocks `
  -Purpose "Tall Man Training hosting, server, and deployment access." `
  -CanonicalSource "Access Index > Tall Man Training > Hosting & Infra" `
  -ReadThisWhen "You need DigitalOcean access, server login, or the current deploy-key state." `
  -Sensitive "yes") + @(
  (New-Heading2 "System"),
  (New-Bullet "DigitalOcean droplets, server root access, and deployment SSH"),
  (New-Heading2 "Purpose"),
  (New-Bullet "Manage droplets, identify production and test hosts, and maintain deploy access."),
  (New-Heading2 "Auth Method"),
  (New-Bullet "DigitalOcean personal access token plus SSH / root credentials"),
  (New-Heading2 "Where The Secret Lives"),
  (New-Bullet "Raw values are stored only on this page."),
  (New-Heading2 "Owner"),
  (New-Bullet "Sean Wilkie"),
  (New-Heading2 "Environments Used"),
  (New-Bullet "Production and Test"),
  (New-Heading2 "Rotation / Reset"),
  (New-Bullet "Rotate the API token if it is exposed or expires. Keep root passwords as emergency-only once SSH key access is verified."),
  (New-Heading2 "Raw Value"),
  (New-Paragraph "DigitalOcean API Token"),
  (New-Code $DoTokenRaw),
  (New-Paragraph "Production Server Root Access"),
  (New-Code $ProdRootRaw),
  (New-Paragraph "Test Server Root Access"),
  (New-Code $TestRootRaw),
  (New-Paragraph "Deployment SSH Access"),
  (New-Code $DeployKeyRaw)
)
if ($HostingNotes.Count -gt 0) {
  $HostingBlocks += @(New-Heading2 "Imported Notes")
  foreach ($note in $HostingNotes) {
    $HostingBlocks += @(New-Bullet $note)
  }
}

$DnsBlocks = @(New-HeaderBlocks `
  -Purpose "Tall Man Training DNS, edge, and certificate access." `
  -CanonicalSource "Access Index > Tall Man Training > DNS & Network" `
  -ReadThisWhen "You need Cloudflare access, DNS records, or origin certificate context." `
  -Sensitive "yes") + @(
  (New-Paragraph "System: Cloudflare, DNS records, and origin certificate context"),
  (New-Paragraph "Purpose: Manage public domains and the edge-to-origin trust chain."),
  (New-Paragraph "Auth Method: Cloudflare account access and API token"),
  (New-Paragraph "Where The Secret Lives: Raw values belong only on this page."),
  (New-Paragraph "Owner: Sean Wilkie"),
  (New-Paragraph "Environments Used: Production and Test"),
  (New-Paragraph "Rotation / Reset: Rotate tokens if exposed. Refresh origin certificate material before expiry.")
)
if ($DnsNotes.Count -gt 0) {
  $DnsBlocks += @(New-Heading2 "Imported Notes")
  foreach ($note in $DnsNotes) {
    $DnsBlocks += @(New-Bullet $note)
  }
}

$SourceBlocks = @(New-HeaderBlocks `
  -Purpose "Tall Man Training source-control and automation access." `
  -CanonicalSource "Access Index > Tall Man Training > Source Control & CI/CD" `
  -ReadThisWhen "You need GitHub, automation, or deploy integration access." `
  -Sensitive "yes") + @(
  (New-Paragraph "System: GitHub, Actions, and deploy integrations"),
  (New-Paragraph "Purpose: Manage repository access, CI/CD workflows, and connected automation."),
  (New-Paragraph "Auth Method: GitHub account access, app/install permissions, or automation tokens"),
  (New-Paragraph "Where The Secret Lives: Raw values belong only on this page."),
  (New-Paragraph "Owner: Sean Wilkie"),
  (New-Paragraph "Environments Used: Shared across development, test, and production workflows"),
  (New-Paragraph "Rotation / Reset: Rotate automation tokens after exposure or when integrations change.")
)
if ($SourceNotes.Count -gt 0) {
  $SourceBlocks += @(New-Heading2 "Imported Notes")
  foreach ($note in $SourceNotes) {
    $SourceBlocks += @(New-Bullet $note)
  }
}

$MobileBlocks = @(New-HeaderBlocks `
  -Purpose "Tall Man Training mobile build and store access." `
  -CanonicalSource "Access Index > Tall Man Training > Mobile & Store" `
  -ReadThisWhen "You need Expo, EAS, Apple Developer, or App Store Connect access." `
  -Sensitive "yes") + @(
  (New-Paragraph "System: Expo / EAS, Apple Developer, and App Store Connect"),
  (New-Paragraph "Purpose: Manage Android and iOS builds, signing, and distribution."),
  (New-Paragraph "Auth Method: Expo account/token plus Apple account or App Store Connect API key"),
  (New-Paragraph "Where The Secret Lives: Raw values belong only on this page."),
  (New-Paragraph "Owner: Sean Wilkie"),
  (New-Paragraph "Environments Used: Native test, preview, and store distribution workflows"),
  (New-Paragraph "Rotation / Reset: Rotate Expo tokens after exposure. Replace Apple credentials when revoked or expired.")
)
if ($MobileNotes.Count -gt 0) {
  $MobileBlocks += @(New-Heading2 "Imported Notes")
  foreach ($note in $MobileNotes) {
    $MobileBlocks += @(New-Bullet $note)
  }
}

$BackendBlocks = @(New-HeaderBlocks `
  -Purpose "Tall Man Training application and backend access." `
  -CanonicalSource "Access Index > Tall Man Training > App & Backend" `
  -ReadThisWhen "You need PocketBase admin access, backend operational access, or app-facing service credentials." `
  -Sensitive "yes") + @(
  (New-Paragraph "System: PocketBase admin and app/backend service credentials"),
  (New-Paragraph "Purpose: Manage auth, data, admin access, and app-facing service configuration."),
  (New-Paragraph "Auth Method: PocketBase admin credentials and service secrets"),
  (New-Paragraph "Where The Secret Lives: Raw values belong only on this page."),
  (New-Paragraph "Owner: Sean Wilkie"),
  (New-Paragraph "Environments Used: Production and Test"),
  (New-Paragraph "Rotation / Reset: Rotate backend secrets after exposure or major admin transitions.")
)
if ($BackendNotes.Count -gt 0) {
  $BackendBlocks += @(New-Heading2 "Imported Notes")
  foreach ($note in $BackendNotes) {
    $BackendBlocks += @(New-Bullet $note)
  }
}

Reset-Page -PageId $Ids.HostingInfra -Title "Hosting & Infra" -Blocks $HostingBlocks
Reset-Page -PageId $Ids.DnsNetwork -Title "DNS & Network" -Blocks $DnsBlocks
Reset-Page -PageId $Ids.SourceCi -Title "Source Control & CI/CD" -Blocks $SourceBlocks
Reset-Page -PageId $Ids.MobileStore -Title "Mobile & Store" -Blocks $MobileBlocks
Reset-Page -PageId $Ids.AppBackend -Title "App & Backend" -Blocks $BackendBlocks

$DoVendorBlocks = @(New-HeaderBlocks `
  -Purpose "Provider summary for DigitalOcean." `
  -CanonicalSource "Vendors > DigitalOcean" `
  -ReadThisWhen "You need provider ownership or billing context without opening project access pages." `
  -Sensitive "no") + @(
  (New-Bullet "Primary use: Tall Man Training production and test droplets"),
  (New-Bullet "Project access: Access Index > Tall Man Training > Hosting & Infra"),
  (New-Bullet "Current shape: tmt-prod and tmt-test in SFO3")
)

$CfVendorBlocks = @(New-HeaderBlocks `
  -Purpose "Provider summary for Cloudflare." `
  -CanonicalSource "Vendors > Cloudflare" `
  -ReadThisWhen "You need DNS or edge ownership context." `
  -Sensitive "no") + @(
  (New-Bullet "Primary use: DNS, CDN, edge protection, and origin certificate model"),
  (New-Bullet "Project access: Access Index > Tall Man Training > DNS & Network")
)

$GhVendorBlocks = @(New-HeaderBlocks `
  -Purpose "Provider summary for GitHub." `
  -CanonicalSource "Vendors > GitHub" `
  -ReadThisWhen "You need repository or CI ownership context." `
  -Sensitive "no") + @(
  (New-Bullet "Primary use: source control, pull requests, and CI automation"),
  (New-Bullet "Project access: Access Index > Tall Man Training > Source Control & CI/CD")
)

$ExpoVendorBlocks = @(New-HeaderBlocks `
  -Purpose "Provider summary for Expo and EAS." `
  -CanonicalSource "Vendors > Expo & EAS" `
  -ReadThisWhen "You need mobile build/distribution ownership context." `
  -Sensitive "no") + @(
  (New-Bullet "Primary use: Android and iOS cloud builds plus project linking"),
  (New-Bullet "Project access: Access Index > Tall Man Training > Mobile & Store")
)

$AppleVendorBlocks = @(New-HeaderBlocks `
  -Purpose "Provider summary for Apple Developer and App Store Connect." `
  -CanonicalSource "Vendors > Apple Developer & App Store Connect" `
  -ReadThisWhen "You need signing, distribution, or TestFlight ownership context." `
  -Sensitive "no") + @(
  (New-Bullet "Primary use: iOS signing, ad hoc installs, and future TestFlight distribution"),
  (New-Bullet "Project access: Access Index > Tall Man Training > Mobile & Store")
)

$NotionVendorBlocks = @(New-HeaderBlocks `
  -Purpose "Provider summary for Notion." `
  -CanonicalSource "Vendors > Notion" `
  -ReadThisWhen "You need workspace ownership or integration context." `
  -Sensitive "no") + @(
  (New-Bullet "Primary use: operational workspace, runbooks, access inventory, and planning context"),
  (New-Bullet "Sensitive values should still stay only in Access Index pages.")
)

Reset-Page -PageId $Ids.VendorDo -Title "DigitalOcean" -Blocks $DoVendorBlocks
Reset-Page -PageId $Ids.VendorCf -Title "Cloudflare" -Blocks $CfVendorBlocks
Reset-Page -PageId $Ids.VendorGh -Title "GitHub" -Blocks $GhVendorBlocks
Reset-Page -PageId $Ids.VendorExpo -Title "Expo & EAS" -Blocks $ExpoVendorBlocks
Reset-Page -PageId $Ids.VendorApple -Title "Apple Developer & App Store Connect" -Blocks $AppleVendorBlocks
Reset-Page -PageId $Ids.VendorNotion -Title "Notion" -Blocks $NotionVendorBlocks

$DeployRunbookBlocks = @(New-HeaderBlocks `
  -Purpose "Deploy Tall Man Training to test or production." `
  -CanonicalSource "Runbooks > Tall Man Training - Deploy" `
  -ReadThisWhen "You are preparing or executing a deploy." `
  -Sensitive "no") + @(
  (New-Bullet "Project: Tall Man Training"),
  (New-Bullet "Access page: Access Index > Tall Man Training > Hosting & Infra"),
  (New-Bullet "Primary commands: node scripts/deploy-runner.mjs test|prod or ./scripts/deploy.sh test|prod"),
  (New-Bullet "Verification: open the app shell, confirm login path, and confirm /api/health")
)

$RollbackRunbookBlocks = @(New-HeaderBlocks `
  -Purpose "Rollback the active Tall Man Training web release." `
  -CanonicalSource "Runbooks > Tall Man Training - Rollback" `
  -ReadThisWhen "A fresh deploy must be reverted to the previous known-good build." `
  -Sensitive "no") + @(
  (New-Bullet "Project: Tall Man Training"),
  (New-Bullet "Access page: Access Index > Tall Man Training > Hosting & Infra"),
  (New-Bullet "Rollback target: dist.prev on the appropriate droplet")
)

$BootstrapRunbookBlocks = @(New-HeaderBlocks `
  -Purpose "Bootstrap a new Tall Man Training server." `
  -CanonicalSource "Runbooks > Tall Man Training - Server Bootstrap" `
  -ReadThisWhen "You are provisioning or rebuilding a host for Tall Man Training." `
  -Sensitive "no") + @(
  (New-Bullet "Project: Tall Man Training"),
  (New-Bullet "Access page: Access Index > Tall Man Training > Hosting & Infra"),
  (New-Bullet "Expectations: Ubuntu host, /opt/tmt-app layout, Docker, Caddy, PocketBase, SSH alias wiring")
)

$BackupRunbookBlocks = @(New-HeaderBlocks `
  -Purpose "Back up or restore Tall Man Training PocketBase data." `
  -CanonicalSource "Runbooks > Tall Man Training - Backup & Recovery" `
  -ReadThisWhen "You are taking a pre-change backup or restoring after data loss or corruption." `
  -Sensitive "no") + @(
  (New-Bullet "Project: Tall Man Training"),
  (New-Bullet "Access page: Access Index > Tall Man Training > App & Backend"),
  (New-Bullet "Repo contract: docs/backup-and-recovery.md"),
  (New-Bullet "Operational detail lives here so the repo keeps only the stable recovery contract.")
)

Reset-Page -PageId $Ids.RunbookDeploy -Title "Tall Man Training - Deploy" -Blocks $DeployRunbookBlocks
Reset-Page -PageId $Ids.RunbookRollback -Title "Tall Man Training - Rollback" -Blocks $RollbackRunbookBlocks
Reset-Page -PageId $Ids.RunbookBootstrap -Title "Tall Man Training - Server Bootstrap" -Blocks $BootstrapRunbookBlocks
Reset-Page -PageId $BackupRunbookId -Title "Tall Man Training - Backup & Recovery" -Blocks $BackupRunbookBlocks

Write-Host "Notion documentation split applied."
