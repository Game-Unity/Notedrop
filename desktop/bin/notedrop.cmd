@echo off
rem The notedrop command that comes with the desktop app.
setlocal
set ELECTRON_RUN_AS_NODE=1
set NOTEDROP_PROFILE=stable
set NOTEDROP_CLI_NAME=notedrop
"%~dp0..\..\..\..\Notedrop.exe" "%~dp0..\..\bin\etude.js" %*
