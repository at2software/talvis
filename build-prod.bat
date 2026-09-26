@echo off
:: TALVIS FOSS — Windows launcher for build-prod.sh
:: Finds Git Bash and runs the build script through it.
::
:: Usage:
::   build-prod.bat          <- build dist/
::   build-prod.bat --tar    <- build dist/ and create TALVIS-x.y.z.tar.gz

setlocal

:: Locate bash.exe bundled with Git for Windows
set BASH=
for %%P in (
    "C:\Program Files\Git\bin\bash.exe"
    "C:\Program Files\Git\usr\bin\bash.exe"
    "C:\Program Files (x86)\Git\bin\bash.exe"
) do (
    if exist %%P (
        set BASH=%%P
        goto :found
    )
)

:: Fallback: ask where on PATH
where bash >nul 2>&1 && set BASH=bash && goto :found

echo ERROR: Git Bash not found. Install Git for Windows from https://git-scm.com/
pause
exit /b 1

:found
:: Run the shell script in the same directory as this .bat file, forwarding all args
%BASH% --login -i "%~dp0build-prod.sh" %*

endlocal
