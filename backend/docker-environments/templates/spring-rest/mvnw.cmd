@REM Maven wrapper script for Windows
@echo off
if "%MAVEN_BATCH_ECHO%" == "on"  echo %MAVEN_BATCH_ECHO%
set MAVEN_BATCH_PAUSE=on
java -Xmx2048m -classpath "%~dp0\.mvn\wrapper\maven-wrapper.jar" org.apache.maven.wrapper.MavenWrapperMain %*
if ERRORLEVEL 1 goto error
goto end
:error
set ERROR_CODE=1
:end
exit /B %ERROR_CODE%
