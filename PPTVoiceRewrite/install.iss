; ============================================================
; PPT 语音 AI 改写工具 V1.1 - Inno Setup 安装包脚本
; ============================================================
; 使用方法：
;   1. 安装 Inno Setup 6：https://jrsoftware.org/isdl.php
;   2. 先执行 build.bat 生成 dist\PPTVoiceRewrite\ 目录
;   3. 打开 Inno Setup Compiler → File → Open → 选择本 install.iss
;   4. 点击顶部 Build → Compile（或 Ctrl+F9）
;   5. 编译产物输出到：安装包成品\PPTVoiceRewrite_Setup_v1.1.exe
; ============================================================

#define MyAppName "PPT语音AI改写工具"
#define MyAppVersion "1.1"
#define MyAppPublisher "PPTVoiceRewrite"
#define MyAppExeName "PPTVoiceRewrite.exe"
#define MyAppAssocName "PPT Voice Rewrite File"

[Setup]
AppId={{B7F3A2E1-9C4D-4E8A-8B6F-2A1C3D5E7F90}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=安装包成品
OutputBaseFilename=PPTVoiceRewrite_Setup_v1.1
SetupIconFile=icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} V{#MyAppVersion}

; VC++ 运行库提示（不强制捆绑，避免体积过大）
; 如目标机器缺 VC++ 2015-2022 x64，请另行安装：
; https://aka.ms/vs/17/release/vc_redist.x64.exe

[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加图标:"; Flags: checkedonce
Name: "quicklaunchicon"; Description: "创建快速启动栏图标"; GroupDescription: "附加图标:"; Flags: checkedonce

[Files]
; 主程序（来自 PyInstaller 输出）
Source: "dist\PPTVoiceRewrite\PPTVoiceRewrite.exe"; DestDir: "{app}"; Flags: ignoreversion
; 图标
Source: "dist\PPTVoiceRewrite\icon.ico"; DestDir: "{app}"; Flags: ignoreversion
; 默认配置（仅首次安装写入，升级不覆盖）
Source: "dist\PPTVoiceRewrite\config\config.json"; DestDir: "{app}\config"; Flags: onlyifdoesntexist
; 运行时目录（空目录占位）
Source: "dist\PPTVoiceRewrite\record\*"; DestDir: "{app}\record"; Flags: ignoreversion createallsubdirs recursesubdirs; Check: dirExists(ExpandConstant('{app}\record'))
Source: "dist\PPTVoiceRewrite\history\*"; DestDir: "{app}\history"; Flags: ignoreversion createallsubdirs recursesubdirs; Check: dirExists(ExpandConstant('{app}\history'))

[Dirs]
Name: "{app}\record"; Flags: uninsneveruninstall
Name: "{app}\history"; Flags: uninsneveruninstall
Name: "{app}\config"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"; Tasks: quicklaunchicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; 卸载时清理空目录，但保留用户的 record/history/config 数据
Type: filesandordirs; Name: "{app}\record"; Check: isEmptyDir(ExpandConstant('{app}\record'))
Type: filesandordirs; Name: "{app}\history"; Check: isEmptyDir(ExpandConstant('{app}\history'))

[Code]
function dirExists(path: String): Boolean;
begin
  Result := DirExists(path);
end;

function isEmptyDir(path: String): Boolean;
var
  FindRec: TFindRec;
begin
  Result := True;
  if FindFirst(path + '\*', FindRec) then
  begin
    try
      repeat
        if (FindRec.Name <> '.') and (FindRec.Name <> '..') then
        begin
          Result := False;
          Break;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;
