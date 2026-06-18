@echo off

set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot
set PATH=%JAVA_HOME%\bin;%PATH%

echo Using Java:
java -version

echo Building Project...
npm run build

echo Syncing Capacitor...
npx cap sync android

echo Running Android App...
npx cap run android

pause