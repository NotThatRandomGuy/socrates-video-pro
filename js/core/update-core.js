/* Shared release rules for desktop and browser. */
'use strict';
(function(root) {
  const repo = 'https://github.com/NotThatRandomGuy/socrates-video-pro';
  function parts(version) {
    const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
    if (!match) return null;
    const result = match.slice(1).map(Number);
    return result.every(Number.isSafeInteger) ? result : null;
  }
  function newer(a,b) {
    const left=parts(a),right=parts(b);
    if (!left || !right) return false;
    for(let i=0;i<3;i++) if(left[i]!==right[i]) return left[i]>right[i];
    return false;
  }
  function release(data) {
    if (!data || data.draft || data.prerelease || !parts(data.tag_name) || !Array.isArray(data.assets)) throw Error('A stable release could not be checked');
    const version=parts(data.tag_name).join('.');
    const url=repo+'/releases/tag/'+data.tag_name;
    if(data.html_url!==url) throw Error('Unexpected release address');
    const assets=data.assets.filter(a=>typeof a.name==='string' && a.state==='uploaded'
      && Number.isSafeInteger(a.size) && a.size>0 && a.size<2**32
      && a.browser_download_url===repo+'/releases/download/'+data.tag_name+'/'+a.name
      && /^[\w.-]+$/.test(a.name));
    return {version,tag:data.tag_name,url,notes:typeof data.body==='string'?data.body.slice(0,16000):'',assets};
  }
  function assetName(version,kind) {
    const prefix='Socrates-Video-Pro-'+version;
    const endings={setup:'-Setup-x64.exe',portable:'-Portable-x64.exe',appimage:'-Linux-x86_64.AppImage',deb:'-Linux-amd64.deb',arm64:'-macOS-arm64.dmg',x64:'-macOS-x64.dmg'};
    return kind==='web'?'Socrates-Video-Pro-Web.zip':endings[kind]?prefix+endings[kind]:null;
  }
  function preferences(value={}) {
    if (!value || typeof value !== 'object') value={};
    return {enabled:value.enabled!==false,skipped:Array.isArray(value.skipped)?value.skipped.filter(v=>parts(v)):[],
      remindUntil:Number.isFinite(value.remindUntil)?Math.max(0,value.remindUntil):0,
      dismissed:typeof value.dismissed==='string'?value.dismissed:''};
  }
  function shouldNotify(p,version,now=Date.now()) {
    return p.enabled && !p.skipped.includes(version) && p.dismissed!==version && now>=p.remindUntil;
  }
  const api={repo,parts,newer,release,assetName,preferences,shouldNotify};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.UpdateCore=api;
})(globalThis);
