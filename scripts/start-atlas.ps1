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
            $arguments = @('"' + $main + '"', '--listen', '127.0.0.1', '--port', '8188', '--lowvram')
            $engine = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $location -WindowStyle Minimized -PassThru
            for ($attempt = 0; $attempt -lt 90; $attempt++) {
                if (Test-Comfy) { Write-Host 'Local image engine is ready.'; return }
                if ($engine.HasExited) { Write-Warning 'Local image engine stopped during startup. Check its window.'; return }
                Start-Sleep -Seconds 1
            }
            Write-Warning 'Local image engine is still starting. Refresh ATLAS when it becomes ready.'
            return
        }
    }
}

function Repair-ExistingAtlasShortcut {
    # Keep the user's existing desktop icon and point it to this launcher.
    $desktop = [Environment]::GetFolderPath('Desktop')
    if (-not $desktop -or -not (Test-Path $desktop)) { return }
    $shell = New-Object -ComObject WScript.Shell
    $shortcuts = Get-ChildItem -LiteralPath $desktop -Filter '*.lnk' -ErrorAction SilentlyContinue |
        Where-Object { $_.BaseName -match '^ATLAS\s*-\s*Chrome$' }
    foreach ($file in $shortcuts) {
        $shortcut = $shell.CreateShortcut($file.FullName)
        $shortcut.TargetPath = Join-Path $atlasRoot 'ATLAS.cmd'
        $shortcut.WorkingDirectory = $atlasRoot
        $shortcut.Description = 'ATLAS blog operations'
        $shortcut.Save()
        Write-Host 'Existing ATLAS desktop shortcut is connected.'
    }
}

try {
    if (-not (Test-Atlas)) {
        $occupied = Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue
        if ($occupied) { throw 'Port 3002 is already used by another program.' }
        if (-not (Get-Command 'node.exe' -ErrorAction SilentlyContinue) -or -not (Get-Command 'npm.cmd' -ErrorAction SilentlyContinue)) {
            throw 'Node.js and npm are not available on this PC.'
        }
        Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', 'npm run dev') -WorkingDirectory $atlasRoot -WindowStyle Minimized
        $ready = $false
        for ($attempt = 0; $attempt -lt 90; $attempt++) {
            Start-Sleep -Seconds 1
            if (Test-Atlas) { $ready = $true; break }
        }
        if (-not $ready) { throw 'ATLAS did not start within 90 seconds. Check the minimized server window.' }
    }

    Start-LocalComfyIfInstalled
    Repair-ExistingAtlasShortcut
    Start-Process $operateUrl
    Write-Host 'ATLAS is open.'
} catch {
    Write-Error $_.Exception.Message
    exit 1
}
