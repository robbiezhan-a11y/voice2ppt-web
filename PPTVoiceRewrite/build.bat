@echo off
REM ============================================================
REM PPT 语音 AI 改写工具 V1.1 - 一键打包脚本
REM 使用 PyInstaller 打包为单文件 EXE
REM ============================================================
REM
REM 使用前请确认：
REM   1. 已安装 Python 3.10 64-bit 并加入 PATH
REM   2. 已执行 pip install -r requirements.txt
REM   3. 已生成 icon.ico（如无，先运行 python generate_icon.py）
REM
REM 打包产物：dist\PPTVoiceRewrite\PPTVoiceRewrite.exe
REM ============================================================

chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   PPT 语音 AI 改写工具 V1.1 打包脚本
echo ============================================
echo.

REM ---- 检查 PyInstaller ----
python -m PyInstaller --version >nul 2>&1
if errorlevel 1 (
    echo [!] 未检测到 PyInstaller，正在安装...
    pip install pyinstaller==6.3.0
)

REM ---- 检查图标 ----
if not exist "icon.ico" (
    echo [!] 未找到 icon.ico，正在生成...
    python generate_icon.py
)

REM ---- 清理旧产物 ----
echo [1/3] 清理旧打包产物...
if exist "build" rmdir /s /q "build"
if exist "dist" rmdir /s /q "dist"
if exist "PPTVoiceRewrite.spec" del /q "PPTVoiceRewrite.spec"

REM ---- 打包 ----
echo [2/3] 开始 PyInstaller 打包（单文件模式）...
python -m PyInstaller ^
    --noconfirm ^
    --onefile ^
    --windowed ^
    --name "PPTVoiceRewrite" ^
    --icon "icon.ico" ^
    --add-data "icon.ico;." ^
    --collect-binaries pyaudio ^
    --hidden-import pyaudio ^
    --hidden-import win32com ^
    --hidden-import win32com.client ^
    --hidden-import pythoncom ^
    --hidden-import Crypto.Cipher.AES ^
    --hidden-import Crypto.Util.Padding ^
    main.py

if errorlevel 1 (
    echo.
    echo [X] 打包失败！请查看上方错误信息。
    echo     常见原因：
    echo     - 依赖未安装完整：pip install -r requirements.txt
    echo     - pyaudio 问题：去掉 --windowed 改用 --console 查看报错
    pause
    exit /b 1
)

REM ---- 整理产物 ----
echo [3/3] 整理打包产物...
REM 将运行时需要的文件夹复制到 exe 同级（供便携版使用）
if not exist "dist\PPTVoiceRewrite\config" mkdir "dist\PPTVoiceRewrite\config"
if not exist "dist\PPTVoiceRewrite\record" mkdir "dist\PPTVoiceRewrite\record"
if not exist "dist\PPTVoiceRewrite\history" mkdir "dist\PPTVoiceRewrite\history"
copy /y "config\config.json" "dist\PPTVoiceRewrite\config\config.json" >nul
copy /y "icon.ico" "dist\PPTVoiceRewrite\icon.ico" >nul

echo.
echo ============================================
echo   打包完成！
echo ============================================
echo   便携版 EXE 位置: dist\PPTVoiceRewrite\PPTVoiceRewrite.exe
echo   配置目录:        dist\PPTVoiceRewrite\config\
echo   录音目录:        dist\PPTVoiceRewrite\record\
echo   历史目录:        dist\PPTVoiceRewrite\history\
echo.
echo   下一步：使用 Inno Setup 打开 install.iss 编译安装包
echo   （Inno Setup 编译后产物在: 安装包成品\）
echo ============================================
echo.
pause
