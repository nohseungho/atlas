# ATLAS 통합 실행기
#
# 바탕화면 "ATLAS" 바로가기 -> start-atlas.bat -> 이 스크립트.
# 서버를 시작하고, 준비되면 "블로그 글 만들기"를 전용 앱 창으로 하나만 연다.
# 그 창이 닫히면 이 스크립트가 직접 시작한 서버 프로세스 트리만 종료한다.
#
# 원칙:
#  - 이 스크립트가 시작하지 않은 서버는 절대 종료하지 않는다.
#  - node.exe / chrome.exe 를 이름으로 일괄 종료하지 않는다. 항상 PID 트리로만 다룬다.
#  - 비정상 종료 대비 수동 종료 수단으로 stop-atlas.bat 을 그대로 남겨 둔다.

$ErrorActionPreference = 'Continue'

$Port         = 3002
$StartPath    = '/atlas/revenue'
$ProjectDir   = $PSScriptRoot
$Url          = "http://localhost:$Port$StartPath"
$ProfileDir   = Join-Path $env:LOCALAPPDATA 'ATLAS\chrome-profile'
$ReadyTimeout = 150
$LogPath      = Join-Path $env:LOCALAPPDATA 'ATLAS\launcher.log'

# 단계와 종료 사유만 남긴다. 토큰·환경변수·비밀정보는 기록하지 않는다.
function Write-Log {
    param([string]$Message, [switch]$Quiet)
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $PID, $Message
    # 여러 런처가 동시에 돌 수 있어 파일이 잠길 수 있다. 몇 번 다시 시도한다.
    for ($try = 0; $try -lt 4; $try++) {
        try {
            $dir = Split-Path $LogPath -Parent
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            Add-Content -LiteralPath $LogPath -Value $line -Encoding utf8 -ErrorAction Stop
            break
        } catch {
            Start-Sleep -Milliseconds 120
        }
    }
    if (-not $Quiet) { Write-Host $Message }
}

# 전용 프로필을 쓰는 chrome.exe 들. --type= 이 없는 것이 실제 브라우저(창 소유)
# 프로세스이고, 나머지는 렌더러/GPU 같은 자식이다.
function Get-ProfileChrome {
    $all = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue |
           Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ProfileDir) }
    $browsers = @($all | Where-Object { $_.CommandLine -notmatch '--type=' })
    return [pscustomobject]@{
        All      = @($all)
        Browsers = $browsers
        Count    = @($all).Count
        BrowserPids = @($browsers | ForEach-Object { [int]$_.ProcessId })
    }
}

function Get-PortOwner {
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
         Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess }
    return $null
}

function Test-Ready {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        return ($r.StatusCode -eq 200)
    } catch {
        return $false
    }
}

function Invoke-TaskKill {
    param([int]$TargetPid, [switch]$Force)
    if (-not $TargetPid) { return }
    if ($Force) { $flags = "/PID $TargetPid /T /F" } else { $flags = "/PID $TargetPid /T" }
    & cmd.exe /c "taskkill $flags >nul 2>&1"
}

function Wait-PortReleased {
    param([int]$Seconds = 8)
    for ($i = 0; $i -lt $Seconds; $i++) {
        Start-Sleep -Seconds 1
        if (-not (Get-PortOwner)) { return $true }
    }
    return $false
}

# 이 스크립트가 띄운 서버만 종료한다.
#  RootPid   : Start-Process 로 직접 띄운 cmd.exe (npm run dev 트리의 뿌리)
#  ListenPid : 준비 완료 시점에 포트를 실제로 잡고 있던 PID (그 트리의 자손)
function Stop-AtlasServer {
    param([int]$RootPid, [int]$ListenPid)

    # 1단계: 트리 정상 종료
    Invoke-TaskKill -TargetPid $RootPid
    if (Wait-PortReleased -Seconds 8) { return $true }

    # 2단계: 같은 트리만 강제 종료
    Invoke-TaskKill -TargetPid $RootPid -Force
    if (Wait-PortReleased -Seconds 8) { return $true }

    # 3단계: 중간 부모가 먼저 사라져 트리가 끊긴 경우.
    # 우리가 준비 시점에 확인해 둔 그 PID가 아직 포트를 잡고 있을 때만 종료한다.
    $now = Get-PortOwner
    if ($now -and $ListenPid -and ($now -eq $ListenPid)) {
        Invoke-TaskKill -TargetPid $ListenPid -Force
        if (Wait-PortReleased -Seconds 5) { return $true }
    }

    return (-not (Get-PortOwner))
}

