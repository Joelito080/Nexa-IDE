$desktop=[Environment]::GetFolderPath("Desktop")
$ws=New-Object -ComObject WScript.Shell
$shortcut=$ws.CreateShortcut("$desktop\Nexa IDE.lnk")
$shortcut.TargetPath="$pwd\start-nexa-ide.bat"
$shortcut.WorkingDirectory="$pwd"
$shortcut.Description="Launch Nexa IDE development app"
$shortcut.Save()
Write-Output "SHORTCUT_CREATED:$desktop\Nexa IDE.lnk"
