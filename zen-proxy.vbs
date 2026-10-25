Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""D:\AI_data\zen-proxy\start-hidden.ps1""", 0, False
