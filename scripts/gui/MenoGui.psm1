# Driving the built app on a real desktop: find its window, take its picture,
# and work it with the pointer and keyboard the way a person would.
#
# Every function here speaks in the window's own client coordinates, so a
# scenario can be written against what a screenshot shows rather than against
# where the window happens to sit. See README.md for the verbs a sibling
# implementation on another platform has to provide.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

Add-Type -TypeDefinition @'
using System;
using System.Drawing;
using System.Runtime.InteropServices;

public static class NativeGui {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }

  [DllImport("user32.dll", SetLastError = true)] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("kernel32.dll")] public static extern void Sleep(uint ms);

  // Windows hands a process that has not said otherwise a pretend desktop,
  // scaled down by the display's scaling factor, and window positions come
  // back in those pretend pixels while a screen grab is taken in real ones.
  // On a 175% display that is a capture offset by a third of the window.
  // Say we understand the real thing, before anything asks where a window is.
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

  public static void BeDpiAware() {
    try {
      // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
      if (SetProcessDpiAwarenessContext(new IntPtr(-4))) return;
    } catch (EntryPointNotFoundException) { }
    SetProcessDPIAware();
  }
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern uint SendInput(uint n, INPUT[] p, int size);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern IntPtr SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);

  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)]
  public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)]
  public struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public MOUSEINPUT mi;
    [FieldOffset(8)] public KEYBDINPUT ki;
  }

  const uint INPUT_MOUSE = 0, INPUT_KEYBOARD = 1;
  const uint MOUSEEVENTF_MOVE = 0x0001, MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
  const uint MOUSEEVENTF_ABSOLUTE = 0x8000, MOUSEEVENTF_VIRTUALDESK = 0x4000, MOUSEEVENTF_WHEEL = 0x0800;
  const uint KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_UNICODE = 0x0004;

  // Absolute mouse input is in 0..65535 over the whole virtual desktop, not
  // in pixels, and not over the primary screen alone.
  static void Normalise(int x, int y, out int nx, out int ny) {
    int vx = GetSystemMetrics(76), vy = GetSystemMetrics(77);   // SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN
    int vw = GetSystemMetrics(78), vh = GetSystemMetrics(79);   // SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN
    nx = (int)Math.Round((x - vx) * 65535.0 / Math.Max(1, vw - 1));
    ny = (int)Math.Round((y - vy) * 65535.0 / Math.Max(1, vh - 1));
  }

  static void Send(INPUT[] inputs) {
    uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
    if (sent != inputs.Length) throw new InvalidOperationException("SendInput sent " + sent + " of " + inputs.Length);
  }

  static INPUT Mouse(uint flags, int x, int y, uint data) {
    int nx, ny; Normalise(x, y, out nx, out ny);
    INPUT i = new INPUT(); i.type = INPUT_MOUSE;
    i.mi.dx = nx; i.mi.dy = ny; i.mi.mouseData = data;
    i.mi.dwFlags = flags | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK;
    return i;
  }

  public static void MoveTo(int x, int y) { Send(new[] { Mouse(MOUSEEVENTF_MOVE, x, y, 0) }); }
  public static void LeftDown(int x, int y) { Send(new[] { Mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_LEFTDOWN, x, y, 0) }); }
  public static void LeftUp(int x, int y) { Send(new[] { Mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_LEFTUP, x, y, 0) }); }
  public static void Wheel(int x, int y, int notches) { Send(new[] { Mouse(MOUSEEVENTF_WHEEL, x, y, (uint)(notches * 120)) }); }

  // Text goes in as Unicode scan codes, so it does not depend on the
  // keyboard layout the machine happens to have.
  public static void TypeChar(char c) {
    INPUT down = new INPUT(); down.type = INPUT_KEYBOARD; down.ki.wScan = c; down.ki.dwFlags = KEYEVENTF_UNICODE;
    INPUT up = down; up.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
    Send(new[] { down, up });
  }

  public static void TapKey(ushort vk) {
    INPUT down = new INPUT(); down.type = INPUT_KEYBOARD; down.ki.wVk = vk;
    INPUT up = down; up.ki.dwFlags = KEYEVENTF_KEYUP;
    Send(new[] { down, up });
  }

  // Windows only lets the process that owns the foreground put a window
  // there. A process that has just sent input counts as one the user is
  // driving, so a keystroke nobody uses buys the right to raise the window.
  public static bool Raise(IntPtr h) {
    INPUT nudge = new INPUT();
    nudge.type = INPUT_KEYBOARD; nudge.ki.wVk = 0x12; nudge.ki.dwFlags = KEYEVENTF_KEYUP;  // VK_MENU up
    Send(new[] { nudge });
    for (int i = 0; i < 20; i++) {
      SetForegroundWindow(h);
      if (GetForegroundWindow() == h) return true;
      Sleep(50);
    }
    return false;
  }
}
'@ -ReferencedAssemblies System.Drawing, System.Windows.Forms

