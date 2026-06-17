<#
.SYNOPSIS
  SMS Bridge - Sends SMS from queue via Android phone connected over ADB.
.DESCRIPTION
  Monitors data/sms-outbox.json for pending SMS and sends them through
  a connected Android device using ADB.
  
  REQUIREMENTS:
  1. Android Phone with JIO SIM
  2. USB Debugging enabled on phone
  3. Platform Tools (ADB) installed: https://developer.android.com/studio/releases/platform-tools
  4. Phone connected via USB and authorized (run 'adb devices' to verify)
  5. TERMUX + termux-api installed on phone (recommended) OR use direct ADB method
  
  USAGE:
    .\sms-bridge.ps1 -AdbPath "C:\platform-tools\adb.exe"
    .\sms-bridge.ps1 -Method termux -PollInterval 3
#>

param(
    [string]$AdbPath = "adb",
    [ValidateSet("termux", "direct")]
    [string]$Method = "termux",
    [int]$PollInterval = 3,
    [string]$DataDir = ""
)

if (-not $DataDir) {
    $DataDir = Join-Path $PSScriptRoot "data"
}
$OutboxFile = Join-Path $DataDir "sms-outbox.json"

function Write-Log($msg) {
    $time = Get-Date -Format "HH:mm:ss"
    Write-Host "[$time] $msg"
}

function Test-Adb {
    $result = & $AdbPath devices 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Log "ERROR: ADB not found at '$AdbPath'"
        Write-Log "Download from: https://developer.android.com/studio/releases/platform-tools"
        return $false
    }
    $devices = $result | Select-String -Pattern "device$" | ForEach-Object { $_ -split "\s+" | Select-Object -First 1 }
    if (-not $devices) {
        Write-Log "ERROR: No Android device connected. Run 'adb devices' to check."
        return $false
    }
    Write-Log "Connected: $($devices -join ', ')"
    return $true
}

function Send-SmsTermux($phone, $message) {
    $escapedMessage = $message -replace "'", "'\''"
    $result = & $AdbPath shell termux-sms-send -n "$phone" "$escapedMessage" 2>&1
    return $LASTEXITCODE -eq 0
}

function Send-SmsDirect($phone, $message) {
    $intentUri = "sms:$phone"
    $result = & $AdbPath shell am start -a android.intent.action.SENDTO -d $intentUri --es sms_body "$message" --ez exit_on_sent true 2>&1
    Start-Sleep -Milliseconds 1500
    & $AdbPath shell input keyevent 22 2>$null
    Start-Sleep -Milliseconds 200
    & $AdbPath shell input keyevent 23 2>$null
    Start-Sleep -Milliseconds 1000
    & $AdbPath shell input keyevent 4 2>$null
    return $true
}

# === MAIN ===
Write-Log "========================================"
Write-Log " SMS Bridge - ADB to JIO SMS Sender"
Write-Log " Method: $Method | Poll: ${PollInterval}s"
Write-Log " Outbox: $OutboxFile"
Write-Log "========================================"

if (-not (Test-Adb)) {
    Write-Log "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

while ($true) {
    try {
        if (-not (Test-Path $OutboxFile)) {
            Start-Sleep -Seconds $PollInterval
            continue
        }

        $outbox = Get-Content $OutboxFile -Raw | ConvertFrom-Json
        $pending = $outbox | Where-Object { -not $_.sent -and $_.attempts -lt 3 }
        $changed = $false

        foreach ($item in $pending) {
            $phone = $item.phone
            $message = $item.message
            Write-Log "Sending to +91$phone..."

            $ok = if ($Method -eq "termux") {
                Send-SmsTermux $phone $message
            } else {
                Send-SmsDirect $phone $message
            }

            if ($ok) {
                $item.sent = $true
                $item.sent_at = (Get-Date -Format "o")
                Write-Log "SENT to +91$phone"
            } else {
                $item.attempts = [int]$item.attempts + 1
                Write-Log "FAILED to +91$phone (attempt $($item.attempts))"
            }
            $changed = $true
        }

        if ($changed) {
            $outbox | ConvertTo-Json -Depth 5 | Set-Content $OutboxFile
        }
    } catch {
        Write-Log "ERROR: $_"
    }

    Start-Sleep -Seconds $PollInterval
}
