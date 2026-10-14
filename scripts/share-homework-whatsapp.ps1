param(
  [Parameter(Mandatory = $true)][string]$ImagePath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WhatsAppHomeworkFocus {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public static bool Focus(IntPtr hWnd) {
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    ShowWindow(hWnd, 9);
    return SetForegroundWindow(hWnd);
  }
}
"@

$image = [System.Drawing.Image]::FromFile($ImagePath)
try {
  [System.Windows.Forms.Clipboard]::SetImage($image)
} finally {
  $image.Dispose()
}

Start-Process "whatsapp://"

$window = $null
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 400
  $window = Get-Process | Where-Object {
    $_.MainWindowHandle -ne 0 -and (
      $_.ProcessName -like "*WhatsApp*" -or $_.MainWindowTitle -eq "WhatsApp"
    )
  } | Select-Object -First 1
  if ($null -ne $window) {
    break
  }
}

if ($null -eq $window) {
  exit 2
}

Start-Sleep -Seconds 1
$focused = [WhatsAppHomeworkFocus]::Focus([IntPtr]$window.MainWindowHandle)
if (-not $focused) {
  exit 2
}
Start-Sleep -Milliseconds 400
$shell = New-Object -ComObject WScript.Shell
# Open a new chat so the user chooses the person or group.
# The homework photo is already on the clipboard for Ctrl+V after that choice.
$shell.SendKeys("^n")
exit 0
