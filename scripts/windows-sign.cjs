'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
module.exports = async ({ path: file }) => {
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname,'sign-windows.ps1'), '-FilePath', file], { stdio: 'inherit', windowsHide: true });
};