# Before any window is measured or any pixel read.
[NativeGui]::BeDpiAware()

$script:Window = [IntPtr]::Zero

function Get-MenoBuild {
    # Where `npm run tauri build` leaves the app on this platform.
    return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../../src-tauri/target/release/Meno.exe"))
}

function Start-MenoProcess {
    param([Parameter(Mandatory)] [string] $Path)
    Start-Process -FilePath $Path | Out-Null
}

function Close-MenoProcess {
    <#
      .SYNOPSIS
      Ask a running copy to close its window, and put it down if it will not.
    #>
    param([Parameter(Mandatory)] [System.Diagnostics.Process] $Process)
    $Process.CloseMainWindow() | Out-Null
    if (-not $Process.WaitForExit(4000)) { $Process.Kill() }
}

function Complete-FileDialog {
    <#
      .SYNOPSIS
      The system's open dialog is on its way up: choose this file in it.

      .DESCRIPTION
      It opens with the focus in its name field, which takes a whole path.
    #>
    param([Parameter(Mandatory)] [string] $Path)
    Start-Sleep -Milliseconds 1800
    Send-MenoText -Text $Path
    Send-MenoKey -Key Enter
    Start-Sleep -Milliseconds 1500
}

function Get-MenoWindow {
    <#
      .SYNOPSIS
      The main window of a running process, waited for rather than assumed:
      a freshly started app has no window for a second or two.
    #>
    param(
        [string] $ProcessName = "Meno",
        [int] $TimeoutSec = 30
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $p = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -ne 0 } |
            Select-Object -First 1
        if ($p) {
            $script:Window = $p.MainWindowHandle
            return $script:Window
        }
        Start-Sleep -Milliseconds 250
    }
    throw "no window for process '$ProcessName' after ${TimeoutSec}s"
}

function Set-MenoWindow {
    <#
      .SYNOPSIS
      Bring the window forward and put it at a known size, so that a
      screenshot taken now and one taken next week can be compared.
    #>
    param(
        [int] $Width = 1280,
        [int] $Height = 860,
        [int] $Left = 40,
        [int] $Top = 40
    )
    if ($script:Window -eq [IntPtr]::Zero) { throw "call Get-MenoWindow first" }
    if ([NativeGui]::IsIconic($script:Window)) { [NativeGui]::ShowWindow($script:Window, 9) | Out-Null }  # SW_RESTORE
    # SWP_NOZORDER is deliberately not set: the window has to be on top for
    # the screen to hold its picture at all.
    [NativeGui]::SetWindowPos($script:Window, [IntPtr]::Zero, $Left, $Top, $Width, $Height, 0x0040) | Out-Null
    if (-not [NativeGui]::Raise($script:Window)) {
        throw "the window would not come to the front. A capture would then show whatever is over it, so there is no point going on: check that the desktop is unlocked and that nothing is holding the foreground."
    }
    Start-Sleep -Milliseconds 400
}

function Get-ClientOrigin {
    # Where the window's drawing area starts on the screen.
    $p = New-Object NativeGui+POINT
    $p.X = 0; $p.Y = 0
    [NativeGui]::ClientToScreen($script:Window, [ref] $p) | Out-Null
    return @{ X = $p.X; Y = $p.Y }
}

function Get-ClientSize {
    $r = New-Object NativeGui+RECT
    [NativeGui]::GetClientRect($script:Window, [ref] $r) | Out-Null
    return @{ Width = $r.Right - $r.Left; Height = $r.Bottom - $r.Top }
}

function ConvertTo-Screen {
    param([int] $X, [int] $Y)
    $o = Get-ClientOrigin
    return @{ X = $o.X + $X; Y = $o.Y + $Y }
}

function Save-MenoShot {
    <#
      .SYNOPSIS
      The window's drawing area, as it is on screen.

      .DESCRIPTION
      Off the screen rather than out of the window, on purpose: PrintWindow
      hands back a black rectangle where the page is drawn with the GPU, which
      is every part of this app worth looking at. The window therefore has to
      be unoccluded, and the desktop unlocked.
    #>
    param([Parameter(Mandatory)] [string] $Path)
    $o = Get-ClientOrigin
    $s = Get-ClientSize
    if ($s.Width -le 0 -or $s.Height -le 0) { throw "the window has no drawing area" }
    $bmp = New-Object System.Drawing.Bitmap $s.Width, $s.Height
    try {
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.CopyFromScreen($o.X, $o.Y, 0, 0, (New-Object System.Drawing.Size $s.Width, $s.Height))
        } finally { $g.Dispose() }
        $dir = Split-Path -Parent $Path
        if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
        $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bmp.Dispose() }
    return $Path
}

