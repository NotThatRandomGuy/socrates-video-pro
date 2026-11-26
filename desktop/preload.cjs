'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopUpdates',{
  info:()=>ipcRenderer.invoke('updates:info'),
  check:()=>ipcRenderer.invoke('updates:check'),
  preferences:value=>ipcRenderer.invoke('updates:preferences',value),
  download:()=>ipcRenderer.invoke('updates:download'),
  cancel:()=>ipcRenderer.invoke('updates:cancel'),
  install:()=>ipcRenderer.invoke('updates:install'),
  releaseNotes:()=>ipcRenderer.invoke('updates:notes')
});