function Find-Browser {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    )
    foreach ($p in $candidates) {
        if ($p -and (Test-Path $p)) { return $p }
    }
    return $null
}

# 이 스크립트가 직접 띄운 서버. 준비될 때까지 기다렸다가 PID를 돌려준다.
function Start-OwnedServer {
    Write-Log "서버 시작 (포트 $Port)"
    $server = Start-Process -FilePath 'cmd.exe' `
                            -ArgumentList '/c', 'npm run dev' `
                            -WorkingDirectory $ProjectDir `
                            -WindowStyle Minimized `
                            -PassThru
    Write-Log "서버 root cmd PID $($server.Id)" -Quiet
    for ($i = 0; $i -lt $ReadyTimeout; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Ready) {
            $lp = Get-PortOwner
            Write-Log "서버 준비 완료 — 리스닝 PID $lp (root cmd PID $($server.Id))"
            return @{ Ok = $true; RootPid = [int]$server.Id; ListenPid = [int]$lp }
        }
    }
    return @{ Ok = $false; RootPid = [int]$server.Id; ListenPid = 0 }
}

Write-Host ''
Write-Host 'ATLAS - Business Operating System'
Write-Host '---------------------------------'
Write-Log '--- ATLAS 실행 시작 ---' -Quiet

# ── 1) 서버 확보 ──────────────────────────────────────────────────────────
$ownsServer = $false
$rootPid    = 0
$listenPid  = 0
$reuse      = $false

$owner = Get-PortOwner
if ($owner) {
    $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
    if (-not ($proc -and $proc.ProcessName -eq 'node')) {
        Write-Log "포트 $Port 를 ATLAS가 아닌 프로세스가 사용 중입니다 (PID $owner). (종료 사유: 포트 충돌)"
        Write-Host '해당 프로그램을 먼저 종료한 뒤 다시 실행하십시오.'
        Start-Sleep -Seconds 6
        exit 1
    }
    # 포트를 쥐고 있다고 바로 재사용하면 안 된다. 직전 세션이 창을 닫고 서버를
    # 정리하는 중이면, 곧 죽을 서버를 붙잡은 채 창만 남아 빈 화면이 된다.
    if (Test-Ready) {
        $reuse = $true
        Write-Log "기존 서버 재사용 (PID $owner) — 소유권 없음, 창을 닫아도 종료하지 않음"
        Write-Host '중복 서버를 만들지 않습니다.'
    } else {
        Write-Log "포트 $Port 가 잡혀 있으나 응답이 없습니다 — 직전 세션 종료 중으로 보고 기다립니다."
    }
}

if (-not $reuse) {
    # 이전 세션의 종료가 끝나 포트가 풀릴 때까지 기다린다.
    for ($i = 0; $i -lt 30; $i++) {
        if (-not (Get-PortOwner)) { break }
        Start-Sleep -Seconds 1
    }
    $still = Get-PortOwner
    if ($still) {
        Write-Log "포트 $Port 가 계속 사용 중입니다 (PID $still). (종료 사유: 포트 미해제)"
        Write-Host 'stop-atlas.bat 을 실행한 뒤 다시 시작하십시오.'
        Start-Sleep -Seconds 8
        exit 1
    }

    Write-Host '처음 실행은 시간이 조금 걸립니다...'
    $started = Start-OwnedServer
    $ownsServer = $true
    $rootPid    = $started.RootPid
    $listenPid  = $started.ListenPid
    if (-not $started.Ok) {
        Write-Log '서버가 제한 시간 안에 준비되지 않았습니다. (종료 사유: 서버 준비 실패)'
        Stop-AtlasServer -RootPid $rootPid -ListenPid 0 | Out-Null
        Start-Sleep -Seconds 6
        exit 1
    }
}

# ── 2) 전용 앱 창 하나만 열기 ─────────────────────────────────────────────
$browser = Find-Browser
if (-not $browser) {
    Start-Process $Url
    Write-Log '전용 앱 창을 지원하는 브라우저를 찾지 못해 기본 브라우저로 열었습니다. (종료 사유: 브라우저 없음)'
    Write-Host '이 경우 창을 닫아도 서버는 자동 종료되지 않습니다. stop-atlas.bat 을 사용하십시오.'
    Start-Sleep -Seconds 8
    exit 0
}

if (-not (Test-Path $ProfileDir)) {
    New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
}

# 전용 프로필을 쓰는 이유:
#  - 평소 쓰는 Chrome 프로필과 완전히 분리돼 기존 로그인/세션을 건드리지 않는다.
#  - 매번 지우지 않고 재사용하므로 앱 창 안에서 한 로그인도 다음 실행까지 유지된다.
$browserArgs = @(
    "--app=$Url",
    "--user-data-dir=$ProfileDir",
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,960'
)

