@echo off
cd /d %~dp0

echo ============================
echo AUTO DEPLOY WATCHER STARTED
echo ============================
echo.

chokidar "src/**/*" "public/**/*" "package.json" "package-lock.json" -i ".next/**" -i ".git/**" -c "git add . && git commit -m \"auto\" && git push"

pause