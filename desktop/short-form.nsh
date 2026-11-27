!ifndef BUILD_UNINSTALLER
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
Var ShortFormCheckbox
Var ShortFormSelected

!macro customPageAfterChangeDir
  Page custom ShortFormPage ShortFormLeave
!macroend

Function ShortFormPage
  !insertmacro MUI_HEADER_TEXT "Optional Short Form Studio" "Choose the tools you would like to install."
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateLabel} 0 0 100% 45u "The base editor includes all existing editing tools. Short Form Studio adds a workspace for edits, reels, beat sync, tracking, manual rotoscoping, and creative effects."
  Pop $0
  ${NSD_CreateCheckbox} 0 55u 100% 20u "Install optional Short Form Studio"
  Pop $ShortFormCheckbox
  ReadRegDWORD $ShortFormSelected HKCU "Software\SocratesVideoPro" "ShortFormStudio"
  ${If} $ShortFormSelected == 1
    ${NSD_Check} $ShortFormCheckbox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function ShortFormLeave
  ${NSD_GetState} $ShortFormCheckbox $ShortFormSelected
FunctionEnd

!macro customInstall
  CreateDirectory "$INSTDIR\resources"
  FileOpen $0 "$INSTDIR\resources\short-form-choice.json" w
  ${If} $ShortFormSelected == 1
    FileWrite $0 '{$\"enabled$\":true}'
    WriteRegDWORD HKCU "Software\SocratesVideoPro" "ShortFormStudio" 1
  ${Else}
    FileWrite $0 '{$\"enabled$\":false}'
    WriteRegDWORD HKCU "Software\SocratesVideoPro" "ShortFormStudio" 0
  ${EndIf}
  FileClose $0
!macroend

!endif
