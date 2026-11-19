<# : Double-click to open a Clockwork backup. The PowerShell part starts below.
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -STA -Command "iex ([IO.File]::ReadAllText('%~f0'))"
exit /b
#>

# Open a Clockwork backup (.gpg, or the .zip Google Drive gives when you download a folder):
# pick the file, enter the passphrase, and the folder with roles.sql, schema.sql and data.sql opens.
# Needs Git for Windows (it brings gpg) or Gpg4win.

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$title = "Open Clockwork backup"

function Say($text, $icon = "Information") {
  [void][System.Windows.Forms.MessageBox]::Show($text, $title, "OK", $icon)
}

# Find gpg: Git for Windows first, then anything on PATH (e.g. Gpg4win).
$gpg = @(
  "$env:ProgramFiles\Git\usr\bin\gpg.exe",
  "${env:ProgramFiles(x86)}\Git\usr\bin\gpg.exe",
  "$env:LOCALAPPDATA\Programs\Git\usr\bin\gpg.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $gpg) { $gpg = (Get-Command gpg.exe -ErrorAction SilentlyContinue).Source }
if (-not $gpg) { Say "gpg was not found. Install Git for Windows or Gpg4win, then try again." "Error"; exit 1 }

# 1. Pick the backup.
$pick = New-Object System.Windows.Forms.OpenFileDialog
$pick.Title = "Choose a Clockwork backup"
$pick.Filter = "Clockwork backup (*.gpg;*.zip)|*.gpg;*.zip|All files (*.*)|*.*"
$pick.InitialDirectory = Join-Path $env:USERPROFILE "Downloads"
if ($pick.ShowDialog() -ne "OK") { exit 0 }
$file = $pick.FileName

# A folder downloaded from Google Drive arrives as a .zip: unpack it and use the newest backup inside.
if ($file -like "*.zip") {
  $unzipped = Join-Path (Split-Path $file) ([IO.Path]::GetFileNameWithoutExtension($file))
  Expand-Archive -LiteralPath $file -DestinationPath $unzipped -Force
  $inner = Get-ChildItem -LiteralPath $unzipped -Recurse -Filter *.gpg | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $inner) { Say "There is no .gpg backup inside that zip." "Error"; exit 1 }
  $file = $inner.FullName
}

# 2. Ask for the passphrase (hidden; Ctrl+V and right-click paste work).
$form = New-Object System.Windows.Forms.Form
$form.Text = $title
$form.Size = New-Object System.Drawing.Size(420, 170)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$label = New-Object System.Windows.Forms.Label
$label.Text = "Backup passphrase for " + (Split-Path $file -Leaf) + ":"
$label.SetBounds(12, 12, 390, 20)
$box = New-Object System.Windows.Forms.TextBox
$box.UseSystemPasswordChar = $true
$box.SetBounds(12, 38, 380, 24)
$ok = New-Object System.Windows.Forms.Button
$ok.Text = "Open"
$ok.DialogResult = "OK"
$ok.SetBounds(236, 82, 75, 28)
$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "Cancel"
$cancel.DialogResult = "Cancel"
$cancel.SetBounds(317, 82, 75, 28)
$form.Controls.AddRange(@($label, $box, $ok, $cancel))
$form.AcceptButton = $ok
$form.CancelButton = $cancel
$form.Add_Shown({ $box.Focus() })
if ($form.ShowDialog() -ne "OK" -or -not $box.Text.Trim()) { exit 0 }
$pass = $box.Text.Trim()
$form.Dispose()

# 3. Decrypt and unpack into a folder named after the backup, next to it.
$name = (Split-Path $file -Leaf) -replace '\.gpg$', '' -replace '\.tar\.gz$', ''
$out = Join-Path (Split-Path $file) $name
New-Item -ItemType Directory -Force -Path $out | Out-Null
$tgz = Join-Path $out "backup.tar.gz"
$passFile = Join-Path $env:TEMP ("cwb-" + [guid]::NewGuid() + ".txt")
try {
  [IO.File]::WriteAllText($passFile, $pass)
  $err = & $gpg --batch --yes --quiet --passphrase-file $passFile --decrypt -o $tgz $file 2>&1
  $failed = $LASTEXITCODE -ne 0
} finally {
  Remove-Item -LiteralPath $passFile -Force -ErrorAction SilentlyContinue
  $pass = $null
}
if ($failed) {
  Remove-Item -LiteralPath $out -Recurse -Force -ErrorAction SilentlyContinue
  if ("$err" -match "bad key") { Say "Wrong passphrase. Backups made before the passphrase was changed need the old one." "Warning" }
  else { Say ("Could not open the backup:`n`n" + ($err -join "`n")) "Error" }
  exit 1
}
& "$env:SystemRoot\System32\tar.exe" -xzf $tgz -C $out
Remove-Item -LiteralPath $tgz -Force

# 4. Show it.
Start-Process explorer.exe $out