Write-Host ''
Write-Host '블로그 글 만들기 창을 엽니다.'
if ($ownsServer) {
    Write-Host '이 창을 닫으면 ATLAS 서버도 함께 종료됩니다.'
}

$before = Get-ProfileChrome
Write-Log "chrome 실행 직전: 전용 프로필 chrome $($before.Count)개, 브라우저 PID [$($before.BrowserPids -join ',')]" -Quiet
$app = Start-Process -FilePath $browser -ArgumentList $browserArgs -PassThru
Write-Log "chrome 시작 PID $($app.Id) (bootstrap 일 수 있음)" -Quiet

# ── 3) 실제 앱 창을 확인하기 전에는 종료 판정을 하지 않는다 ────────────────
# 우리가 띄운 chrome.exe 는 이미 떠 있는 같은 프로필 인스턴스에 "창 하나 열어라"만
# 넘기고 0초 만에 끝나는 bootstrap 인 경우가 있다. 그 종료를 "사용자가 창을 닫았다"로
# 읽으면, 창은 멀쩡히 열려 있는데 방금 띄운 서버만 죽는다 — 이것이 창이 열리자마자
# 못 쓰게 되던 원인이다. 그래서 PID 하나가 아니라 "전용 프로필을 쓰는 브라우저
# 프로세스가 하나라도 살아 있는가"로 판정한다.
$appPids = @()
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 1
    $now = Get-ProfileChrome
    if ($now.BrowserPids.Count -gt 0) { $appPids = $now.BrowserPids; break }
}

if ($appPids.Count -eq 0) {
    Write-Log '앱 창을 확인하지 못했습니다. (종료 사유: 앱 창 미확인)'
    if ($ownsServer) { Stop-AtlasServer -RootPid $rootPid -ListenPid $listenPid | Out-Null }
    Start-Sleep -Seconds 8
    exit 1
}
Write-Log "앱 창 확인 — 브라우저 PID [$($appPids -join ',')]"

# 창은 떴는데 붙잡고 있던 서버가 사라진 경우(직전 세션 종료와 겹친 경우) 되살린다.
if (-not $ownsServer -and -not (Test-Ready)) {
    Write-Log '재사용하려던 서버가 사라졌습니다. 새 서버를 시작합니다.'
    for ($i = 0; $i -lt 30; $i++) {
        if (-not (Get-PortOwner)) { break }
        Start-Sleep -Seconds 1
    }
    if (-not (Get-PortOwner)) {
        $revive = Start-OwnedServer
        if ($revive.Ok) {
            $ownsServer = $true
            $rootPid    = $revive.RootPid
            $listenPid  = $revive.ListenPid
            Write-Host '서버를 다시 시작했습니다. 창에서 새로고침(F5)을 눌러 주세요.'
        } else {
            Write-Log '서버를 되살리지 못했습니다.' -Quiet
        }
    }
}

# ── 4) 창이 모두 닫힐 때까지 기다린다 ─────────────────────────────────────
# 전용 프로필 브라우저 프로세스가 하나라도 남아 있으면 서버를 종료하지 않는다.
while ($true) {
    Start-Sleep -Seconds 2
    if ((Get-ProfileChrome).BrowserPids.Count -eq 0) { break }
}
Write-Log '전용 프로필 앱 창이 모두 닫혔습니다.'

# ── 5) 우리가 시작한 서버만 종료 ──────────────────────────────────────────
Write-Host ''
if (-not $ownsServer) {
    Write-Log '창을 닫았습니다. 이 서버는 ATLAS가 시작한 것이 아니므로 그대로 둡니다. (종료 사유: 소유권 없음)'
    Start-Sleep -Seconds 3
    exit 0
}

Write-Log "ATLAS 서버를 종료합니다 (root cmd PID $rootPid, 리스닝 PID $listenPid)."
$stopped = Stop-AtlasServer -RootPid $rootPid -ListenPid $listenPid

if ($stopped) {
    Write-Log "포트 $Port 해제를 확인했습니다. (종료 사유: 사용자가 창을 닫음)"
    Start-Sleep -Seconds 2
    exit 0
} else {
    $left = Get-PortOwner
    Write-Log "서버가 아직 남아 있습니다 (PID $left). (종료 사유: 포트 해제 실패)"
    Write-Host 'stop-atlas.bat 을 실행해 주십시오.'
    Start-Sleep -Seconds 8
    exit 1
}
