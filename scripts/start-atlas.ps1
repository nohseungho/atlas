# ATLAS Windows launcher. Double-click ATLAS.cmd; VS Code and manual npm commands are unnecessary.
$ErrorActionPreference = 'Stop'
$atlasRoot = Split-Path -Parent $PSScriptRoot
$operateUrl = 'http://localhost:3002/atlas/operate'

function Test-Atlas {
    try {
        $response = Invoke-RestMethod -Uri 'http://localhost:3002/api/atlas/operate' -TimeoutSec 3
        return $response.status -eq 'ok' -and $null -ne $response.state.korea_naver -and $null -ne $response.state.global_blogger
    } catch { return $false }
}

function Test-Comfy {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8188/system_stats' -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch { return $false }
}

function Start-LocalComfyIfInstalled {
    if (Test-Comfy) { return }
    $locations = @(
        $env:ATLAS_COMFY_DIR,
        (Join-Path $env:USERPROFILE 'ComfyUI'),
        (Join-Path (Split-Path -Parent $atlasRoot) 'ComfyUI')
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
    foreach ($location in $locations) {
        $main = Join-Path $location 'main.py'
        $python = Join-Path $location 'venv\Scripts\python.exe'
        if ((Test-Path $main) -and (Test-Path $python)) {
            $command = '"' + $python + '" "' + $main + '" --listen 127.0.0.1 --port 8188 --lowvram'
            Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $command) -WorkingDirectory $location -WindowStyle Minimized
            Write-Host '로컬 이미지 생성기를 시작했습니다.'
            return
        }
    }
    Write-Host 'ComfyUI 설치 위치를 찾지 못했습니다. ATLAS 화면에 이미지 제작 대기 상태가 표시됩니다.'
}

function Repair-ExistingAtlasShortcut {
    # Keep the user's existing desktop icon and point it to this launcher.
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop -or -not (Test-Path $desktop)) { return }
    $shell = New-Object -ComObject WScript.Shell
    $shortcuts = Get-ChildItem -LiteralPath $desktop -Filter '*.lnk' -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -match '^(ATLAS|아트라스)\s*-\s*(Chrome|크롬)$' }
    foreach ($file in $shortcuts) {
        $shortcut = $shell.CreateShortcut($file.FullName)
        $shortcut.TargetPath = Join-Path $atlasRoot 'ATLAS.cmd'
        $shortcut.WorkingDirectory = $atlasRoot
        $shortcut.Description = 'ATLAS 국내·해외 블로그 운영'
        $shortcut.Save()
        Write-Host '기존 바탕화면 ATLAS 바로가기를 실행기에 연결했습니다.'
    }
}

try {
    if (-not (Test-Atlas)) {
        $occupied = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
        if ($occupied) { throw '3002 포트를 다른 프로그램이 사용 중입니다. ATLAS가 아닌 서버를 종료한 뒤 다시 여세요.' }
        if (-not (Get-Command 'node.exe' -ErrorAction SilentlyContinue) -or -not (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue)) {
            throw 'Node.js와 npm을 찾지 못했습니다. 이 PC의 Node.js 설치 상태를 확인하세요.'
        }
        Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', 'npm run dev') -WorkingDirectory $atlasRoot -WindowStyle Minimized
        $ready = $false
        for ($attempt = 0; $attempt -lt 90; $attempt++) {
            Start-Sleep -Seconds 1
            if (Test-Atlas) { $ready = $true; break }
        }
        if (-not $ready) { throw 'ATLAS가 90초 안에 시작되지 않았습니다. 최소화된 ATLAS 창의 오류를 확인하세요.' }
    }

    Start-LocalComfyIfInstalled
    Repair-ExistingAtlasShortcut
    Start-Process $operateUrl
    Write-Host 'ATLAS 운영 화면을 열었습니다.'
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
