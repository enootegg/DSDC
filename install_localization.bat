@echo off
setlocal

:: Prompt the user for the game directory
set /p game_dir="Enter game directory: "

:: Execute the first command
call decima.bat localization import "--project=%game_dir%" --input localization.json --output compiled_dsdc

:: Ask the user if they want to create a backup
set /p create_backup="Do you want to create a backup? (Y/N): "

:: Convert the response to lowercase for consistency
set create_backup=%create_backup:~0,1%

:: Execute the second command
if /i "%create_backup%"=="y" (
    call decima.bat repack --backup "--project=%game_dir%" "%game_dir%\data\59b95a781c9170b0d13773766e27ad90.bin" compiled_dsdc
) else (
    call decima.bat repack "--project=%game_dir%" "%game_dir%\data\59b95a781c9170b0d13773766e27ad90.bin" compiled_dsdc
)

:: Wait for user input before closing
echo CONGRATULATIONS...
pause >nul
endlocal