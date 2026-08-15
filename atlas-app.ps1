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

Write-Host ''
Write-Host 'ATLAS - Business Operating System'
Write-Host '---------------------------------'

# ── 1) 서버 확보 ──────────────────────────────────────────────────────────
$ownsServer = $false
$rootPid    = 0
$listenPid  = 0

$owner = Get-PortOwner
if ($owner) {
    $proc = Get-Process -Id $owner -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') {
        Write-Host "이미 실행 중인 ATLAS 서버를 그대로 사용합니다 (PID $owner)."
        Write-Host '중복 서버를 만들지 않고, 이 서버는 창을 닫아도 종료하지 않습니다.'
    } else {
        Write-Host "포트 $Port 를 ATLAS가 아닌 프로세스가 사용 중입니다 (PID $owner)."
        Write-Host '해당 프로그램을 먼저 종료한 뒤 다시 실행하십시오.'
        Start-Sleep -Seconds 6
        exit 1
    }
} else {
    Write-Host "ATLAS 서버를 시작합니다 (포트 $Port). 처음 실행은 시간이 조금 걸립니다..."
    $server = Start-Process -FilePath 'cmd.exe' `
                            -ArgumentList '/c', 'npm run dev' `
                            -WorkingDirectory $ProjectDir `
                            -WindowStyle Minimized `
                            -PassThru
    $ownsServer = $true
    $rootPid    = $server.Id

    $ready = $false
    for ($i = 0; $i -lt $ReadyTimeout; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Ready) { $ready = $true; break }
    }

    if (-not $ready) {
        Write-Host '서버가 제한 시간 안에 준비되지 않아 시작을 취소합니다.'
        Stop-AtlasServer -RootPid $rootPid -ListenPid 0 | Out-Null
        Start-Sleep -Seconds 6
        exit 1
    }

    $listenPid = Get-PortOwner
    Write-Host "서버 준비 완료 (PID $listenPid)."
}

# ── 2) 전용 앱 창 하나만 열기 ─────────────────────────────────────────────
$browser = Find-Browser
if (-not $browser) {
    Start-Process $Url
    Write-Host '전용 앱 창을 지원하는 브라우저를 찾지 못해 기본 브라우저로 열었습니다.'
    Write-Host '이 경우 창을 닫아도 서버는 자동 종료되지 않습니다. stop-atlas.bat 을 사용하십시오.'
    Start-Sleep -Seconds 8
    exit 0
}

if (-not (Test-Path $ProfileDir)) {
    New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
}

# 전용 프로필을 쓰는 이유:
#  - 평소 쓰는 Chrome 프로필과 완전히 분리돼 기존 로그인/세션을 건드리지 않는다.
#  - 전용 프로필이면 chrome.exe 가 기존 Chrome 에 위임하지 않고 스스로 살아 있어,
#    이 창이 닫히는 시점을 WaitForExit 로 정확히 감지할 수 있다.
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
$app = Start-Process -FilePath $browser -ArgumentList $browserArgs -PassThru
$app.WaitForExit()

# ── 3) 창이 닫히면 우리가 시작한 서버만 종료 ──────────────────────────────
Write-Host ''
if (-not $ownsServer) {
    Write-Host '창을 닫았습니다. 이 서버는 ATLAS가 시작한 것이 아니므로 그대로 둡니다.'
    Start-Sleep -Seconds 3
    exit 0
}

Write-Host 'ATLAS 서버를 종료하는 중입니다...'
$stopped = Stop-AtlasServer -RootPid $rootPid -ListenPid $listenPid

if ($stopped) {
    Write-Host "포트 $Port 해제를 확인했습니다. ATLAS를 종료합니다."
    Start-Sleep -Seconds 2
    exit 0
} else {
    $left = Get-PortOwner
    Write-Host "서버가 아직 남아 있습니다 (PID $left). stop-atlas.bat 을 실행해 주십시오."
    Start-Sleep -Seconds 8
    exit 1
}
