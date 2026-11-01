'use strict';
const { build, Platform, Arch } = require('electron-builder');
const path = require('node:path');
if (process.platform !== 'win32') throw Error('Local Authenticode signing requires Windows');
build({ targets: Platform.WINDOWS.createTarget(['nsis','portable'], Arch.x64), publish:'never', config: { win: { signExecutable: true, signtoolOptions: { sign: path.join(__dirname,'windows-sign.cjs'), signingHashAlgorithms:['sha256'] } } } }).catch(e=>{ console.error(e);process.exitCode=1; });
