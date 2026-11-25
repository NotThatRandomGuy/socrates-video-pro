'use strict';

const Startup = (() => {
  let active = null;
  const steps = [
    ['Welcome to your studio', 'Import clips, arrange them on the timeline, adjust the picture and sound, then export a finished video. Next walks through each area. You can skip or close this tour at any time.', '.topbar'],
    ['Bring in your files', 'Use Import or drop video, images, and audio into Media. Double-click an item or drag it onto the timeline. Missing files can be relinked by double-clicking them in Media.', '#leftPanel'],
    ['Arrange and trim', 'Drag clips to move them. Drag their edges to trim, press S to split at the playhead, and use Shift to select a group. Linked video and audio move together. Undo reverses edits.', '#timelineArea'],
    ['Tracks, ripple, and navigation', 'Track controls mute, solo, hide, or lock a track. Ripple makes room when inserting clips. Snap aligns clip edges. Space plays, arrows step frames, and J, K, L control shuttle playback. Use the zoom controls to inspect fine edits.', '#timelineArea'],
    ['Frame your picture', 'Select a visual clip and drag it in Preview. With Snap enabled, it aligns to the horizontal and vertical center. Crop canvas changes the output frame. Center buttons align precisely, while Alt temporarily bypasses snapping.', '.canvas-toolbar'],
    ['Transforms and animation', 'The Inspector edits the selected clip. Adjust position, scale, rotation, opacity, and source crop. Keyframe buttons animate values over time. Move the playhead to set another value. Motion presets provide ready-made movement.', '#inspector'],
    ['Titles, effects, and transitions', 'Titles includes text, shapes, stickers, and backgrounds. Effects offers color correction, masks, keying, blur, and lookup tables. Add transitions between clips and adjust their length. Templates set the output size.', '#leftPanel'],
    ['Mix and record', 'The audio Inspector controls volume, pan, fades, EQ, and normalization. Track and master levels shape the final mix. Use the File menu to record voice-over, webcam, or screen with the permissions your device requests.', '.playback'],
    ['Save and reopen', 'Save downloads a project file containing your edit, animation, crop, looks, and master mix. Keep original media alongside it. Open Existing Project restores the edit. The welcome screen can continue your recovered session. Browser recovery storage may be cleared, so save a project file as your backup.', '#btnSave'],
    ['Export and keep exploring', 'Export creates MP4 or WebM with size, frame rate, quality, and In/Out range controls. File also exports PNG frames and WAV audio. Help has keyboard shortcuts, this tutorial, and the welcome screen.', '#btnExport']
  ];
  function close() { active?.abort(); active = null; document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight')); }
  async function tutorial() {
    close(); Player.pause();
    let index = 0;
    while (index < steps.length) {
      const [title, text, target] = steps[index];
      const element = document.querySelector(target); element?.classList.add('tour-highlight');
      const controller = active = new AbortController();
      const buttons = [{label:'Skip tutorial',value:'skip'}];
      if (index) buttons.push({label:'Back',value:'back'});
      buttons.push({label:index === steps.length - 1 ? 'Finish' : 'Next',primary:true,value:'next'});
      const result = await UI.modal(title, U.el('div', {class:'tour-content'}, U.el('p',{},text)), buttons, {signal:controller.signal,width:480});
      element?.classList.remove('tour-highlight');
      if (active !== controller) return;
      active = null;
      if (result === 'back') index--; else if (result === 'next') index++; else break;
    }
  }
  async function show({ first = false, recovered = false } = {}) {
    close(); Player.pause();
    const controller = active = new AbortController();
    const choose = value => { controller.abort(); active = null; run(value); };
    const body = U.el('div',{class:'welcome'},
      U.el('div',{class:'welcome-brand'},'Socrates Video Pro'),
      U.el('h1',{},'What will you create?'),
      U.el('p',{class:'muted'},'Your editing studio, on your machine.'),
      U.el('div',{class:'welcome-actions'},
        U.el('button',{class:'primary',onclick:()=>choose('new')},'Create New Project'),
        U.el('button',{onclick:()=>choose('open')},'Open Existing Project'),
        U.el('button',{onclick:()=>choose('file')},'Open File in Editor'),
        U.el('button',{onclick:()=>choose('continue')},recovered || allClips().length ? 'Continue Editing' : 'Explore the Editor')),
      U.el('button',{class:'welcome-tutorial',onclick:()=>choose('tour')},'Take the tutorial'),
      first ? U.el('p',{class:'welcome-first'},'New here? The optional tutorial walks through the editor. You can skip it at any time.') : null);
    await UI.modal('Welcome',body,[],{width:620,signal:controller.signal});
    if (active === controller) active = null;
    async function run(action) {
      try {
        if (action === 'new') await Project.newProject();
        if (action === 'open' && !await Project.open()) show();
        if (action === 'file') {
          const files = await U.pickFiles('video/*,audio/*,image/*',true);
          if (!files.length) { show(); return; }
          const project = state.project, items = await Media.importFiles(files);
          let start = state.currentTime;
          for (const item of items) {
            if (state.project !== project) break;
            const clip = await Cmd.addMedia(item.id,{start});
            if (clip) start = clipEnd(clip);
          }
          UI.switchTab('media'); Timeline.zoomFit();
        }
        if (action === 'tour') await tutorial();
      } catch (error) { UI.toast(error.message,6000); }
    }
  }
  async function init(recovered) {
    const first = !await DB.get('tutorial-offered');
    await DB.set('tutorial-offered',true);
    show({first,recovered});
  }
  return { init, show, tutorial, close, steps };
})();
