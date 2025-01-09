@rem
@rem Copyright 2015 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem

@if "%DEBUG%"=="" @echo off
@rem ##########################################################################
@rem
@rem  decima startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables with windows NT shell
if "%OS%"=="Windows_NT" setlocal

set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

@rem Resolve any "." and ".." in APP_HOME to make it shorter.
for %%i in ("%APP_HOME%") do set APP_HOME=%%~fi

@rem Add default JVM options here. You can also use JAVA_OPTS and DECIMA_OPTS to pass JVM options to this script.
set DEFAULT_JVM_OPTS="--add-opens" "java.desktop/javax.swing.plaf.basic=ALL-UNNAMED"

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if %ERRORLEVEL% equ 0 goto execute

echo.
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto execute

echo.
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
echo.
echo Please set the JAVA_HOME variable in your environment to match the
echo location of your Java installation.

goto fail

:execute
@rem Setup the command line

set CLASSPATH=%APP_HOME%\lib\decima-0.1.25.jar;%APP_HOME%\lib\decima-ext-model-exporter.jar;%APP_HOME%\lib\decima-ext-model-viewer.jar;%APP_HOME%\lib\decima-ext-texture-viewer.jar;%APP_HOME%\lib\bundle-lwjgl.jar;%APP_HOME%\lib\decima-ext-shader-viewer.jar;%APP_HOME%\lib\decima-ui.jar;%APP_HOME%\lib\platform-ui.jar;%APP_HOME%\lib\decima-model.jar;%APP_HOME%\lib\platform-model.jar;%APP_HOME%\lib\logback-classic-1.4.4.jar;%APP_HOME%\lib\lwjgl-opengl-3.3.2.jar;%APP_HOME%\lib\lwjgl-opengl-3.3.2-natives-windows.jar;%APP_HOME%\lib\lwjgl-opengl-3.3.2-natives-linux.jar;%APP_HOME%\lib\joml-1.10.5.jar;%APP_HOME%\lib\lwjgl3-awt-0.1.8.jar;%APP_HOME%\lib\lwjgl-jawt-3.3.2.jar;%APP_HOME%\lib\lwjgl-3.3.2-natives-windows.jar;%APP_HOME%\lib\lwjgl-3.3.2-natives-linux.jar;%APP_HOME%\lib\lwjgl-3.3.2.jar;%APP_HOME%\lib\gson-2.10.jar;%APP_HOME%\lib\reflections-0.10.2.jar;%APP_HOME%\lib\miglayout-swing-11.0.jar;%APP_HOME%\lib\flatlaf-extras-3.4.1.jar;%APP_HOME%\lib\flatlaf-3.4.1.jar;%APP_HOME%\lib\jna-5.12.1.jar;%APP_HOME%\lib\picocli-4.7.0.jar;%APP_HOME%\lib\tinybcdec-0.1.1.jar;%APP_HOME%\lib\logback-core-1.4.4.jar;%APP_HOME%\lib\slf4j-api-2.0.1.jar;%APP_HOME%\lib\javassist-3.28.0-GA.jar;%APP_HOME%\lib\jsr305-3.0.2.jar;%APP_HOME%\lib\miglayout-core-11.0.jar;%APP_HOME%\lib\jsvg-1.4.0.jar


@rem Execute decima
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %DECIMA_OPTS%  -classpath "%CLASSPATH%" com.shade.platform.Launcher %*

:end
@rem End local scope for the variables with windows NT shell
if %ERRORLEVEL% equ 0 goto mainEnd

:fail
rem Set variable DECIMA_EXIT_CONSOLE if you need the _script_ return code instead of
rem the _cmd.exe /c_ return code!
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% equ 0 set EXIT_CODE=1
if not ""=="%DECIMA_EXIT_CONSOLE%" exit %EXIT_CODE%
exit /b %EXIT_CODE%

:mainEnd
if "%OS%"=="Windows_NT" endlocal

:omega