function Invoke-MenoClick {
    param([Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y, [int] $Count = 1)
    $p = ConvertTo-Screen $X $Y
    for ($i = 0; $i -lt $Count; $i++) {
        [NativeGui]::LeftDown($p.X, $p.Y)
        Start-Sleep -Milliseconds 30
        [NativeGui]::LeftUp($p.X, $p.Y)
        if ($i -lt $Count - 1) { Start-Sleep -Milliseconds 90 }
    }
    Start-Sleep -Milliseconds 120
}

function Invoke-MenoDrag {
    <#
      .SYNOPSIS
      Press, travel, release - with the travel broken into steps.

      .DESCRIPTION
      A jump straight from one point to the other is a single pointermove, and
      the editor asks for several: it waits a few pixels before it calls a
      press a drag at all, and the preview it draws follows the moves rather
      than the release.
    #>
    param(
        [Parameter(Mandatory)] [int] $FromX, [Parameter(Mandatory)] [int] $FromY,
        [Parameter(Mandatory)] [int] $ToX, [Parameter(Mandatory)] [int] $ToY,
        [int] $Steps = 12,
        [int] $StepMs = 25,
        [scriptblock] $AtStep
    )
    $a = ConvertTo-Screen $FromX $FromY
    [NativeGui]::MoveTo($a.X, $a.Y)
    Start-Sleep -Milliseconds 80
    [NativeGui]::LeftDown($a.X, $a.Y)
    Start-Sleep -Milliseconds 80
    for ($i = 1; $i -le $Steps; $i++) {
        $t = $i / $Steps
        $p = ConvertTo-Screen ([int]($FromX + ($ToX - $FromX) * $t)) ([int]($FromY + ($ToY - $FromY) * $t))
        [NativeGui]::MoveTo($p.X, $p.Y)
        Start-Sleep -Milliseconds $StepMs
        if ($AtStep) { & $AtStep $i }
    }
    $b = ConvertTo-Screen $ToX $ToY
    [NativeGui]::LeftUp($b.X, $b.Y)
    Start-Sleep -Milliseconds 200
}

function Invoke-MenoWheel {
    param([Parameter(Mandatory)] [int] $X, [Parameter(Mandatory)] [int] $Y, [int] $Notches = 1)
    $p = ConvertTo-Screen $X $Y
    [NativeGui]::MoveTo($p.X, $p.Y)
    Start-Sleep -Milliseconds 60
    [NativeGui]::Wheel($p.X, $p.Y, $Notches)
    Start-Sleep -Milliseconds 200
}

function Send-MenoText {
    param([Parameter(Mandatory)] [string] $Text, [int] $CharMs = 8)
    foreach ($c in $Text.ToCharArray()) {
        [NativeGui]::TypeChar($c)
        Start-Sleep -Milliseconds $CharMs
    }
}

function Send-MenoKey {
    param([Parameter(Mandatory)] [ValidateSet("Enter", "Escape", "Tab", "Backspace")] [string] $Key)
    $vk = @{ Enter = 0x0D; Escape = 0x1B; Tab = 0x09; Backspace = 0x08 }[$Key]
    [NativeGui]::TapKey([ushort] $vk)
    Start-Sleep -Milliseconds 150
}

function Wait-MenoSettled {
    <#
      .SYNOPSIS
      Wait until the drawing stops changing, rather than sleeping a guess.
      Animations here run for a few hundred milliseconds after a gesture.
    #>
    param([int] $TimeoutMs = 4000, [int] $QuietMs = 400)
    $tmp = Join-Path $env:TEMP "meno-settle"
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $a = Join-Path $tmp "a.png"
    $b = Join-Path $tmp "b.png"
    $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
    Save-MenoShot -Path $a | Out-Null
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds $QuietMs
        Save-MenoShot -Path $b | Out-Null
        if ((Get-FileHash $a).Hash -eq (Get-FileHash $b).Hash) { return $true }
        Copy-Item $b $a -Force
    }
    Write-Warning "the drawing was still changing after ${TimeoutMs}ms"
    return $false
}

Export-ModuleMember -Function Get-MenoBuild, Start-MenoProcess, Close-MenoProcess, Complete-FileDialog,
    Get-MenoWindow, Set-MenoWindow, Get-ClientOrigin, Get-ClientSize,
    ConvertTo-Screen, Save-MenoShot, Invoke-MenoClick, Invoke-MenoDrag, Invoke-MenoWheel,
    Send-MenoText, Send-MenoKey, Wait-MenoSettled
