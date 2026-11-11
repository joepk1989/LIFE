(function(){
  "use strict";
  var REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LEDS = 84;

  var RAINBOW = ['#ff2d55','#ff8a00','#ffd400','#35d47a','#26c6da','#3d5afe','#d946ef','#ff2d55'];
  var MOODS = {
    prism:     RAINBOW,
    afterglow: ['#ff2d55','#ff8a00','#ffce54','#ff2d55'],
    golden:    ['#f5c261','#f5a623','#7a4a12','#f5c261'],
    bloom:     ['#f472e0','#d946ef','#5b21b6','#f472e0'],
    forest:    ['#8ef0b0','#35d47a','#0f5132','#8ef0b0'],
    current:   ['#8be9fd','#26c6da','#1e3a8a','#8be9fd']
  };
  var MOTION_NOTES = {
    sweep:   'Sweep — the gradient rotates around the loop. Speed sets how fast, Amount is unused.',
    sparkle: 'Sparkle — the loop sits dim and random pixels flare white-hot and decay. Amount sets how many spark at once.',
    pulse:   'Pulse — the whole frame breathes in and out. Amount sets how deep the dip goes.',
    comet:   'Comet — a bright head runs the perimeter dragging a tail. Amount sets the tail length.',
    scan:    'Scan — a narrow line crosses the frame at the gradient angle, lighting the two sides it passes. Amount sets how thin the line is.',
    flash:   'Flash — the whole frame blinks hard on and off. Speed is the rate, Amount is how long it stays lit each time.',
    hold:    'Hold — pixels stay exactly where they are. No motion at all.'
  };
  var FX_NAMES = { sweep:'Rainbow / Colorwaves', sparkle:'Sparkle', pulse:'Breathe', comet:'Chase / Running', scan:'Scan / Larson', flash:'Strobe', hold:'Solid' };
  var FX_INDEX = { sweep:9, sparkle:20, pulse:2, comet:28, scan:10, flash:23, hold:0 };

  var state = {
    angle:45, gradType:'conic', motion:'sweep', amount:55,
    mode:'static', hue:0, spectrum:true, mood:'prism',
    brightness:82, speed:30, sat:100, power:true,
    // the build: 24 V FCOB WS2814 at 14 px/m over 150 cm sides
    perSide:21, density:14, sideCm:150, cob:true,
    host:'life-frame.local', scenes:null, ledsPerM:784, diffuse:true, layout:'square', view:'2d'
  };

  // Everything a saved scene restores. 'sat' is the colour<->white wash and
  // 'layout' is frame vs pillars -- both were missing, so recalling a scene
  // silently kept whatever was on screen instead of what was saved.
  var LOOK_KEYS = ['angle','gradType','motion','amount','mode','hue','spectrum','mood',
                   'brightness','speed','sat','layout'];
  // A scene is a complete look, not a patch: any key a stored scene omits falls
  // back to these rather than inheriting the current state.
  var LOOK_DEFAULTS = { angle:45, gradType:'conic', motion:'sweep', amount:55, mode:'static',
                        hue:0, spectrum:true, mood:'prism', brightness:82, speed:30,
                        sat:100, layout:'square' };
  var DEFAULT_SCENES = [
    { name:'Portrait warm', look:{ mode:'mood', mood:'golden', motion:'hold', gradType:'radial', angle:45, brightness:90, speed:0, amount:40, spectrum:false, sat:62, layout:'square' } },
    { name:'Slow drift',    look:{ mode:'mood', mood:'bloom', motion:'sweep', gradType:'conic', angle:120, brightness:72, speed:16, amount:50, spectrum:false, sat:100, layout:'square' } },
    { name:'Party',         look:{ mode:'static', spectrum:true, motion:'sparkle', gradType:'conic', angle:0, brightness:96, speed:72, amount:82, sat:100, layout:'square' } },
    { name:'White wash',    look:{ mode:'mood', mood:'golden', motion:'hold', gradType:'linear', angle:90, brightness:100, speed:0, amount:40, spectrum:false, sat:0, layout:'square' } },
    { name:'DJ pillars',    look:{ mode:'static', spectrum:true, motion:'flash', gradType:'conic', angle:0, brightness:100, speed:64, amount:30, sat:100, layout:'pillars' } }
  ];

  function loadState(){
    try{
      var raw = localStorage.getItem('life-frame-state');
      if(raw){ var s = JSON.parse(raw); for(var k in s){ if(state.hasOwnProperty(k)) state[k] = s[k]; } }
    }catch(e){}
  }
  var saveTimer=null;
  function saveState(){
    // Every control in the app already calls this, which makes it the one place
    // that knows the state has moved — so it is also where the real frame is
    // told. livePush does nothing at all unless a bridge answered on load.
    livePush();
    try{
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function(){ localStorage.setItem('life-frame-state', JSON.stringify(state)); }, 300);
    }catch(e){}
  }

  // ---------- colour helpers ----------
  function hexToRgb(hex){ var n = parseInt(hex.replace('#',''),16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  function hslToHex(h,s,l){
    s/=100; l/=100;
    var c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs((h/60)%2-1)), m=l-c/2, r,g,b;
    if(h<60){r=c;g=x;b=0;} else if(h<120){r=x;g=c;b=0;} else if(h<180){r=0;g=c;b=x;}
    else if(h<240){r=0;g=x;b=c;} else if(h<300){r=x;g=0;b=c;} else {r=c;g=0;b=x;}
    return '#'+[r,g,b].map(function(v){ return Math.round((v+m)*255).toString(16).padStart(2,'0'); }).join('');
  }
  var photoHold = false;
  function towardWhite(hex, k){          // k = 0 keeps the colour, 1 goes warm white
    var c = hexToRgb(hex), w = [255,241,218];
    return '#' + [0,1,2].map(function(i){
      return Math.round(c[i] + (w[i]-c[i])*k).toString(16).padStart(2,'0');
    }).join('');
  }
  function currentStops(){
    if(photoHold) return ['#fff1da','#ffe4bb','#fff1da'];
    if(state.mode==='mood') return MOODS[state.mood] || RAINBOW;
    if(state.spectrum) return RAINBOW;
    return [hslToHex(state.hue,82,56), hslToHex((state.hue+40)%360,74,30), hslToHex(state.hue,82,56)];
  }
  function washedStops(){
    var stops = currentStops();
    var k = 1 - (state.sat === undefined ? 100 : state.sat)/100;
    if(k <= 0.001) return stops;
    return stops.map(function(h){ return towardWhite(h, k); });
  }
  var stopsRgb = RAINBOW.map(hexToRgb);
  function sampleStops(t){
    t = ((t % 1) + 1) % 1;
    var segs = stopsRgb.length - 1;
    var f = t * segs;
    var i = Math.min(segs-1, Math.floor(f));
    var k = f - i;
    var a = stopsRgb[i], b = stopsRgb[i+1];
    return [ a[0]+(b[0]-a[0])*k, a[1]+(b[1]-a[1])*k, a[2]+(b[2]-a[2])*k ];
  }

  // ---------- refs ----------
  var $ = function(id){ return document.getElementById(id); };
  var frameStage=$('frameStage'), ledCanvas=$('ledCanvas'), bloomCanvas=$('bloomCanvas'), frameInner=$('frameInner');
  var ctx = ledCanvas.getContext('2d'), bctx = bloomCanvas.getContext('2d');
  var dial=$('dial'), dialWrap=$('dialWrap'), dialCaption=$('dialCaption'), dialKnobGroup=$('dialKnobGroup'),
      dialFill=$('dialFill'), angleVal=$('angleVal');
  var brightness=$('brightness'), brightnessVal=$('brightnessVal'), speed=$('speed'), speedVal=$('speedVal'),
      amount=$('amount'), amountVal=$('amountVal'), hue=$('hue'), hueVal=$('hueVal'),
      spectrumToggle=$('spectrumToggle'), powerBtn=$('powerBtn'), motionNote=$('motionNote');
  // These node lists never change after startup, but syncUI() was rebuilding all
  // nine of them on every pointermove of the angle dial and every slider input.
  var qa = function(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var UI = {};
  function cacheUI(){
    UI.gradBtns     = qa('.seg-btn[data-type]');
    UI.layoutBtns   = qa('.seg-btn[data-layout]');
    UI.chips        = qa('.chip');
    UI.modeTabs     = qa('.mode-tab');
    UI.modePanels   = qa('.mode-panel');
    UI.moodSwatches = qa('.mood-swatch');
    UI.hudLayout    = qa('[data-hud-layout]');
    UI.hudMotion    = qa('[data-hud-motion]');
    UI.hudMood      = qa('[data-hud-mood]');   // built in JS, so cache after that
  }
  cacheUI();

  var sat=$('sat'), satVal=$('satVal');        // were resolving as implicit globals
  var jsonBlock=$('jsonBlock'), copyBtn=$('copyBtn'), copyStatus=$('copyStatus');
  var micBtn=$('micBtn'), reactNote=$('reactNote'), levelMeter=$('levelMeter');

  var BARS = 24;
  for(var i=0;i<BARS;i++) levelMeter.appendChild(document.createElement('i'));
  var bars = levelMeter.querySelectorAll('i');

  // ---------- offscreen canvases (figure mask + light map) ----------
  var figCv = document.createElement('canvas'), fctx = figCv.getContext('2d');
  var maskCv = document.createElement('canvas'), mctx = maskCv.getContext('2d');
  var GRID = 26, NLIGHTS = 30;
  var lightCv = document.createElement('canvas');
  lightCv.width = GRID; lightCv.height = GRID;
  var lctx = lightCv.getContext('2d');
  var lightImg = lctx.createImageData(GRID, GRID);

  // ---------- geometry ----------
  var W=0, H=0, DPR=1, positions=[], edges=[], runIdx=[], baseT=[], stepPx=6;
  function layout(){
    var rect = frameStage.getBoundingClientRect();
    if(!rect.width) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = rect.width; H = rect.height;
    [ledCanvas, bloomCanvas, figCv, maskCv].forEach(function(c){
      c.width = Math.round(W*DPR); c.height = Math.round(H*DPR);
    });
    ctx.setTransform(DPR,0,0,DPR,0,0);
    bctx.setTransform(DPR,0,0,DPR,0,0);
    fctx.setTransform(DPR,0,0,DPR,0,0);
    mctx.setTransform(DPR,0,0,DPR,0,0);
    buildPoseMask();

    // Four separate runs, one per side, exactly as they are wired: each side is its
    // own strip on its own output, ending short of the corner where the profile is
    // mitred and the tail is soldered on.
    var inset = 12, L = W - inset*2, across = 9;
    var perSide = Math.max(1, Math.round(LEDS/4));
    positions = []; edges = []; runIdx = [];

    if(state.layout === 'pillars'){
      // the same four runs, stood upright and spread out — a light wall
      frameInner.hidden = true;
      var top = 14, bottom = H - 14, span = bottom - top;
      stepPx = span / perSide;
      var usable = W - inset*2;
      for(var r=0;r<4;r++){
        var cx = inset + usable*(r + 0.5)/4;
        for(var k=0;k<perSide;k++){
          positions.push([cx, bottom - stepPx*(k + 0.5)]);
          edges.push(1); runIdx.push(r);          // all vertical
        }
      }
    } else {
      frameInner.hidden = false;
      // the dark interior stops exactly under the strip — a hair of overlap, never a gap
      frameInner.style.inset = (inset + across/2 - 1).toFixed(1) + 'px';
      var cornerGap = L * (1.6 / Math.max(20, state.sideCm));   // ≈16 mm of dark per end
      var runLen = L - cornerGap*2;
      stepPx = runLen / perSide;
      for(var e2=0; e2<4; e2++){
        for(var j=0;j<perSide;j++){
          var d = cornerGap + stepPx*(j + 0.5), x, y;
          if(e2===0){ x = inset + d;       y = inset; }
          else if(e2===1){ x = inset + L;  y = inset + d; }
          else if(e2===2){ x = inset + L - d; y = inset + L; }
          else { x = inset;                y = inset + L - d; }
          positions.push([x,y]); edges.push(e2); runIdx.push(e2);
        }
      }
    }
    computeBaseT();
  }

  function setPixelCount(n){
    LEDS = Math.max(8, Math.min(600, Math.round(n)));
    sparkE = new Float32Array(LEDS);
    pxR = new Float32Array(LEDS); pxG = new Float32Array(LEDS); pxB = new Float32Array(LEDS);
    layout();
  }

  function computeBaseT(){
    baseT = [];
    var cx = W/2, cy = H/2;
    var maxR = Math.hypot(W/2, H/2);
    var a = (state.angle - 90) * Math.PI/180;
    var ux = Math.sin(a + Math.PI/2), uy = -Math.cos(a + Math.PI/2);
    for(var i=0;i<LEDS;i++){
      var x = positions[i][0], y = positions[i][1], t;
      if(state.gradType==='conic'){
        var deg = (Math.atan2(y-cy, x-cx)*180/Math.PI + 90 + 360) % 360;
        t = (((deg - state.angle) % 360) + 360) % 360 / 360;
      } else if(state.gradType==='linear'){
        var proj = (x-cx)*ux + (y-cy)*uy;
        t = proj/(2*maxR) + 0.5;
      } else {
        t = Math.min(1, Math.hypot(x-cx, y-cy)/maxR);
        t = (t - 0.62) / 0.38;
        t = Math.max(0, Math.min(1, t));
      }
      baseT.push(t);
    }
  }

  // ---------- motion state ----------
  var sparkE = new Float32Array(LEDS);
  var phase = 0, pulsePhase = 0, cometPos = 0, reactLevel = 0, prevLevel = 0, simPhase = 0;
  var scanPos = 0, flashPhase = 0;
  // 0.4 Hz at rest up to 12 Hz flat out — club strobe range. Above about 3 Hz
  // this is in seizure-risk territory, which the panel says out loud.
  function flashHz(){ return 0.4 + (state.speed/100) * 11.6; }

  function spawnSparks(n){
    for(var i=0;i<n;i++){
      var idx = (Math.random()*LEDS)|0;
      sparkE[idx] = 1;
      if(Math.random()<0.4) sparkE[(idx+1)%LEDS] = Math.max(sparkE[(idx+1)%LEDS], 0.7);
    }
  }

  function updateMotion(dt){
    var sp = state.speed/100, amt = state.amount/100;
    if(!state.power || REDUCED) return;
    if(state.motion==='sweep'){ phase = (phase + dt*sp*0.00018) % 1; }
    else if(state.motion==='pulse'){ pulsePhase += dt*0.001*(0.3 + sp*2.4); }
    else if(state.motion==='comet'){ cometPos = (cometPos + dt*(0.02 + sp*0.55)) % LEDS; }
    else if(state.motion==='scan'){ scanPos = (scanPos + dt*(0.00008 + sp*0.0009)) % 1; }
    else if(state.motion==='flash'){
      flashPhase = (flashPhase + dt*0.001*flashHz()) % 1;
    }
    else if(state.motion==='sparkle'){
      var rate = (0.4 + amt*7) * (0.35 + sp*1.6) * (dt/16.67);
      var whole = Math.floor(rate);
      if(Math.random() < rate - whole) whole++;
      spawnSparks(whole);
    }
    var decay = Math.pow(0.90, dt/16.67);
    for(var i=0;i<LEDS;i++) if(sparkE[i] > 0.002) sparkE[i] *= decay; else sparkE[i] = 0;
  }

  function pixelLevel(i){
    var amt = state.amount/100;
    if(state.motion==='sparkle'){
      var base = 0.16 + 0.12*(1-amt);
      return Math.min(1.9, base + sparkE[i]*1.75);
    }
    if(state.motion==='comet'){
      var tail = 12 + amt*110;
      var d = ((i - cometPos) % LEDS + LEDS) % LEDS;
      var back = LEDS - d;
      var dist = back;                     // the tail trails the head, not both ways
      var v = Math.exp(-dist/tail);
      return 0.07 + v*1.6 + sparkE[i]*1.6;
    }
    if(state.motion==='scan'){
      var d = Math.abs(baseT[i] - scanPos);
      if(d > 0.5) d = 1 - d;                       // the band wraps
      var half = 0.012 + (1-amt)*0.16;             // Amount high = thin line
      var v = Math.exp(-(d/half)*(d/half)*2.2);
      return 0.05 + v*1.75;
    }
    if(state.motion==='flash'){
      var duty = 0.12 + amt*0.5;
      return flashPhase < duty ? 1.7 : 0.045;
    }
    if(state.motion==='pulse'){
      var depth = 0.15 + amt*0.75;
      var wave = (Math.sin(pulsePhase)+1)/2;
      return (1 - depth) + depth*wave + sparkE[i]*1.4;
    }
    return 1 + sparkE[i]*1.4;
  }

  // pixel colour buffers, shared by the strip, the light map and the figure
  var pxR = new Float32Array(LEDS), pxG = new Float32Array(LEDS), pxB = new Float32Array(LEDS);
  var avgR = 0, avgG = 0, avgB = 0;

  function computePixels(){
    var globalB = state.power ? (0.10 + (state.brightness/100)*0.95) : 0.055;
    if(state.mode==='react' && state.power) globalB *= (0.55 + reactLevel*1.05);
    for(var i=0;i<LEDS;i++){
      var col = state.power ? sampleStops(baseT[i] + phase) : [150,155,170];
      var lvl = state.power ? pixelLevel(i) : 0.5;
      var b = globalB * lvl;
      var r = col[0]*b, g = col[1]*b, bl = col[2]*b;
      if(sparkE[i] > 0.55){ // sparks bleach toward white at their peak
        var w = (sparkE[i]-0.55)/0.45*0.75;
        r += (255-r)*w; g += (255-g)*w; bl += (255-bl)*w;
      }
      pxR[i] = Math.min(255,r); pxG[i] = Math.min(255,g); pxB[i] = Math.min(255,bl);
    }
    var sr=0, sg=0, sb=0;
    for(var n=0;n<LEDS;n++){ sr+=pxR[n]; sg+=pxG[n]; sb+=pxB[n]; }
    avgR = sr/LEDS; avgG = sg/LEDS; avgB = sb/LEDS;
  }

  // soft light field cast into the frame by the strip
  function buildLightMap(){
    var d = lightImg.data;
    var step = Math.max(1, Math.floor(LEDS/NLIGHTS));
    var f2 = (W*0.26)*(W*0.26);
    for(var gy=0; gy<GRID; gy++){
      var py = (gy+0.5)/GRID*H;
      for(var gx=0; gx<GRID; gx++){
        var px = (gx+0.5)/GRID*W, r=0, g=0, b=0;
        for(var i=0;i<LEDS;i+=step){
          var dx = positions[i][0]-px, dy = positions[i][1]-py;
          var w = 1/(1 + (dx*dx+dy*dy)/f2);
          w = w*w*w;
          r += pxR[i]*w; g += pxG[i]*w; b += pxB[i]*w;
        }
        var k = 0.34, o = (gy*GRID+gx)*4;
        d[o] = Math.min(255, r*k); d[o+1] = Math.min(255, g*k); d[o+2] = Math.min(255, b*k); d[o+3] = 255;
      }
    }
    lctx.putImageData(lightImg, 0, 0);
  }

  // ---------- the figure ----------
  // The high-contrast vector of the pose doubles as its own light-and-shadow map:
  // white shapes are surfaces the strip catches, everything else stays dark. The
  // strip's light field is poured through that mask, so the lit shapes take the
  // colour of whichever side of the frame is nearest.
  var POSE_ASPECT = 1.3873;             // width / height of the artwork
  var poseImg = new Image();
  var poseReady = false;
  // The PNG carries transparent margin around the pose, so "bottom" has to mean
  // the bottom of the drawn content, not the bottom of the file.
  var poseBox = { x:0, y:0, w:1, h:1 };
  function measurePose(){
    var cw = 260, ch = Math.max(1, Math.round(cw / POSE_ASPECT));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var q = c.getContext('2d');
    q.drawImage(poseImg, 0, 0, cw, ch);
    var d;
    try{ d = q.getImageData(0, 0, cw, ch).data; }catch(e){ return; }
    var x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for(var y=0; y<ch; y++){
      for(var x=0; x<cw; x++){
        if(d[(y*cw + x)*4 + 3] > 24){
          if(x < x0) x0 = x;
          if(x > x1) x1 = x;
          if(y < y0) y0 = y;
          if(y > y1) y1 = y;
        }
      }
    }
    if(x1 < 0) return;
    poseBox = { x:x0/cw, y:y0/ch, w:(x1-x0+1)/cw, h:(y1-y0+1)/ch };
  }
  poseImg.onload = function(){ poseReady = true; measurePose(); layout(); };
  poseImg.src = LIFE_DATA.pose;

  function buildPoseMask(){
    mctx.clearRect(0,0,W,H);
    if(!poseReady) return;
    var reach = 15;                      // fingertips land on the strip itself
    var span = W - reach*2;
    // Scale on the drawn content, not the file: the hands reach both runs, and
    // the feet stand on the bottom one instead of floating above it.
    var fw = span / poseBox.w;
    var fh = fw / POSE_ASPECT;
    if(fh * poseBox.h > span){ fh = span / poseBox.h; fw = fh * POSE_ASPECT; }
    var fx = reach + span/2 - (poseBox.x + poseBox.w/2) * fw;
    var fy = (H - reach) - (poseBox.y + poseBox.h) * fh;
    mctx.save();
    mctx.beginPath(); mctx.rect(reach,reach,span,span); mctx.clip();
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(poseImg, fx, fy, fw, fh);
    mctx.restore();
  }

  function drawSpill(){
    // in pillar form there is no interior to catch light — the bloom does it all,
    // and a flat wash would just draw a box edge across the stage
    if(state.layout === 'pillars') return;
    var pad = 16;
    ctx.save();
    ctx.beginPath(); ctx.rect(pad,pad,W-pad*2,H-pad*2); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.09;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightCv, 0, 0, W, H);
    ctx.restore();
  }

  function buildFigureTexture(){
    if(!poseReady) return;
    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0,0,W,H);
    fctx.imageSmoothingEnabled = true;
    // a bed of the strip's average colour keeps the middle of the body alive,
    // then the light field lays the side-to-side colour over it
    fctx.fillStyle = 'rgb(' + (avgR|0) + ',' + (avgG|0) + ',' + (avgB|0) + ')';
    fctx.fillRect(0,0,W,H);
    fctx.globalCompositeOperation = 'lighter';
    fctx.drawImage(lightCv, 0, 0, W, H);
    fctx.globalAlpha = 0.9;
    fctx.drawImage(lightCv, 0, 0, W, H);
    fctx.globalAlpha = 1;
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskCv, 0, 0, W, H);
    fctx.globalCompositeOperation = 'source-over';
  }

  function drawPose(){
    if(!poseReady || state.layout === 'pillars') return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(figCv, 0, 0, W, H);   // the strip's light, masked to the artwork
    ctx.restore();
  }


  function rgbOf(i){ return 'rgb(' + (pxR[i]|0) + ',' + (pxG[i]|0) + ',' + (pxB[i]|0) + ')'; }
  function mixRgb(a,b){
    return 'rgb(' + ((pxR[a]+pxR[b])/2|0) + ',' + ((pxG[a]+pxG[b])/2|0) + ',' + ((pxB[a]+pxB[b])/2|0) + ')';
  }

  function drawStrip(){
    var spacing = stepPx;
    var gap = state.cob ? -0.6 : Math.min(spacing*0.34, 4);   // COB butts up, no dark seam
    var along = Math.max(1.5, spacing - gap), across = 9;
    var blend = state.cob && state.diffuse;
    for(var i=0;i<LEDS;i++){
      var p = positions[i], e = edges[i];
      var horiz = (e===0||e===2);
      var w2 = horiz ? along : across;
      var h2 = horiz ? across : along;
      var x0 = p[0]-w2/2, y0 = p[1]-h2/2;
      if(blend){
        // one pixel is 56 LEDs under a silicone lens: the seam with its neighbour
        // is a short ramp, not a step. Ramp from the half-way colour to the half-way colour.
        var a = (i>0 && runIdx[i-1]===runIdx[i]) ? i-1 : i;
        var c = (i<LEDS-1 && runIdx[i+1]===runIdx[i]) ? i+1 : i;
        var dir = (e===0) ? 1 : (e===2 ? -1 : 0);
        var vdir = (e===1) ? 1 : (e===3 ? -1 : 0);
        var g = horiz
          ? ctx.createLinearGradient(dir>0?x0:x0+w2, 0, dir>0?x0+w2:x0, 0)
          : ctx.createLinearGradient(0, vdir>0?y0:y0+h2, 0, vdir>0?y0+h2:y0);
        g.addColorStop(0,    mixRgb(a,i));
        g.addColorStop(0.32, rgbOf(i));
        g.addColorStop(0.68, rgbOf(i));
        g.addColorStop(1,    mixRgb(i,c));
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = rgbOf(i);
      }
      ctx.fillRect(x0, y0, w2, h2);
    }
  }

  var lastBloom = '';
  function draw(){
    if(!W) return;
    computePixels();                     // the pixel colours; 3D needs these too
    if(state.view === '3d'){ render3D(); return; }
    // Everything below is the flat view only. buildLightMap alone is ~20k
    // samples and a putImageData; both it and buildFigureTexture used to run
    // every frame in 3D as well, feeding canvases nothing was reading.
    var posing = state.layout !== 'pillars';
    if(posing){ buildLightMap(); buildFigureTexture(); }
    ctx.clearRect(0,0,W,H);
    if(posing){ drawSpill(); drawPose(); }
    drawStrip();
    bctx.clearRect(0,0,W,H);
    bctx.drawImage(ledCanvas, 0, 0, W, H);
    var bo = state.power ? String(0.35 + (state.brightness/100)*0.6) : '0.12';
    if(bo !== lastBloom){ bloomCanvas.style.opacity = bo; lastBloom = bo; }
  }

  // ---------- react ----------
  var micActive=false, analyser=null, audioCtx=null, dataArr=null;
  function updateReact(dt){
    if(state.mode!=='react'){ return; }
    var levels = [];
    if(micActive && analyser){
      analyser.getByteFrequencyData(dataArr);
      var step = Math.floor(dataArr.length/BARS);
      for(var i=0;i<BARS;i++){
        var sum=0;
        for(var j=0;j<step;j++) sum += dataArr[i*step+j] || 0;
        levels.push((sum/step)/255);
      }
    } else {
      simPhase += dt*0.004;
      for(var k=0;k<BARS;k++){
        var v = 0.40 + 0.34*Math.sin(simPhase*1.7 + k*0.5) + 0.20*Math.sin(simPhase*4.3 + k*0.9);
        levels.push(Math.max(0, Math.min(1, v)));
      }
    }
    var avg = 0;
    for(var m=0;m<levels.length;m++){ avg += levels[m]; bars[m].style.height = Math.max(6, levels[m]*100).toFixed(0) + '%'; }
    avg /= levels.length;
    reactLevel = reactLevel*0.7 + avg*0.3;
    if(reactLevel - prevLevel > 0.055 && state.power) spawnSparks(2 + Math.round(state.amount/100*10));
    prevLevel = reactLevel;
  }

  micBtn.addEventListener('click', function(){
    if(micActive){
      micActive = false; micBtn.dataset.active='false'; micBtn.textContent='Enable microphone';
      reactNote.textContent = "Sound drives brightness, and every transient throws a burst of sparks around the loop. Showing a simulated pulse until the mic is on.";
      if(audioCtx){ try{ audioCtx.close(); }catch(e){} audioCtx=null; }
      return;
    }
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      reactNote.textContent = 'Microphone access is not available in this preview — showing a simulated pulse instead.';
      return;
    }
    navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
      audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      var src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 256;
      src.connect(analyser);
      dataArr = new Uint8Array(analyser.frequencyBinCount);
      micActive = true; micBtn.dataset.active='true'; micBtn.textContent='Microphone live — tap to stop';
      reactNote.textContent = 'Live — the frame is reacting to sound in the room right now.';
    }).catch(function(){
      reactNote.textContent = "Mic unavailable in this preview — showing a simulated pulse. On the real frame it runs off the onboard mic.";
    });
  });

  // ---------- UI sync ----------
  function syncUI(){
    stopsRgb = washedStops().map(hexToRgb);
    computeBaseT();

    dialWrap.classList.toggle('inactive', state.gradType==='radial');
    dialCaption.textContent = state.gradType==='radial' ? 'angle (n/a)' : 'angle';
    angleVal.textContent = Math.round(state.angle);
    dialKnobGroup.setAttribute('transform','rotate(' + state.angle + ' 60 60)');
    dialFill.setAttribute('stroke-dashoffset', String(314 - (((state.angle%360)+360)%360)/360*314));

    brightness.value = state.brightness; brightness.style.setProperty('--fill', state.brightness+'%');
    brightnessVal.textContent = Math.round(state.brightness)+'%';
    speed.value = state.speed; speed.style.setProperty('--fill', state.speed+'%');
    speedVal.textContent = state.motion==='flash'
      ? flashHz().toFixed(1) + ' Hz'
      : Math.round(state.speed)+'%';
    amount.value = state.amount; amount.style.setProperty('--fill', state.amount+'%');
    amountVal.textContent = Math.round(state.amount)+'%';
    hue.value = state.hue; hue.style.setProperty('--fill', (state.hue/360*100)+'%');
    hueVal.textContent = Math.round(state.hue)+'°';
    sat.value = state.sat; sat.style.setProperty('--fill', state.sat+'%');
    satVal.textContent = Math.round(state.sat) + '%';
    spectrumToggle.checked = state.spectrum;
    powerBtn.setAttribute('aria-pressed', state.power ? 'true':'false');
    if(state.motion==='flash' && flashHz() > 3){
      motionNote.innerHTML = MOTION_NOTES.flash
        + ' <b>' + flashHz().toFixed(1) + ' Hz is above the 3-per-second guidance</b> — the band that can'
        + ' trigger seizures in photosensitive people, worst around 15–20 Hz. Fine for a club with a sign'
        + ' on the door; think twice for a room people walk into unwarned.';
    } else {
      motionNote.textContent = MOTION_NOTES[state.motion];
    }

    UI.gradBtns.forEach(function(b){ b.classList.toggle('active', b.dataset.type===state.gradType); });
    UI.layoutBtns.forEach(function(b){ b.classList.toggle('active', b.dataset.layout===state.layout); });
    UI.chips.forEach(function(b){ b.classList.toggle('active', b.dataset.motion===state.motion); });
    UI.modeTabs.forEach(function(b){ b.classList.toggle('active', b.dataset.mode===state.mode); });
    UI.modePanels.forEach(function(p){ p.classList.toggle('hidden', p.id !== 'panel-'+state.mode); });
    UI.moodSwatches.forEach(function(sw){ sw.classList.toggle('active', sw.dataset.mood===state.mood); });

    renderJson();
    syncMenuUI();
    saveState();
  }

  // The state WLED actually understands. Factored out so the panel you read and
  // the bytes that go down the wire can never describe two different frames.
  function wledState(){
    var cols = washedStops().slice(0,3).map(hexToRgb);
    while(cols.length<3) cols.push([0,0,0]);
    return {
      on: state.power,
      bri: Math.round(state.brightness/100*255),
      transition: 4,
      seg: [0,1,2,3].map(function(i){
        return {
          id:i, start:i*state.perSide, stop:(i+1)*state.perSide,
          col: cols,
          fx: FX_INDEX[state.motion],
          sx: Math.round(state.speed/100*255),
          ix: Math.round(state.amount/100*255),
          pal: 0
        };
      })
    };
  }

  function renderJson(){
    var payload = wledState();
    payload._meta = {
        effect: FX_NAMES[state.motion],
        colour_source: (state.mode==='mood' ? ('mood: '+state.mood) : (state.spectrum ? 'full spectrum' : 'hue '+Math.round(state.hue)+'°'))
                       + (state.sat < 100 ? ' · washed to white ' + (100-state.sat) + '%' : ''),
        gradient: state.gradType + ' @ ' + Math.round(state.angle) + '°'
    };
    payload._frame = {
        shape: state.layout === 'pillars' ? '4 uprights' : 'square',
        side_cm:state.sideCm, total_cm:state.sideCm*4,
        density_per_m:state.density || null, pixels_per_side:state.perSide, pixels:LEDS,
        segments: state.layout === 'pillars'
          ? ['pillar 1','pillar 2','pillar 3','pillar 4']
          : ['top','right','bottom','left']
    };
    var json = JSON.stringify(payload, null, 2)
      .replace(/"(\w+)":/g, '<span class="k">"$1"</span>:')
      .replace(/: "(.*?)"/g, ': <span class="s">"$1"</span>')
      .replace(/: (-?\d+(\.\d+)?|true|false)/g, ': <span class="n">$1</span>');
    jsonBlock.innerHTML = json;
  }

  // ---------- interaction ----------
  var dragging = false;
  function angleFromEvent(e){
    var r = dial.getBoundingClientRect();
    var deg = Math.atan2(e.clientX - (r.left+r.width/2), -(e.clientY - (r.top+r.height/2))) * 180/Math.PI;
    return (deg + 360) % 360;
  }
  dial.addEventListener('pointerdown', function(e){
    if(dialWrap.classList.contains('inactive')) return;
    dragging = true;
    try{ dial.setPointerCapture(e.pointerId); }catch(err){}
    state.angle = angleFromEvent(e); syncUI();
  });
  dial.addEventListener('pointermove', function(e){ if(dragging){ state.angle = angleFromEvent(e); syncUI(); } });
  ['pointerup','pointercancel'].forEach(function(ev){ dial.addEventListener(ev, function(){ dragging=false; }); });

  // Scoped to [data-type]: the Frame/Pillars buttons are .seg-btn as well, so an
  // unscoped selector set state.gradType to undefined every time you switched
  // layout — which fell through to the radial branch and left the angle dial
  // looking live but doing nothing.
  document.querySelectorAll('.seg-btn[data-type]').forEach(function(b){
    b.addEventListener('click', function(){ state.gradType=b.dataset.type; syncUI(); });
  });
  document.querySelectorAll('.chip').forEach(function(b){
    b.addEventListener('click', function(){
      state.motion = b.dataset.motion;
      if(state.motion==='sparkle') spawnSparks(6);
      if(state.motion==='scan'){ scanPos = 0; }
      if(state.motion==='flash'){ flashPhase = 0; }
      syncUI();
    });
  });
  document.querySelectorAll('.mode-tab').forEach(function(b){
    b.addEventListener('click', function(){ state.mode=b.dataset.mode; syncUI(); });
  });
  document.querySelectorAll('.mood-swatch').forEach(function(b){
    b.addEventListener('click', function(){ state.mood=b.dataset.mood; syncUI(); });
  });
  brightness.addEventListener('input', function(){ state.brightness=+brightness.value; syncUI(); });
  speed.addEventListener('input', function(){ state.speed=+speed.value; syncUI(); });
  amount.addEventListener('input', function(){ state.amount=+amount.value; syncUI(); });
  hue.addEventListener('input', function(){ state.hue=+hue.value; state.spectrum=false; syncUI(); });
  sat.addEventListener('input', function(){ state.sat=+sat.value; syncUI(); });
  spectrumToggle.addEventListener('change', function(){ state.spectrum=spectrumToggle.checked; syncUI(); });
  powerBtn.addEventListener('click', function(){ state.power=!state.power; syncUI(); });

  copyBtn.addEventListener('click', function(){
    var text = jsonBlock.textContent;
    function ok(){ copyStatus.textContent='copied'; setTimeout(function(){ copyStatus.textContent=''; },1600); }
    function fallback(){
      try{
        var ta=document.createElement('textarea');
        ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); ok();
      }catch(e){ copyStatus.textContent='select the JSON above to copy'; }
    }
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(ok, fallback); }
    else fallback();
  });

  function onResize(){
    layout();
    if(state.view === '3d'){
      // rotating the phone can cross the flow/fullscreen threshold
      if(flowMode() !== document.body.classList.contains('flow3d')) setView('3d');
      placeJoy();
    }
    resize3D();
  }

  // ---------- main loop ----------
  var last = null;
  function loop(t){
    var dt = last === null ? 16 : Math.min(60, t - last);
    last = t;
    updateMotion(dt);
    updateReact(dt);
    draw();
    liveStream(t);
    requestAnimationFrame(loop);
  }

  // A ResizeObserver and a window listener both called layout(), which re-runs
  // the pose mask and the gradient table each time, and a third listener called
  // resize3D() again. One path now.
  if(window.ResizeObserver){ new ResizeObserver(onResize).observe(frameStage); }
  else window.addEventListener('resize', onResize);


  // ---------- menu: scenes, photo, frame setup, device ----------
  var drawer=$('drawer'), scrim=$('scrim'), menuBtn=$('menuBtn'), closeBtn=$('closeDrawer');
  var kebab=$('kebab');
  var sceneList=$('sceneList'), sceneName=$('sceneName'), saveSceneBtn=$('saveScene');
  var stripPreset=$('stripPreset'), sideCmEl=$('sideCm'), perSideEl=$('perSide'), cobToggle=$('cobToggle');
  var totalPx=$('totalPx'), pitchPx=$('pitchPx'), ledCount=$('ledCount'), ledsPer=$('ledsPer');
  var diffuseToggle=$('diffuseToggle');
  var hostName=$('hostName'), hostEcho=$('hostEcho');
  var liveCard=$('liveCard'), liveOn=$('liveOn'), liveStreamEl=$('liveStream'),
      liveWled=$('liveWled'), liveRate=$('liveRate'), liveLeds=$('liveLeds'),
      liveSegs=$('liveSegs'), devStatus=$('devStatus');
  var shotDelay=$('shotDelay'), shotHold=$('shotHold'), startShot=$('startShot');
  var shot=$('shot'), shotCount=$('shotCount');
  var stageCaption=$('stageCaption'), credit=$('credit'), scaleLabel=$('scaleLabel');
  var glCanvas=$('glCanvas'), viewNote=$('viewNote'), scaleMark=$('scaleMark');
  var hud=$('hud'), hudExit=$('hudExit'), hudBri=$('hudBri'), hudSat=$('hudSat'),
      hudSpeed=$('hudSpeed'), hudAmount=$('hudAmount'), hudMoods=$('hudMoods'),
      hudScene=$('hudScene'), hudShot=$('hudShot'), hudSound=$('hudSound'),
      hudMore=$('hudMore'), hudMoreBtn=$('hudMoreBtn');
  var kebabBtn=$('kebabBtn');
  var joy=$('joy'), joyKnob=$('joyKnob'), walkHint=$('walkHint'), glNote=$('glNote');
  var stageEl = frameStage.closest ? frameStage.closest('.stage') : frameStage.parentNode;

  function openDrawer(pane){ drawer.hidden = false; if(pane) showPane(pane); closeBtn.focus(); }
  function closeDrawer(){ drawer.hidden = true; setKebab(false); }
  function showPane(name){
    document.querySelectorAll('.nav-btn').forEach(function(b){ b.classList.toggle('active', b.dataset.pane===name); });
    document.querySelectorAll('.pane').forEach(function(pn){ pn.hidden = pn.id !== 'pane-'+name; });
  }
  menuBtn.addEventListener('click', function(){ openDrawer(); });
  scrim.addEventListener('click', closeDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  document.querySelectorAll('.nav-btn').forEach(function(b){
    b.addEventListener('click', function(){ showPane(b.dataset.pane); });
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeDrawer(); });

  function setKebab(open){
    kebab.hidden = !open;
    kebabBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  kebabBtn.addEventListener('click', function(e){ e.stopPropagation(); setKebab(kebab.hidden); });
  powerBtn.addEventListener('contextmenu', function(e){ e.preventDefault(); setKebab(kebab.hidden); });
  document.addEventListener('click', function(e){
    if(!kebab.hidden && !kebab.contains(e.target) && !kebabBtn.contains(e.target) && e.target !== powerBtn) setKebab(false);
  });
  kebab.addEventListener('click', function(e){
    var act = e.target.dataset && e.target.dataset.act;
    if(!act) return;
    setKebab(false);
    if(act==='save'){ openDrawer('scenes'); sceneName.focus(); }
    if(act==='json'){ copyJson(); }
    if(act==='reset'){ applyLook({}); }
  });

  // ---------- scenes ----------
  function snapshotLook(){ var look={}; LOOK_KEYS.forEach(function(k){ look[k]=state[k]; }); return look; }
  function applyLook(look){
    LOOK_KEYS.forEach(function(k){
      state[k] = (look[k] !== undefined) ? look[k] : LOOK_DEFAULTS[k];
    });
    layout();
    if(three && three.ready) rebuildGeometry();
    syncUI(); saveState();
  }
  function sceneSwatch(look){
    var stops = look.mode==='mood' ? (MOODS[look.mood] || RAINBOW)
              : (look.spectrum ? RAINBOW
                : [hslToHex(look.hue||0,82,56), hslToHex(((look.hue||0)+40)%360,74,30)]);
    return 'linear-gradient(135deg,' + stops.join(',') + ')';
  }
  function renderScenes(){
    sceneList.innerHTML = '';
    if(!state.scenes || !state.scenes.length){
      var p = document.createElement('p');
      p.className = 'scene-empty';
      p.textContent = 'No scenes yet. Dial in a look and save it below.';
      sceneList.appendChild(p);
      return;
    }
    state.scenes.forEach(function(sc, idx){
      var row = document.createElement('button');
      row.className = 'scene';
      row.innerHTML = '<span class="scene-chip" style="background:' + sceneSwatch(sc.look) + '"></span>'
        + '<span><span class="scene-name"></span><span class="scene-sub"></span></span>'
        + '<span class="scene-del" role="button" aria-label="Delete scene">&times;</span>';
      row.querySelector('.scene-name').textContent = sc.name;
      row.querySelector('.scene-sub').textContent =
        (sc.look.motion || 'sweep') + ' · ' + Math.round(sc.look.brightness) + '%';
      row.addEventListener('click', function(e){
        if(e.target.classList.contains('scene-del')){
          state.scenes.splice(idx,1); renderScenes(); saveState(); return;
        }
        applyLook(sc.look); closeDrawer();
      });
      sceneList.appendChild(row);
    });
  }
  saveSceneBtn.addEventListener('click', function(){
    var name = (sceneName.value || '').trim() || 'Scene ' + ((state.scenes||[]).length + 1);
    state.scenes = state.scenes || [];
    state.scenes.unshift({ name:name, look:snapshotLook() });
    if(state.scenes.length > 12) state.scenes.pop();
    sceneName.value = '';
    renderScenes(); saveState();
  });

  // ---------- frame setup ----------
  function pushFrameSetup(){
    state.sideCm = Math.max(20, Math.min(400, +sideCmEl.value || 150));
    state.perSide = Math.max(4, Math.min(150, Math.round(+perSideEl.value || 21)));
    state.cob = cobToggle.checked;
    state.diffuse = diffuseToggle.checked;
    setPixelCount(state.perSide * 4);
    if(three.ready) rebuildGeometry();
    syncUI();
  }
  stripPreset.addEventListener('change', function(){
    var parts = String(stripPreset.value).split(':');
    var d = +parts[0] || 0, leds = +parts[1] || 0;
    state.density = d; state.ledsPerM = leds;
    if(d > 0) perSideEl.value = Math.max(4, Math.round(state.sideCm/100 * d));
    pushFrameSetup();
  });
  sideCmEl.addEventListener('change', function(){
    if(state.density > 0) perSideEl.value = Math.max(4, Math.round((+sideCmEl.value||150)/100 * state.density));
    pushFrameSetup();
  });
  perSideEl.addEventListener('change', function(){ state.density = 0; stripPreset.value = '0'; pushFrameSetup(); });
  document.querySelectorAll('.seg-btn[data-layout]').forEach(function(b){
    b.addEventListener('click', function(){
      state.layout = b.dataset.layout;
      layout(); if(three.ready) rebuildGeometry(); syncUI();
    });
  });
  cobToggle.addEventListener('change', pushFrameSetup);
  diffuseToggle.addEventListener('change', pushFrameSetup);

  // ---------- the live link ----------
  // Only ever attempted over plain http, and that guard is the whole design.
  // On claude.ai this page is served over https, where the browser forbids any
  // request to a http:// device on your own network — mixed content, a browser
  // rule nobody can switch off. So on the published page there is nothing to
  // try, nothing fails, and this stays a simulator. Served by bridge.py on your
  // own machine, the same file grows a live link.
  var bridge = { up:false, on:false, stream:false, busy:false,
                 last:0, sent:0, err:0, mark:0, count:0 };

  function liveInit(){
    if(location.protocol !== 'http:') return;
    fetch('/api/hello', { cache:'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if(!j || !j.bridge) return;
        bridge.up = true;
        liveCard.hidden = false;
        liveWled.textContent = j.offline ? 'no controller' : (j.wled || 'connected');
        devStatus.textContent = j.offline
          ? 'Bridge running, no controller attached.'
          : 'Bridge running — ' + j.wled + ' is reachable from here.';
        if(!hostName.value && j.wled) { hostName.value = j.wled; hostEcho.textContent = j.wled; }
        if(!j.offline) liveInfo();
      })
      .catch(function(){ /* no bridge on the other end; stay exactly as we were */ });
  }

  function liveInfo(){
    fetch('/api/info', { cache:'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(j){
        if(!j) return;
        var n = j.leds && j.leds.count;
        liveLeds.textContent = n ? (n + ' px · WLED ' + (j.ver||'')) : '—';
        // A mismatch here is the single most likely reason the real frame looks
        // wrong, so say so rather than letting it be discovered at the bench.
        if(n && n !== LEDS) liveLeds.textContent += '  ✱ page says ' + LEDS;
      })
      .catch(function(){});
  }

  var liveTimer = null;
  function livePush(){                       // called wherever state changes
    if(!bridge.up || !bridge.on) return;
    clearTimeout(liveTimer);
    liveTimer = setTimeout(liveSend, 90);    // a slider drag is one write, not fifty
  }
  function liveSend(){
    if(!bridge.up || !bridge.on) return;
    fetch('/api/state', { method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify(wledState()) })
      .then(function(r){ if(!r.ok) bridge.err++; })
      .catch(function(){ bridge.err++; });
  }

  var streamBuf = null;
  function liveStream(now){
    if(!bridge.up || !bridge.on || !bridge.stream) return;
    if(now - bridge.last < 33) return;        // 30 a second; the eye cannot use more
    // One request in flight at a time. If the network is slower than the frame
    // rate the right thing is to DROP frames, not to queue them — a queue turns
    // into latency you can see, and the frame would run behind the screen.
    if(bridge.busy) return;
    bridge.last = now;
    if(!streamBuf || streamBuf.length !== LEDS*3) streamBuf = new Uint8Array(LEDS*3);
    for(var i=0;i<LEDS;i++){
      streamBuf[i*3]   = pxR[i];
      streamBuf[i*3+1] = pxG[i];
      streamBuf[i*3+2] = pxB[i];
    }
    bridge.busy = true;
    fetch('/api/pixels', { method:'POST', headers:{'Content-Type':'application/octet-stream'},
                           body: streamBuf })
      .then(function(r){ if(r.ok) bridge.sent++; else bridge.err++; })
      .catch(function(){ bridge.err++; })
      .then(function(){ bridge.busy = false; });
    if(now - bridge.mark > 1000){
      var fps = Math.round((bridge.sent - bridge.count) * 1000 / (now - bridge.mark));
      liveRate.textContent = fps + ' fps' + (bridge.err ? '  ·  ' + bridge.err + ' dropped' : '');
      bridge.mark = now; bridge.count = bridge.sent;
    }
  }

  if(liveOn) liveOn.addEventListener('change', function(){
    bridge.on = liveOn.checked;
    if(bridge.on) liveSend();
    else liveRate.textContent = 'idle';
  });
  if(liveStreamEl) liveStreamEl.addEventListener('change', function(){
    bridge.stream = liveStreamEl.checked;
    if(bridge.stream){
      if(!liveOn.checked){ liveOn.checked = true; bridge.on = true; }
      // The pixels we send already have this page's brightness baked into them.
      // WLED would then multiply by its own master brightness, so the frame
      // would sit at brightness squared. Open it right up and let this page be
      // the only thing dimming anything.
      fetch('/api/state', { method:'POST', headers:{'Content-Type':'application/json'},
                            body: JSON.stringify({ on:true, bri:255, transition:0 }) })
        .catch(function(){});
    } else {
      liveRate.textContent = 'idle';
      liveSend();                            // hand the frame back to WLED's effects
    }
  });
  if(liveSegs) liveSegs.addEventListener('click', function(){
    // Writes the four sides into the controller as segments. Run once after
    // wiring, and again whenever the pixel count changes.
    var segs = [0,1,2,3].map(function(i){
      return { id:i, start:i*state.perSide, stop:(i+1)*state.perSide, on:true };
    });
    if(liveSegs.disabled) return;           // one write per press, whatever the browser does
    liveSegs.disabled = true;
    liveSegs.textContent = 'Writing…';
    fetch('/api/state', { method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify({ seg: segs }) })
      .then(function(r){ liveSegs.textContent = r.ok ? 'Written' : 'Failed — is it reachable?'; })
      .catch(function(){ liveSegs.textContent = 'Failed — is it reachable?'; })
      .then(function(){ setTimeout(function(){
        liveSegs.disabled = false;
        liveSegs.textContent = 'Write the four segments'; }, 2200); });
  });

  // ---------- device ----------
  hostName.addEventListener('input', function(){
    state.host = hostName.value.trim() || 'life-frame.local';
    hostEcho.textContent = state.host;
    saveState();
  });

  // ---------- photo mode ----------
  var shotRunning = false;
  function runShot(){
    if(shotRunning) return;
    shotRunning = true;
    closeDrawer();
    var saved = snapshotLook();
    var n = +shotDelay.value || 3, hold = +shotHold.value || 1600;
    shot.hidden = false;
    (function tick(k){
      if(k > 0){
        shotCount.textContent = k;
        shotCount.style.animation = 'none';
        void shotCount.offsetWidth;
        shotCount.style.animation = '';
        setTimeout(function(){ tick(k-1); }, 1000);
      } else {
        shotCount.textContent = '';
        photoHold = true;
        state.brightness = 100; state.motion = 'hold';
        syncUI();
        shot.classList.add('flash');
        setTimeout(function(){ shot.classList.remove('flash'); }, 500);
        setTimeout(function(){
          shot.hidden = true; photoHold = false; shotRunning = false;
          applyLook(saved);
        }, hold);
      }
    })(n);
  }
  startShot.addEventListener('click', runShot);

  function copyJson(){
    var text = jsonBlock.textContent;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){
        copyStatus.textContent = 'copied';
        setTimeout(function(){ copyStatus.textContent=''; }, 1600);
      }, function(){});
    }
  }

  function syncMenuUI(){
    var pitch = state.sideCm / state.perSide;
    totalPx.textContent = LEDS;
    pitchPx.textContent = pitch.toFixed(1) + ' cm';
    var totalLeds = Math.round((state.ledsPerM||0) * state.sideCm/100 * 4);
    ledCount.textContent = state.ledsPerM ? totalLeds.toLocaleString() : '—';
    ledsPer.textContent = state.ledsPerM ? Math.round(totalLeds/LEDS) : '—';
    cobToggle.checked = state.cob;
    diffuseToggle.checked = state.diffuse;
    if(document.activeElement !== sideCmEl) sideCmEl.value = state.sideCm;
    if(document.activeElement !== perSideEl) perSideEl.value = state.perSide;
    stripPreset.value = (state.density||0) + ':' + (state.ledsPerM||0);
    if(document.activeElement !== hostName) hostName.value = state.host;
    hostEcho.textContent = state.host;
    var isPillars = state.layout === 'pillars';
    stageCaption.innerHTML = (isPillars
        ? '4 pillars, ' + state.sideCm + ' cm tall&nbsp;&nbsp;·&nbsp;&nbsp;' + LEDS + ' pixels, ' + state.perSide + ' each'
        : state.sideCm + ' × ' + state.sideCm + ' cm square&nbsp;&nbsp;·&nbsp;&nbsp;' + LEDS + ' addressable pixels, ' + state.perSide + ' a side')
      + '<br>'
      + (state.ledsPerM ? (state.ledsPerM * state.sideCm/100 * 4).toLocaleString() + ' LEDs · ' : '')
      + pitch.toFixed(1) + ' cm pitch'
      + (isPillars ? ' · same four segments' : '');
    scaleLabel.innerHTML = state.sideCm + '&nbsp;CM';
    credit.style.opacity = 1;
    // Every one of these was drawing its amber fill at the default 50%,
    // whatever the handle was doing — the two never agreed.
    function hudRange(el, v){
      el.value = v;
      el.style.setProperty('--fill', Math.max(0, Math.min(100, v)) + '%');
    }
    hudRange(hudBri, state.brightness);
    hudRange(hudSpeed, state.speed);
    hudRange(hudAmount, state.amount);
    hudRange(hudSat, state.sat);
    UI.hudLayout.forEach(function(b){
      b.classList.toggle('active', b.dataset.hudLayout === state.layout);
    });
    UI.hudMotion.forEach(function(b){
      b.classList.toggle('active', b.dataset.hudMotion === state.motion);
    });
    UI.hudMood.forEach(function(b){
      b.classList.toggle('active', state.mode === 'mood' && b.dataset.hudMood === state.mood);
    });
    // keep the 3D scene picker in step with whatever is saved
    var want = (state.scenes || []).map(function(sc){ return sc.name; }).join('\u0000');
    if(hudScene.dataset.sig !== want){
      hudScene.dataset.sig = want;
      hudScene.innerHTML = '<option value="">Scene\u2026</option>';
      (state.scenes || []).forEach(function(sc, i){
        var o = document.createElement('option');
        o.value = i; o.textContent = sc.name;
        hudScene.appendChild(o);
      });
      hudScene.value = '';
    }
    credit.textContent = (isPillars ? '4 × ' + state.sideCm + ' cm pillars · ' : state.sideCm + ' cm square · ')
      + LEDS + ' pixels · L.I.F.E. controller';
  }


  // ---------- 3D view ----------
  // Lazily loaded: three.js only arrives the first time you ask for it, so the
  // panel stays light on a phone. The effect engine is shared — the same
  // pxR/pxG/pxB that paint the flat preview drive the emissive segments here.
  // The frame module from the SketchUp export: positions Int16 at 1/4096 m,
  // UVs Int16, split by the model's own part names so each gets its material.
  var PART_SCALE = 4096.0, PART_UVS = 1024.0;
  var PARTS = LIFE_DATA.parts;
  // Two sources. cdnjs first, jsDelivr as the fallback -- both are allowed by
  // the artifact CSP, and one of them being unreachable is not a reason to have
  // no 3D at all.
  var THREE_URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'
  ];
  var WALL_JPG = LIFE_DATA.wall;
  var three = { loaded:false, loading:false, ready:false };
  // Phones get a lighter scene: no environment cube, no point-light cube shadow,
  // coarser wall textures. The moon still casts, so the room keeps its shadows.
  // Last resort for a device that cannot compile the full shader: one light,
  // no shadows, no reflections. Sticky, so it survives a reload.
  var SAFE = false;
  try{
    // The old key was set by people escaping failures that are since fixed --
    // a stale opt-out shouldn't cost anyone shadows forever. Clear it once and
    // read the new one, which only this build can write.
    if(localStorage.getItem('life-safe3d')) localStorage.removeItem('life-safe3d');
    SAFE = localStorage.getItem('life-safe3d-v2') === '1';
  }catch(e){}
  var LITE = (function(){
    try{
      if(window.matchMedia && window.matchMedia('(hover:none)').matches) return true;
      return Math.min(screen.width, screen.height) <= 820;
    }catch(e){ return false; }
  })();
  // One place for every way 3D can fail, so a phone says what went wrong
  // instead of showing a black rectangle.
  function glNoteSet(msg, bad){
    glNote.textContent = msg || '';        // also clears any button already there
    glNote.hidden = !msg;
    glNote.classList.toggle('bad', !!bad);
  }
  // three.js reports a shader that will not compile through console.error and
  // then renders nothing at all -- which on a phone is indistinguishable from
  // "3D doesn't work". Listen for it and say so.
  var glWatching = false;
  function watchGlErrors(){
    if(glWatching || !window.console || !console.error) return;
    glWatching = true;
    var real = console.error;
    console.error = function(){
      try{
        var txt = Array.prototype.join.call(arguments, ' ');
        if(/shader|program|WebGL|GLSL|uniform/i.test(txt) && !three.failed){
          glFail(gpuLimits() + ' — ' + txt.slice(0, 220));
        }
      }catch(e){}
      return real.apply(console, arguments);
    };
  }
  // A scene that compiles but draws nothing looks identical to a broken canvas.
  // Read the framebuffer once, a couple of seconds in, and report if it is black.
  var blackChk = { t0:0, done:false };
  function checkBlack(){
    if(blackChk.done || !ren || three.failed) return;
    var now = performance.now();
    if(!blackChk.t0){ blackChk.t0 = now; return; }
    if(now - blackChk.t0 < 2600) return;
    blackChk.done = true;
    try{
      var gl = ren.getContext();
      var w = ren.domElement.width, h = ren.domElement.height;
      if(!gl || !w || !h) return;
      var buf = new Uint8Array(4), lit = false;
      for(var i=1;i<4 && !lit;i++){
        for(var j=1;j<4 && !lit;j++){
          gl.readPixels((w*i/4)|0, (h*j/4)|0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
          if(buf[0]+buf[1]+buf[2] > 14) lit = true;
        }
      }
      if(!lit) glFail('the scene rendered black. ' + gpuLimits());
    }catch(e){}
  }

  function gpuLimits(){
    try{
      var gl = ren && ren.getContext && ren.getContext();
      if(!gl) return 'no context';
      return 'frag uniforms ' + gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)
           + ', tex units ' + gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)
           + ', depth ' + (gl.getParameter(gl.DEPTH_BITS) || '?') + ' bits';
    }catch(e){ return 'limits unreadable'; }
  }

  function glFail(why){
    three.failed = true;
    three.loading = false;              // never leave the button dead
    glNoteSet('3D could not start: ' + why, true);
    if(!SAFE) offerSafe();
  }
  function offerFull(){
    if(glNote.querySelector('button')) return;
    var b = document.createElement('button');
    b.textContent = 'Use full 3D';
    b.className = 'safe-btn';
    b.addEventListener('click', function(){
      try{ localStorage.removeItem('life-safe3d-v2'); }catch(e){}
      location.reload();
    });
    glNote.appendChild(document.createElement('br'));
    glNote.appendChild(b);
  }
  function offerSafe(){
    if(glNote.querySelector('button')) return;
    var b = document.createElement('button');
    b.textContent = 'Try simple 3D';
    b.className = 'safe-btn';
    b.addEventListener('click', function(){
      try{ localStorage.setItem('life-safe3d-v2','1'); }catch(e){}
      location.reload();
    });
    glNote.appendChild(document.createElement('br'));
    glNote.appendChild(b);
  }
  var scn, cam, ren, ledMesh, ledGhost, frameMesh, floorMesh, room, pillarGroup;
  var runLights = [], apertureLight, concreteTex, figure, roomH = 7, roomW = 20;
  var bounce, envCam, envTarget, envTick = 0, sheens = null, apLayout = null;
  var frameBase = 0.97, frameBand = 0.22;
  var frameBevel = 0;
  var orbit = { az: -0.62, el: 0.20, dist: 8.0, drag:false, lx:0, ly:0 };
  // First-person mode. yaw 0 looks down -Z, so starting at +Z faces the frame.
  var walk = {
    on:false, x:0, z:5.4, yaw:0, pitch:-0.04, eye:1.62,
    vx:0, vz:0, keys:{}, joyX:0, joyY:0, last:0, run:false
  };
  var WALK_SPEED = 2.5, WALK_RUN = 4.2, BODY_R = 0.22;
  var dummy;

  function loadThree(cb){
    // The library is bundled into this page, in the tag just above this one, so
    // by the time this script runs THREE already exists. The CDN below is a
    // fallback for a page that somehow arrived without it, not the source.
    if(window.THREE){ three.loaded = true; three.loading = false; glNoteSet(''); return cb(); }
    if(three.loaded) return cb();
    if(three.loading) return;
    // Not there yet and the document is still arriving: wait for it rather than
    // declaring failure. Tapping 3D during the load used to skip straight to
    // the CDN and report "blocked" on a page that had the library all along.
    if(document.readyState !== 'complete'){
      three.loading = true;
      glNoteSet('Loading 3D…');
      var settled0 = false;
      var go = function(){
        if(settled0) return;
        settled0 = true;
        window.removeEventListener('load', go);
        three.loading = false;
        loadThree(cb);
      };
      window.addEventListener('load', go);
      setTimeout(go, 6000);
      return;
    }
    three.loading = true;
    three.failed = false;
    var i = 0, settled = false, timer = null;

    function done(){ clearTimeout(timer); settled = true; three.loading = false; }
    function ok(){
      if(settled) return;
      done(); three.loaded = true; glNoteSet('');
      cb();
    }
    // A script tag that neither loads nor errors used to leave three.loading
    // stuck true, which made every later tap on 3D do absolutely nothing.
    function fail(why){
      if(settled) return;
      clearTimeout(timer);
      i++;
      if(i < THREE_URLS.length){ attempt(); return; }
      done();
      setView('2d');                                  // restore the flat UI first
      glFail('the 3D library would not load (' + why + '). '
             + 'Usually the network — try again on another connection.');
    }
    function attempt(){
      glNoteSet('Loading 3D…');
      var sc = document.createElement('script');
      sc.async = true;
      sc.src = THREE_URLS[i];
      sc.onload = function(){ window.THREE ? ok() : fail('loaded but empty'); };
      sc.onerror = function(){ fail('blocked'); };
      timer = setTimeout(function(){ fail('timed out'); }, 8000);
      document.head.appendChild(sc);
    }
    attempt();
  }

  // ---------- the low-poly kit ----------
  // Four trees, three bushes, three grass clumps and three rocks, modelled in
  // metres and kept that way: Tree4 really is 6.85 m and Grass2 really is 23 cm,
  // so nothing here needs a fudge factor. They ride in the page the way the
  // poser does — Int16 positions at 1/4096 m, Uint16 indices — because the
  // sandbox cannot fetch a file. Each model carries two index groups, the
  // leaves and the wood, so one mesh paints in two colours.
var LP=LIFE_DATA.lowPoly;

  function b64u16(b64){
    var bin = atob(b64), n = bin.length, by = new Uint8Array(n);
    for(var i=0;i<n;i++) by[i] = bin.charCodeAt(i);
    return new Uint16Array(by.buffer);
  }
  function lpModel(nm){
    var rec = LP[nm];
    if(!rec.dec){
      var pi = b64ints(rec.p), pos = new Float32Array(pi.length);
      for(var i=0;i<pi.length;i++) pos[i] = pi[i] / 4096;      // back to metres
      rec.dec = { pos:pos, l: rec.l ? b64u16(rec.l) : null,
                           t: rec.t ? b64u16(rec.t) : null };
    }
    return rec.dec;
  }

  // A hundred and fifty plants as a hundred and fifty meshes would be a hundred
  // and fifty draw calls, and again in the shadow pass, every frame, for scenery
  // that never moves. So they are baked: each copy is transformed where it
  // stands and appended to one buffer per colour. Four meshes for the lot.
  function LPBatch(){ this.p = []; this.i = []; this.n = 0; }
  LPBatch.prototype.add = function(nm, which, m){
    var d = lpModel(nm), ix = d[which];
    if(!ix) return;
    var base = this.n, p = d.pos, v = LPBatch._v || (LPBatch._v = new THREE.Vector3());
    for(var k=0;k<p.length;k+=3){
      v.set(p[k], p[k+1], p[k+2]).applyMatrix4(m);
      this.p.push(v.x, v.y, v.z);
    }
    this.n += p.length/3;
    for(var j=0;j<ix.length;j++) this.i.push(ix[j] + base);
  };
  LPBatch.prototype.mesh = function(mat, cast, recv){
    if(!this.i.length) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    // Uint16 indexes 65535 vertices, which is the real ceiling here, not the
    // index count — every batch below is an order of magnitude under it.
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1)
                              : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeVertexNormals();
    var me = new THREE.Mesh(g, mat);
    me.castShadow = !!cast; me.receiveShadow = !!recv;
    return me;
  };

  function buildScene(){
    var W3 = glCanvas.clientWidth || 420, H3 = glCanvas.clientHeight || 420;
    ren = new THREE.WebGLRenderer({ canvas:glCanvas, antialias:!LITE, alpha:true,
                                    powerPreference:'high-performance' });
    ren.setPixelRatio(1);
    glCanvas.addEventListener('webglcontextlost', function(e){
      e.preventDefault();
      glFail('the browser dropped the 3D context — usually memory. Reload the page.');
    });
    ren.shadowMap.enabled = !SAFE;
    ren.shadowMap.type = LITE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    ren.shadowMap.autoUpdate = false;      // nothing moves — bake on change, not per frame
    ren.setSize(W3, H3, false);
    scn = new THREE.Scene();
    // Keep near/far close to the ratio that was known good. A wide frustum
    // z-fights badly wherever the depth buffer is only 16 bits, which is a
    // thing phones still do — the sky is brought in close instead.
    cam = new THREE.PerspectiveCamera(38, W3/H3, 0.15, 95);
    dummy = new THREE.Object3D();

    // Night ambient, keyed to the moon: a cool sky term from above, near-black
    // from the floor, and only a whisper of flat ambient underneath.
    scn.add(new THREE.AmbientLight(0x37465f, 0.62));
    // Standing in for the light a path tracer would bounce off the concrete: the
    // room's own colour, fed back as a hemisphere. Cheap, and it is most of what
    // ray tracing would visibly buy here.
    // doubles as the night sky term: cool from above, near-black from the floor,
    // then re-coloured every frame by whatever the strip is doing
    bounce = new THREE.HemisphereLight(0x3d5c8c, 0x14161b, 0.30);
    scn.add(bounce);

    // a cube capture of the room, used as the environment for water and metal —
    // real reflections without a second renderer
    // RGBAFormat, not RGBFormat: RGB8 is not reliably colour-renderable under
    // WebGL2, which is what phones give you — an RGB cube target comes back as
    // an incomplete framebuffer and takes the whole scene down with it.
    if(!LITE && !SAFE){
      envTarget = new THREE.WebGLCubeRenderTarget(128, { format: THREE.RGBAFormat,
                    generateMipmaps:true, minFilter: THREE.LinearMipmapLinearFilter });
      envCam = new THREE.CubeCamera(0.3, 40, envTarget);
      envCam.position.set(0, 1.4, 0);
      scn.add(envCam);
    }
    // the soft side of the same moonlight, unshadowed, so nothing goes pure black
    var fill = new THREE.DirectionalLight(0x9fb4d6, 0.34);
    fill.position.set(6.4, 5.0, 5.3);
    scn.add(fill);

    // One spotlight per run, carrying that run's average colour. Two of them
    // cast shadows — on concrete the pools and the figure's shadow actually read,
    // which they never did against a near-black wall.
    // four in the full scene, one in safe mode -- fewer lights is the single
    // biggest thing you can do for a fragment shader that will not compile
    for(var li=0; li<(SAFE ? 1 : 4); li++){
      var sp = new THREE.SpotLight(0xffffff, 2, 13, 1.15, 0.9, 1.9);
      // Each run casts its own shadow, so the four sides throw four separately
      // coloured shadows instead of one white one. Four extra shadow maps is a
      // lot of fragment uniforms, so phones keep the single point-light shadow.
      sp.castShadow = !LITE && !SAFE;
      if(sp.castShadow){
        sp.shadow.mapSize.width = 512; sp.shadow.mapSize.height = 512;
        sp.shadow.camera.near = 0.4; sp.shadow.camera.far = 16;
        sp.shadow.bias = -0.0015;
        sp.shadow.normalBias = 0.02;
      }
      scn.add(sp); scn.add(sp.target);
      runLights.push(sp);
    }

    // the emitter, sitting in the aperture. Everything the frame blocks goes dark,
    // and what passes through the opening throws across the floor.
    apertureLight = new THREE.PointLight(0xffffff, 3, 44, 0.55);
    // A point-light shadow is a whole cube, but it is also the entire effect --
    // the frame's mass carving hard wedges out of the light. Phones get a
    // smaller cube rather than none.
    apertureLight.castShadow = !SAFE;
    apertureLight.shadow.mapSize.width = LITE ? 256 : 512;
    apertureLight.shadow.mapSize.height = LITE ? 256 : 512;
    apertureLight.shadow.camera.near = 0.15;
    apertureLight.shadow.camera.far = 40;
    apertureLight.shadow.bias = -0.004;
    scn.add(apertureLight);

    concreteTex = makeConcrete();

    function surf(rep, colour, shine, spec){
      var t = concreteTex.clone();
      t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep[0], rep[1]);
      return new THREE.MeshPhongMaterial({
        color:colour, map:t, bumpMap:t, bumpScale:0.05,
        shininess:shine, specular:spec
      });
    }

    // Centred opening. That forces the moon's elevation: the beam slides
    // 8/tan(elevation) metres sideways on its way down, so for the frame to
    // stand in it the opening has to be wide and the moon can't be too low.
    // 9 m and 62° is the pair that just works.
    var RW = 20, RD = 20, RH = 7, SKY = 9.0;   // square hall, 9 m skylight
    var SKX = 0, SKZ = 0;                      // centred
    roomH = RH; roomW = RW;
    room = new THREE.Group();

    // seamless slab — one big plane, texture repeats without a visible join
    floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD, 24, 24),
                               surf([5,5], 0x807d77, 44, 0x33333a));
    floorMesh.rotation.x = -Math.PI/2; floorMesh.receiveShadow = true;
    room.add(floorMesh);


    // four walls, each facing in — invisible from outside, so you can orbit out of the room
    var wallMeshes = [];
    function wall(w, h, x, y, z, ry){
      var mat = new THREE.MeshPhongMaterial({ color:0x6f6c66, shininess:3, specular:0x121214 });
      // the walls face inward, so the moon hits their backs — without this the
      // light passes straight through them and pools on the floor inside
      mat.shadowSide = THREE.DoubleSide;
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 12, 8), mat);
      m.position.set(x,y,z); m.rotation.y = ry;
      m.receiveShadow = true; m.castShadow = true;
      room.add(m); wallMeshes.push([m, w, h]);
    }
    wall(RW, RH,  0, RH/2, -RD/2, 0);
    wall(RW, RH,  0, RH/2,  RD/2, Math.PI);
    wall(RD, RH, -RW/2, RH/2, 0,  Math.PI/2);
    wall(RD, RH,  RW/2, RH/2, 0, -Math.PI/2);

    // build each wall its own surface once the photograph is decoded
    var im = new Image();
    im.onload = function(){
      wallImg = im;
      wallMeshes.forEach(function(rec, i){
        var t = makeWallCanvas(rec[1], rec[2], 137 + i*911);
        rec[0].material.map = t;
        rec[0].material.bumpMap = t;
        rec[0].material.bumpScale = 0.05;
        rec[0].material.needsUpdate = true;
      });
    };
    im.src = WALL_JPG;

    // ceiling with a rectangular opening cut out of it
    var cShape = new THREE.Shape();
    cShape.moveTo(-RW/2,-RD/2); cShape.lineTo(RW/2,-RD/2);
    cShape.lineTo(RW/2,RD/2);   cShape.lineTo(-RW/2,RD/2);
    cShape.lineTo(-RW/2,-RD/2);
    var sky = new THREE.Path();
    var sx0 = SKX - SKY/2, sx1 = SKX + SKY/2, sz0 = SKZ - SKY/2, sz1 = SKZ + SKY/2;
    sky.moveTo(sx0, sz0); sky.lineTo(sx0, sz1);
    sky.lineTo(sx1, sz1); sky.lineTo(sx1, sz0);
    sky.lineTo(sx0, sz0);
    cShape.holes.push(sky);
    // A 5 m slab, not a sheet: extruded so the skylight is a shaft you look UP,
    // not a hole in a lid. Depth is what makes an opening read as architecture —
    // the moon has to travel five metres of concrete before it reaches the room,
    // and from the floor the walls of the shaft frame the sky more than the rim
    // does. It also hides most of the treeline: at 6 m out a tree now needs to
    // clear 3.5 m before any of it shows over the top edge.
    // ExtrudeGeometry pushes along +Z, and rotation.x = +90° sends that to -Y,
    // so the mesh sits at RH + SLAB and the underside lands back on RH.
    var SLAB = 5.0;                             // 1.0 was a lid; this is a light well
    var ceilMat = surf([0.5, 0.5], 0x56544f, 2, 0x0e0e10);
    var ceil = new THREE.Mesh(
      new THREE.ExtrudeGeometry(cShape, { depth:SLAB, bevelEnabled:false, curveSegments:1 }),
      ceilMat);
    ceil.rotation.x = Math.PI/2; ceil.position.y = RH + SLAB;
    ceil.castShadow = true; ceil.receiveShadow = true;      // it is what shapes the moonlight
    room.add(ceil);

    // The four shaft walls, stained. Each is a transparent overlay standing
    // 12 mm proud of the extruded face — far enough not to fight it for depth,
    // close enough that nothing sees the gap. Two textures serve four walls:
    // the pair on the other axis is mirrored, which is free and reads as new.
    var stainA = makeRainStain(1207), stainB = makeRainStain(8831);
    function shaftWall(tex, mirror, x, z, ry){
      var t = tex.clone(); t.needsUpdate = true;
      if(mirror){ t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
      var m = new THREE.Mesh(new THREE.PlaneGeometry(SKY, SLAB),
        new THREE.MeshPhongMaterial({ map:t, transparent:true, depthWrite:false,
          shininess:0, specular:0x000000 }));
      m.position.set(x, RH + SLAB/2, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      room.add(m);
    }
    var SIN = 0.012;
    shaftWall(stainA, false, SKX, SKZ - SKY/2 + SIN, 0);
    shaftWall(stainB, false, SKX, SKZ + SKY/2 - SIN, Math.PI);
    shaftWall(stainA, true,  SKX - SKY/2 + SIN, SKZ, Math.PI/2);
    shaftWall(stainB, true,  SKX + SKY/2 - SIN, SKZ, -Math.PI/2);

    // and the drip line under the lower lip, a stained band right round the hole
    var rimStain = new THREE.Mesh(new THREE.PlaneGeometry(15, 15),
      new THREE.MeshPhongMaterial({ map: makeRimStain(), transparent:true,
        depthWrite:false, shininess:0, specular:0x000000 }));
    rimStain.rotation.x = Math.PI/2;                        // face down
    rimStain.position.set(SKX, RH + 0.01, SKZ);
    rimStain.receiveShadow = true;
    room.add(rimStain);

    // A real sky, not a lid: an equirectangular starfield on the inside of a
    // sphere, so it holds up wherever you stand and whichever way the shaft
    // frames it. Radius 78 keeps its far side inside the camera's 95 m range.
    var skyBall = new THREE.Mesh(new THREE.SphereGeometry(78, 64, 40),
      new THREE.MeshBasicMaterial({ map: makeSky(), side: THREE.BackSide, fog:false }));
    // An equirectangular map pinches at its poles, and the pole of an untouched
    // sphere sits at the zenith — exactly where the shaft points. Lay the poles
    // down on the horizon, where nothing can see them, and the milky way band
    // becomes a great circle arcing overhead, which is where it belongs.
    skyBall.rotation.set(Math.PI/2, 0.85, 0);
    room.add(skyBall);
    room.add(makeStars(74));

    // The moon, hung on the light's own vector so the beam on the floor and the
    // disc overhead agree. Same compass bearing as before, raised to 62°: the
    // lowest it can sit and still drop its beam through a centred opening onto
    // the frame. Horizontal run 10.65, so vertical = 10.65 * tan 62°.
    var MOON_DIR = new THREE.Vector3(8.2, 20.03, 6.8).normalize();
    var moonSprite = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5),
      new THREE.MeshBasicMaterial({ map: makeMoon(), transparent:true,
                                    depthWrite:false, opacity:0.98 }));
    moonSprite.position.copy(MOON_DIR).multiplyScalar(30);
    moonSprite.lookAt(0, 1.6, 0);
    room.add(moonSprite);
    room.userData.moon = moonSprite;

    var moon = new THREE.DirectionalLight(0xa8bcdc, 0.86);
    // A directional light's position exists only to place its shadow camera.
    // At 14 units this one sat INSIDE the hall, barely above the roof, so a
    // large slice of the ceiling fell outside its frustum, cast nothing, and
    // let the moon through unshadowed — the hard-edged wedge on the floor.
    // Stand it well outside, aimed at the room's centre, with the box sized to
    // the room's bounding sphere (centre 0,4,0 — radius about 14.7).
    moon.position.copy(MOON_DIR).multiplyScalar(34);
    moon.target.position.set(0, 0, 0);          // direction is exactly MOON_DIR
    moon.castShadow = !SAFE;
    var ms = LITE ? 1024 : 3072;               // 10 mm a texel across the room
    moon.shadow.mapSize.width = ms; moon.shadow.mapSize.height = ms;
    moon.shadow.camera.near = 7; moon.shadow.camera.far = 53;    // 7: the treetops are 21 m up now
    moon.shadow.camera.left = -15.5; moon.shadow.camera.right = 15.5;
    moon.shadow.camera.top = 15.5; moon.shadow.camera.bottom = -15.5;
    moon.shadow.bias = -0.0009;
    moon.shadow.normalBias = 0.03;
    room.add(moon); room.add(moon.target);

    // puddles
    var puddles = new THREE.Group();
    [[-3.4, 2.6, 1.5, 1.0, 41], [2.9, -3.1, 1.15, 0.85, 907], [4.6, 2.2, 0.8, 1.25, 233],
     [-5.2, -1.4, 0.95, 0.7, 613], [0.9, 4.4, 1.3, 0.9, 77]].forEach(function(q){
      puddles.add(puddle(q[0], q[1], q[2], q[3], q[4]));
    });
    room.add(puddles);
    room.userData.puddles = puddles;

    // --- the planting, everywhere: grass through the floor, a treeline on the
    // roof, and rubble where the roof has already come down. All of it is the
    // low-poly kit, baked into four meshes — leaves, wood, blades, stone — no
    // matter how many copies are standing. The materials are shared, so a plant
    // on the roof and a plant on the floor cost the same nothing.
    // Specular is switched off on every growing thing. The frame throws a very
    // bright white pool at its own feet, and a Phong highlight sitting in that
    // pool turned the blade tips white — grass lit like wet plastic. Leaves and
    // blades are pure diffuse; only the stone keeps a little sheen, because a
    // stone under a leaking roof genuinely has one.
    var lpLeaf  = new THREE.MeshPhongMaterial({ color:0x141c0c, shininess:0,
                    specular:0x000000, flatShading:true, side:THREE.DoubleSide });
    var lpWood  = new THREE.MeshPhongMaterial({ color:0x1d1915, shininess:0,
                    specular:0x000000, flatShading:true });
    var lpBlade = new THREE.MeshPhongMaterial({ color:0x212c15, shininess:0,
                    specular:0x000000, flatShading:true, side:THREE.DoubleSide });
    var lpRock  = new THREE.MeshPhongMaterial({ color:0x3b3934, shininess:5,
                    specular:0x0e0e10, flatShading:true });
    var bLeaf = new LPBatch(), bWood = new LPBatch(),
        bBlade = new LPBatch(), bRock = new LPBatch();

    // grass, the way it grew through the ground at the real installation:
    // a soft-edged mat on the slab, and real clumps standing in it
    var matTex = makeGrassMat();
    var matMat = new THREE.MeshLambertMaterial({ map: matTex, transparent:true,
                   depthWrite:false, opacity:0.55, color:0x74806a });
    var PATCHES = [[-1.55, 0.55, 0.95, 16],   // at the foot of the frame
                   [ 1.70, 0.30, 0.80, 13],
                   [ 0.10, 1.85, 0.70, 11],
                   [-0.60,-1.95, 0.62,  9],
                   [ 3.30,-1.40, 0.95, 15],
                   [-3.60,-0.70, 1.10, 18],
                   [ 2.40, 2.70, 0.75, 12],
                   [-2.70, 2.30, 0.58,  8]];
    var gseed = 20261;
    function grnd(){ gseed = (gseed*9301 + 49297) % 233280; return gseed/233280; }

    var GRASS = ['Grass2', 'Grass3', 'Grass1', 'Grass3', 'Grass2'];
    // One clump, planted: y is always 0 because every model was re-based with
    // its feet on the origin, so nothing has to be floated by half its height.
    function plantGrass(x, z, s, y){
      var kind = GRASS[Math.floor(grnd()*GRASS.length)];
      gd.position.set(x, y || 0, z);
      gd.rotation.set((grnd()-0.5)*0.14, grnd()*Math.PI*2, (grnd()-0.5)*0.14);
      gd.scale.set(s*(0.85 + grnd()*0.3), s, s);
      gd.updateMatrix();
      bBlade.add(kind, 'l', gd.matrix);
      if(kind === 'Grass1'){                     // a flat card — cross it for body
        gd.rotation.y += Math.PI/2;
        gd.updateMatrix(); bBlade.add(kind, 'l', gd.matrix);
      }
    }

    var mats = [], gd = new THREE.Object3D();
    PATCHES.forEach(function(q){
      var cx = q[0], cz = q[1], r = q[2];
      gd.position.set(cx, 0.006, cz);
      gd.rotation.set(-Math.PI/2, 0, grnd()*Math.PI);
      gd.scale.set(r*2, r*2, 1);
      gd.updateMatrix(); mats.push(gd.matrix.clone());
      var n = LITE ? Math.round(q[3]*0.85) : Math.round(q[3]*1.7);
      for(var i=0;i<n;i++){
        var a2 = grnd()*Math.PI*2, rr = r*0.86*Math.sqrt(grnd());
        plantGrass(cx + Math.cos(a2)*rr, cz + Math.sin(a2)*rr, 0.34 + grnd()*0.50);
      }
    });

    var unit = new THREE.PlaneGeometry(1, 1);
    var grassMats = new THREE.InstancedMesh(unit, matMat, mats.length);
    mats.forEach(function(m, i){ grassMats.setMatrixAt(i, m); });
    grassMats.instanceMatrix.needsUpdate = true;
    grassMats.receiveShadow = true;
    room.add(grassMats);

    // The blades are real geometry now rather than crossed alpha cards, which
    // settles the argument the cards kept losing: they cast a shadow the map can
    // actually resolve, and they can receive one without shadowing themselves
    // black from every angle. Built at the end, once everything has been planted.

    // What actually sells grass standing on concrete: a soft occlusion pool under
    // each patch. Resolution-independent, one draw call, and it does the job the
    // shadow map cannot do at this scale.
    var contactTex = makeContact();
    var contactMat = new THREE.MeshBasicMaterial({ map:contactTex, transparent:true,
                       depthWrite:false, opacity:0.14, color:0x05070a });
    var pools = [];
    PATCHES.forEach(function(q){
      gd.position.set(q[0], 0.0035, q[1]);
      gd.rotation.set(-Math.PI/2, 0, 0);
      gd.scale.set(q[2]*1.85, q[2]*1.85, 1);
      gd.updateMatrix(); pools.push(gd.matrix.clone());
    });
    var grassPools = new THREE.InstancedMesh(unit, contactMat, pools.length);
    pools.forEach(function(m, i){ grassPools.setMatrixAt(i, m); });
    grassPools.instanceMatrix.needsUpdate = true;
    grassPools.renderOrder = -1;
    room.add(grassPools);

    // a few things left in the hall, so it reads as a place rather than a box
    var blockMat = surf([1,1], 0x7c7973, 5, 0x151517);
    function block(w,h,d,x,z,ry){
      var m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), blockMat);
      m.position.set(x, h/2, z); m.rotation.y = ry||0;
      m.castShadow = true; m.receiveShadow = true; room.add(m);
    }
    block(1.2, 0.55, 0.9, -6.4, -4.2, 0.22);          // concrete blocks
    block(0.9, 0.9, 0.9, -7.1, -2.6, -0.15);
    block(1.6, 0.35, 1.1, 6.2, -5.1, 0.1);

    var caseMat = new THREE.MeshPhongMaterial({ color:0x1b1d22, shininess:24, specular:0x2a2d33 });
    var trunk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.68, 0.62), caseMat);
    trunk.position.set(5.6, 0.34, 3.4); trunk.rotation.y = -0.35;
    trunk.castShadow = true; trunk.receiveShadow = true; room.add(trunk);
    var trimMat = new THREE.MeshPhongMaterial({ color:0xa8adb5, shininess:100, specular:0xd8dce2 });
    [[-0.55,0.31],[0.55,0.31],[-0.55,-0.31],[0.55,-0.31]].forEach(function(e){
      var edge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.70, 0.05), trimMat);
      edge.position.set(trunk.position.x + e[0]*Math.cos(trunk.rotation.y), 0.34,
                        trunk.position.z - e[0]*Math.sin(trunk.rotation.y) + e[1]);
      edge.castShadow = true; room.add(edge);
    });

    var coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.075, 6, 22),
      new THREE.MeshPhongMaterial({ color:0x14161a, shininess:30, specular:0x24272c }));
    coil.rotation.x = -Math.PI/2; coil.position.set(-4.6, 0.075, 4.6);
    coil.castShadow = true; coil.receiveShadow = true; room.add(coil);

    // --- a treeline on the roof, ringing the opening.
    // The grass came up through the floor; this is the same story one storey
    // higher, in a slab nobody has repaired for years. It is also the only thing
    // besides sky you can see through the shaft, which is what finally gives the
    // opening a distance — until now it read as a hole in a lid.
    var roofY = RH + SLAB;
    var TREES = LITE ? 9 : 15;
    var tseed = 51217;
    function trnd(){ tseed = (tseed*9301 + 49297) % 233280; return tseed/233280; }

    var TKIND = ['Tree1', 'Tree2', 'Tree3', 'Tree4'];
    var BKIND = ['Bush1', 'Bush2', 'Bush3'];
    var RKIND = ['Rock1', 'Rock2', 'Rock3'];
    var rootM = [], td = new THREE.Object3D(), yawM = new THREE.Matrix4();

    // A square ring, not a circle: the opening is square, and on a circle the
    // corner plants would be standing in mid-air over the hole.
    function ringXZ(a, halfW){
      var ca = Math.cos(a), sa = Math.sin(a);
      var rad = halfW / Math.max(Math.abs(ca), Math.abs(sa));
      return [Math.max(-9.2, Math.min(9.2, ca*rad)),
              Math.max(-9.2, Math.min(9.2, sa*rad)), ca, sa];
    }
    // Plant it at metres tall rather than at a scale factor — the models are
    // already in metres, so "I want a six metre tree" is one division.
    function plant(kind, x, y, z, metres, leanX, leanZ){
      var s = metres / LP[kind].h;
      td.position.set(x, y, z);
      td.rotation.set(leanX || 0, 0, leanZ || 0);
      td.scale.set(s, s, s);
      td.updateMatrix();
      td.matrix.multiply(yawM.makeRotationY(trnd()*6.283));   // spin after the lean
      bLeaf.add(kind, 'l', td.matrix);
      bWood.add(kind, 't', td.matrix);
    }

    for(var ti=0; ti<TREES; ti++){
      var ta = (ti + 0.5)/TREES * Math.PI*2 + (trnd()-0.5)*0.34;
      // The moon comes in over +x/+z at 62°, so a crown on that side would drop
      // its shade straight down the shaft and onto the frame. Those trees stand
      // further back, where the same shadow lands on the roof instead.
      var moonward = (Math.cos(ta)*0.77 + Math.sin(ta)*0.64) > 0.2;
      var g = ringXZ(ta, (moonward ? 7.6 : 5.7) + trnd()*1.3);
      // Through five metres of shaft you see nothing below the top edge, so
      // height is what decides whether a tree exists at all: at 6 m out the first
      // 3.5 m never shows, and past 8 m only a giant would.
      var th = (moonward ? 5.4 : 4.0) + trnd()*3.2;
      var lean = 0.035 + trnd()*0.075;               // everything leans to the light
      plant(TKIND[Math.floor(trnd()*4)], g[0], roofY, g[1], th, g[3]*lean, -g[2]*lean);

      td.position.set(g[0], roofY + 0.012, g[1]);    // the mat it seeded itself into
      td.rotation.set(-Math.PI/2, 0, trnd()*Math.PI);
      var rs = 1.0 + th*0.13;
      td.scale.set(rs, rs, 1);
      td.updateMatrix(); rootM.push(td.matrix.clone());
    }

    // undergrowth between the trunks, so the line has a bottom edge — and it
    // starts at 4.75, inside the 4.5 rim, so some of it overhangs the drop
    var UNDER = LITE ? 10 : 22;
    for(var ui=0; ui<UNDER; ui++){
      var ua = trnd()*Math.PI*2;
      var gu = ringXZ(ua, 4.75 + trnd()*3.6);
      if(trnd() < 0.62) plant(BKIND[Math.floor(trnd()*3)], gu[0], roofY, gu[1],
                              0.55 + trnd()*0.85, 0, 0);
      else plantGrass(gu[0], gu[1], 0.7 + trnd()*0.8, roofY);
    }

    // --- what grows on a wet lip.
    // The top edge of the shaft is the greenest thing in the building: it is
    // watered every time it rains and it is the last place anybody would weed.
    // These hang INTO the shaft, which is also the only place they can be seen
    // from the floor — from down there the rim is the horizon.
    var vtri = [];
    function vquad(a, b, c, d){
      vtri.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2],
                a[0],a[1],a[2], c[0],c[1],c[2], d[0],d[1],d[2]);
    }
    function vine(px, pz, nx, nz, len){
      var n = 9, pts = [], swx = (trnd()-0.5)*0.55, swz = (trnd()-0.5)*0.55;
      for(var i=0;i<=n;i++){
        var t = i/n;
        // out over the lip first, then the fall takes over — t² is gravity
        var over = 0.05 + Math.sin(t*1.55)*0.26;
        pts.push([px + nx*over + swx*t*t,
                  roofY - len*(0.14*t + 0.86*t*t),
                  pz + nz*over + swz*t*t]);
      }
      for(var j=0;j<n;j++){
        var a = pts[j], b = pts[j+1], hw = 0.020*(1 - j/n*0.65);   // the runner tapers
        vquad([a[0]-nz*hw, a[1], a[2]+nx*hw], [a[0]+nz*hw, a[1], a[2]-nx*hw],
              [b[0]+nz*hw, b[1], b[2]-nx*hw], [b[0]-nz*hw, b[1], b[2]+nx*hw]);
        var nl = 2 + (trnd() < 0.5 ? 1 : 0);
        for(var k=0;k<nl;k++){
          var ls = 0.055 + trnd()*0.090, ang = trnd()*6.283, tip = -0.35 - trnd()*0.5;
          var ux = Math.cos(ang)*ls, uz = Math.sin(ang)*ls, uy = tip*ls;
          var vx = -Math.sin(ang)*ls*0.55, vz = Math.cos(ang)*ls*0.55, vy = tip*ls*0.5;
          vquad(b, [b[0]+ux, b[1]+uy, b[2]+uz],
                   [b[0]+ux+vx, b[1]+uy+vy, b[2]+uz+vz],
                   [b[0]+vx, b[1]+vy, b[2]+vz]);
        }
      }
    }
    var VINES = LITE ? 16 : 46;
    for(var vi=0; vi<VINES; vi++){
      var ed = Math.floor(trnd()*4), al = (trnd()-0.5)*(SKY-0.7), vx0, vz0, vnx, vnz;
      if(ed === 0){      vx0 = SKX + al;       vz0 = SKZ - SKY/2; vnx = 0;  vnz = 1;  }
      else if(ed === 1){ vx0 = SKX + al;       vz0 = SKZ + SKY/2; vnx = 0;  vnz = -1; }
      else if(ed === 2){ vx0 = SKX - SKY/2;    vz0 = SKZ + al;    vnx = 1;  vnz = 0;  }
      else {             vx0 = SKX + SKY/2;    vz0 = SKZ + al;    vnx = -1; vnz = 0;  }
      vine(vx0, vz0, vnx, vnz, 0.85 + trnd()*2.6);
      // and a clump of grass at its root, so it is not growing out of bare concrete
      plantGrass(vx0 + vnx*0.16, vz0 + vnz*0.16, 0.7 + trnd()*0.7, roofY);
    }
    if(vtri.length){
      var vg = new THREE.BufferGeometry();
      vg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vtri), 3));
      vg.computeVertexNormals();
      var vm = new THREE.Mesh(vg, lpLeaf);       // same leaf colour as everything else
      vm.castShadow = !LITE; vm.receiveShadow = !LITE;
      room.add(vm);
    }

    // and the slab itself coming apart at the rim
    var RUBBLE = LITE ? 5 : 11;
    for(var ri=0; ri<RUBBLE; ri++){
      var ra = trnd()*Math.PI*2;
      var gr = ringXZ(ra, 4.9 + trnd()*3.8);
      var rk = RKIND[Math.floor(trnd()*3)], rm = 0.22 + trnd()*0.40;
      td.position.set(gr[0], roofY - rm*0.18, gr[1]);     // half sunk into the slab
      td.rotation.set((trnd()-0.5)*0.4, trnd()*6.283, (trnd()-0.5)*0.4);
      var rsc = rm / LP[rk].h;
      td.scale.set(rsc*(0.8+trnd()*0.5), rsc, rsc*(0.8+trnd()*0.5));
      td.updateMatrix(); bRock.add(rk, 't', td.matrix);
    }

    // --- and what fell INTO the hall, under the opening it fell through
    var INSIDE = LITE ? 4 : 9;
    for(var ii=0; ii<INSIDE; ii++){
      var ia = trnd()*Math.PI*2, ird = 4.6 + trnd()*3.6;   // clear of the frame
      var ix = Math.cos(ia)*ird, iz = Math.sin(ia)*ird;
      var ik = RKIND[Math.floor(trnd()*3)], im = 0.16 + trnd()*0.46;
      td.position.set(ix, -im*0.12, iz);
      td.rotation.set((trnd()-0.5)*0.5, trnd()*6.283, (trnd()-0.5)*0.5);
      var isc = im / LP[ik].h;
      td.scale.set(isc*(0.8+trnd()*0.5), isc, isc*(0.8+trnd()*0.5));
      td.updateMatrix(); bRock.add(ik, 't', td.matrix);
    }
    // a couple of bushes that took the corners, where nobody walks
    [[-7.4, -6.8, 0.9], [7.1, -7.3, 0.7], [-7.8, 6.9, 1.1]].forEach(function(q){
      plant(BKIND[Math.floor(trnd()*3)], q[0], 0, q[1], q[2], 0, 0);
    });

    // --- four meshes for every plant and stone in the piece
    function addBatch(b, mat){
      var m = b.mesh(mat, !LITE, !LITE);
      if(m) room.add(m);
      return m;
    }
    addBatch(bLeaf,  lpLeaf);
    addBatch(bWood,  lpWood);
    addBatch(bBlade, lpBlade);
    addBatch(bRock,  lpRock);

    var roots = new THREE.InstancedMesh(unit, matMat, rootM.length);
    rootM.forEach(function(x, i){ roots.setMatrixAt(i, x); });
    roots.instanceMatrix.needsUpdate = true;
    room.add(roots);

    scn.add(room);

    figure = buildFigure();
    scn.add(figure);

    pillarGroup = new THREE.Group();
    scn.add(pillarGroup);

    rebuildGeometry();
    three.ready = true;
  }

  // Seamless concrete: every blot is drawn nine times, wrapped across the edges,
  // so the tile joins have nothing to give away. Returned at 1024 with a matching
  // bump map, and enough grain that it does not read as painted plastic.
  // One canvas per wall, built by laying the photograph down as a grid with each
  // tile randomly flipped, then grimed over. Panels stay square because the tile
  // keeps the photo's aspect; nothing repeats because each wall is its own canvas.
  var wallImg = null;
  // Board-formed concrete, built rather than tiled.
  //
  // The old version cut the photograph into 5 m squares and flipped them at
  // random, which is why the joints wandered and the same crack showed up
  // mirrored next to itself. Now the structure is drawn on an exact grid --
  // panel joints, continuous board lines, tie holes -- and the photograph is
  // used only as grain underneath it.
  function makeWallCanvas(wm, wh, seed){
    // Power of two, and never larger than the driver allows. A non-power-of-two
    // texture with mipmaps is incomplete under WebGL1 and samples as pure black
    // — which is exactly what a wall-sized 2360 x 826 canvas was asking for.
    var maxT = 2048;
    try{
      var gl0 = ren && ren.getContext && ren.getContext();
      if(gl0) maxT = Math.min(2048, gl0.getParameter(gl0.MAX_TEXTURE_SIZE) || 2048);
    }catch(e){}
    var W = Math.min(maxT, LITE ? 1024 : 2048);
    var H = Math.min(maxT, LITE ? 512 : 1024);
    var PX = W/wm, PY = H/wh, PPM = Math.min(PX, PY);   // texels per metre, per axis
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var rnd = function(){ seed = (seed*9301 + 49297) % 233280; return seed/233280; };

    c.fillStyle = '#6f6c66'; c.fillRect(0, 0, W, H);

    // --- grain: the photograph, large and held well back, so its own joints
    //     read as mottling instead of competing with the grid we draw
    if(wallImg){
      var gw = W * 0.62, gh = gw * (wallImg.height/wallImg.width);
      c.globalAlpha = 0.34;
      for(var gy = -gh*0.3; gy < H; gy += gh*0.94){
        for(var gx = -gw*0.2; gx < W; gx += gw*0.92){
          c.save();
          c.translate(gx + gw/2, gy + gh/2);
          c.rotate((rnd()-0.5) * 0.05);
          c.scale(rnd() < 0.5 ? -1 : 1, 1);
          c.drawImage(wallImg, -gw/2, -gh/2, gw, gh);
          c.restore();
        }
      }
      c.globalAlpha = 1;
    }

    // --- the panel grid, sized so joints land exactly on the wall edges
    var cols = Math.max(2, Math.round(wm/2.5)), rows = Math.max(2, Math.round(wh/1.2));
    var PW = W/cols, PH = H/rows;

    // each pour is a slightly different grey -- this, not mirroring, is what
    // stops the wall reading as one repeated tile
    for(var pr=0; pr<rows; pr++){
      for(var pc=0; pc<cols; pc++){
        var v = (rnd()-0.5) * 0.13;
        c.fillStyle = (v < 0 ? 'rgba(30,29,27,' : 'rgba(228,226,220,') + Math.abs(v).toFixed(3) + ')';
        c.fillRect(pc*PW, pr*PH, PW, PH);
      }
    }

    // --- board marks: horizontal, ~150 mm, running the whole wall unbroken
    var bs = 0.15*PY;
    for(var by = bs; by < H; by += bs){
      c.fillStyle = 'rgba(48,46,43,0.10)'; c.fillRect(0, Math.round(by), W, 1);
      c.fillStyle = 'rgba(232,230,224,0.07)'; c.fillRect(0, Math.round(by)+1, W, 1);
    }

    // --- panel joints, a shade stronger than the board marks
    function joint(x, y, w, h){
      c.fillStyle = 'rgba(38,36,34,0.34)'; c.fillRect(x, y, w, h);
      c.fillStyle = 'rgba(236,234,228,0.13)';
      c.fillRect(x + (w > h ? 0 : Math.round(w)), y + (w > h ? Math.round(h) : 0), w, h);
    }
    var jw = Math.max(1, Math.round(PX*0.02));
    for(var jc=1; jc<cols; jc++) joint(Math.round(jc*PW), 0, jw, H);
    for(var jr=1; jr<rows; jr++) joint(0, Math.round(jr*PH), W, jw);

    // --- form-tie holes, two across and two down per panel, on the grid
    var hr = Math.max(1.6, PPM*0.021);
    for(var hc=0; hc<cols*2; hc++){
      for(var hrw=0; hrw<rows*2; hrw++){
        var hx = (hc + 0.5) * PW/2, hy = (hrw + 0.5) * PH/2;
        var sh = c.createRadialGradient(hx, hy, hr*0.2, hx, hy, hr*2.4);
        sh.addColorStop(0, 'rgba(40,38,35,0.30)');
        sh.addColorStop(1, 'rgba(40,38,35,0)');
        c.fillStyle = sh;
        c.beginPath(); c.arc(hx, hy, hr*2.4, 0, Math.PI*2); c.fill();
        c.fillStyle = 'rgba(30,29,27,0.82)';
        c.beginPath(); c.arc(hx, hy, hr, 0, Math.PI*2); c.fill();
        c.fillStyle = 'rgba(226,224,218,0.30)';
        c.beginPath(); c.arc(hx, hy + hr*0.55, hr*0.85, 0, Math.PI); c.fill();
      }
    }

    // --- weathering: dark at the base, streaks off the ties, broad unevenness
    var g = c.createLinearGradient(0, H*0.5, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(18,18,20,0.42)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for(var i=0;i<11;i++){
      var sx = rnd()*W, sw = PPM*(0.15 + rnd()*0.7), sy = rnd()*H*0.5;
      var sg = c.createLinearGradient(0, sy, 0, H);
      sg.addColorStop(0, 'rgba(34,32,30,0.00)');
      sg.addColorStop(0.15,'rgba(34,32,30,0.17)');
      sg.addColorStop(1,  'rgba(34,32,30,0.00)');
      c.fillStyle = sg; c.fillRect(sx, sy, sw, H - sy);
    }
    for(var k=0;k<16;k++){
      var bx = rnd()*W, byy = rnd()*H, br = PPM*(0.5 + rnd()*2.2);
      var bg = c.createRadialGradient(bx, byy, 0, bx, byy, br);
      bg.addColorStop(0, 'rgba(158,156,150,' + (0.05 + rnd()*0.08).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = bg; c.beginPath(); c.arc(bx, byy, br, 0, Math.PI*2); c.fill();
    }

    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;     // one texture, one wall, no tiling
    if(ren) t.anisotropy = ren.capabilities.getMaxAnisotropy();
    return t;
  }

  var sheenTex = null;
  function makeSheen(){
    var N = 128, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(N/2, N/2, 0, N/2, N/2, N/2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0,0,N,N);
    return new THREE.CanvasTexture(cv);
  }

  function puddle(x, z, rx, rz, seed){
    // The outline used to be fourteen random radii joined by straight lines, which
    // is exactly what a fourteen-sided puddle looks like. Three low harmonics with
    // random phase give the same irregular shape as a continuous function, so it
    // can be sampled as finely as it needs to be.
    var rnd = function(){ seed = (seed*9301+49297)%233280; return seed/233280; };
    var p1 = rnd()*6.283, p2 = rnd()*6.283, p3 = rnd()*6.283;
    var a1 = 0.10 + rnd()*0.12, a2 = 0.05 + rnd()*0.09, a3 = 0.03 + rnd()*0.05;
    var pts = [], n = 112;
    for(var i=0;i<n;i++){
      var a = i/n*Math.PI*2;
      var w = 1 + a1*Math.sin(a*2 + p1) + a2*Math.sin(a*3 + p2) + a3*Math.sin(a*5 + p3);
      pts.push(new THREE.Vector2(Math.cos(a)*rx*w, Math.sin(a)*rz*w));
    }
    var shape = new THREE.Shape(pts);
    var g = new THREE.Group();
    var water = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8),
      new THREE.MeshPhongMaterial({ color:0x080a0f, shininess:250, specular:0xffffff,
                                    envMap: envTarget ? envTarget.texture : null,
                                    reflectivity: 0.55, combine: THREE.AddOperation,
                                    transparent:true, opacity:0.62 }));
    water.rotation.x = -Math.PI/2; water.position.set(x, 0.004, z);
    water.receiveShadow = true;
    g.add(water);
    // what the strip throws back off the surface — tinted live in render3D
    if(!sheenTex) sheenTex = makeSheen();
    var sg = new THREE.ShapeGeometry(shape, 8);
    sg.computeBoundingBox();                      // map the gradient across the shape
    var bb = sg.boundingBox, sw = bb.max.x-bb.min.x, sh2 = bb.max.y-bb.min.y;
    var pa = sg.attributes.position, uvA = new Float32Array(pa.count*2);
    for(var vi=0; vi<pa.count; vi++){
      uvA[vi*2]   = (pa.getX(vi)-bb.min.x)/sw;
      uvA[vi*2+1] = (pa.getY(vi)-bb.min.y)/sh2;
    }
    sg.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
    var sheen = new THREE.Mesh(sg,
      new THREE.MeshBasicMaterial({ map:sheenTex, color:0x223, transparent:true, opacity:0.14,
                                    blending:THREE.AdditiveBlending, depthWrite:false }));
    sheen.rotation.x = -Math.PI/2; sheen.position.set(x, 0.006, z);
    sheen.name = 'sheen';
    g.add(sheen);
    return g;
  }

  // A moon disc: bright limb, faint maria, and a halo that fades into the sky.
  // A tuft of blades on transparent ground, for crossed billboards.
  // A soft pool of shade, densest just off centre and gone by the rim.
  function makeContact(){
    var N = 128, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(N/2, N/2, 0, N/2, N/2, N/2);
    g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.28, 'rgba(255,255,255,0.72)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.26)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, N, N);
    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  // Five metres of shaft and no gutter anywhere: everything that lands on that
  // roof leaves by these four walls. Drawn as an overlay with its own alpha
  // rather than baked into the ceiling texture, because the streaks have to run
  // vertically and the extruded slab's faces are not unwrapped that way.
  function makeRainStain(seed){
    var W = 768, H = 448, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var sd = seed, rnd = function(){ sd = (sd*9301 + 49297) % 233280; return sd/233280; };

    // the lip itself, where the water stands a moment before it goes over
    var lip = c.createLinearGradient(0, 0, 0, H*0.12);
    lip.addColorStop(0, 'rgba(12,14,11,0.60)');
    lip.addColorStop(1, 'rgba(12,14,11,0)');
    c.fillStyle = lip; c.fillRect(0, 0, W, H*0.12);

    // every streak starts at the top, because that is the only place water
    // arrives. Widths are rnd()*rnd() so most are thin and a few are broad.
    for(var i=0;i<120;i++){
      var x = rnd()*W, w = 2 + rnd()*rnd()*26;
      var len = H*(0.16 + rnd()*0.9);
      // Efflorescence is rare and faint. It was the first thing to get away from
      // me here: a wall of pale streaks fading downward from a bright edge does
      // not read as dirt, it reads as light coming through the gap.
      var pale  = rnd() < 0.022;                 // lime leaching back out of the concrete
      var algae = !pale && rnd() < 0.44;
      var col = pale ? '206,204,192' : (algae ? '28,37,22' : '26,23,19');
      var a = pale ? 0.04 + rnd()*0.05 : 0.14 + rnd()*0.30;
      var g = c.createLinearGradient(0, 0, 0, len);
      // Weakest right at the lip and strongest just below it — water needs a
      // run before it starts carrying anything.
      g.addColorStop(0,    'rgba(' + col + ',' + (a*0.25).toFixed(3) + ')');
      g.addColorStop(0.14, 'rgba(' + col + ',' + a.toFixed(3) + ')');
      g.addColorStop(0.60, 'rgba(' + col + ',' + (a*0.66).toFixed(3) + ')');
      g.addColorStop(1,    'rgba(' + col + ',0)');
      c.fillStyle = g;
      c.beginPath();                              // a streak wanders on the way down
      c.moveTo(x, 0); c.lineTo(x + w, 0);
      c.lineTo(x + w + (rnd()-0.5)*20, len);
      c.lineTo(x + (rnd()-0.5)*20, len);
      c.closePath(); c.fill();
    }

    for(var b=0;b<74;b++){                        // patchy damp, low down
      var bx = rnd()*W, by = H*(0.22 + rnd()*0.82), br = 12 + rnd()*74;
      var rg = c.createRadialGradient(bx, by, 0, bx, by, br);
      var da = 0.05 + rnd()*0.10;
      rg.addColorStop(0, 'rgba(26,28,22,' + da.toFixed(3) + ')');
      rg.addColorStop(1, 'rgba(26,28,22,0)');
      c.fillStyle = rg;
      c.beginPath(); c.arc(bx, by, br, 0, 6.283); c.fill();
    }

    // and the last half metre never dries, because that is where it drips off
    var wet = c.createLinearGradient(0, H*0.80, 0, H);
    wet.addColorStop(0, 'rgba(14,16,13,0)');
    wet.addColorStop(1, 'rgba(14,16,13,0.48)');
    c.fillStyle = wet; c.fillRect(0, H*0.80, W, H*0.20);

    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  // What the drip line does to the ceiling UNDERSIDE: water comes off the lower
  // lip, gets blown back under the slab and stains a band all the way round the
  // opening. Per-pixel because it is a square ring with a soft outer edge, which
  // no amount of gradient stacking draws cleanly. Transparent in the middle —
  // that part of the plane is the hole.
  function makeRimStain(){
    var N = 512, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var c = cv.getContext('2d');
    var img = c.createImageData(N, N), d = img.data;
    var half = N/2, inner = N * (9/15) / 2;       // the 9 m opening on a 15 m plane
    var sd = 4477, rnd = function(){ sd = (sd*9301 + 49297) % 233280; return sd/233280; };
    var K = 96, wgt = [];                         // some stretches of edge drip harder
    for(var i=0;i<K;i++) wgt.push(rnd());
    for(var y=0;y<N;y++){
      for(var x=0;x<N;x++){
        var dx = Math.abs(x-half), dy = Math.abs(y-half), m = Math.max(dx, dy);
        var o = (m - inner) / (half - inner);     // 0 at the lip, 1 at the far edge
        var a = 0;
        if(o > 0 && o < 1){
          var along = (dx > dy ? y : x) / N;
          var k = wgt[Math.floor(along*K) % K];
          a = 0.60 * Math.pow(1 - o, 1.9) * (0.42 + k*0.80);
        }
        var q = (y*N + x)*4;
        d[q] = 28; d[q+1] = 31; d[q+2] = 24;
        d[q+3] = Math.max(0, Math.min(255, a*255)) | 0;
      }
    }
    c.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  // The mat the blades stand in: mottled green fading to nothing at the rim,
  // so a patch sits on the concrete instead of being stuck to it.
  function makeGrassMat(){
    var N = 256, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var c = cv.getContext('2d'), C = N/2;
    var sd = 811, rnd = function(){ sd = (sd*9301 + 49297) % 233280; return sd/233280; };
    for(var i=0;i<170;i++){
      var a = rnd()*Math.PI*2, r = C*0.94*Math.pow(rnd(), 0.6);
      var x = C + Math.cos(a)*r, y = C + Math.sin(a)*r, br = N*(0.03 + rnd()*0.10);
      var v = 120 + rnd()*80;
      var g = c.createRadialGradient(x, y, 0, x, y, br);
      g.addColorStop(0, 'rgba(' + ((v*0.62)|0) + ',' + ((v*0.76)|0) + ',' + ((v*0.52)|0) + ',0.7)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, br, 0, Math.PI*2); c.fill();
    }
    // feather the rim so there is no visible disc edge
    c.globalCompositeOperation = 'destination-in';
    var f = c.createRadialGradient(C, C, C*0.30, C, C, C*0.99);
    f.addColorStop(0, 'rgba(0,0,0,1)');
    f.addColorStop(0.7, 'rgba(0,0,0,0.75)');
    f.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = f; c.fillRect(0, 0, N, N);
    c.globalCompositeOperation = 'source-over';
    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function makeMoon(){
    var N = 256, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var c = cv.getContext('2d'), C = N/2;

    var halo = c.createRadialGradient(C, C, N*0.16, C, C, C);
    halo.addColorStop(0,    'rgba(206,220,244,0.55)');
    halo.addColorStop(0.34, 'rgba(150,172,210,0.16)');
    halo.addColorStop(1,    'rgba(120,145,190,0)');
    c.fillStyle = halo; c.fillRect(0,0,N,N);

    var R = N*0.165;
    var disc = c.createRadialGradient(C - R*0.28, C - R*0.3, R*0.1, C, C, R);
    disc.addColorStop(0,   '#fdfbf3');
    disc.addColorStop(0.7, '#e8e6da');
    disc.addColorStop(1,   '#c9cbc3');
    c.beginPath(); c.arc(C, C, R, 0, Math.PI*2);
    c.fillStyle = disc; c.fill();

    // maria — soft grey patches, clipped to the disc
    c.save(); c.clip();
    var sd = 7717, rnd = function(){ sd = (sd*9301 + 49297) % 233280; return sd/233280; };
    for(var i=0;i<9;i++){
      var mx = C + (rnd()-0.5)*R*1.5, my = C + (rnd()-0.5)*R*1.5, mr = R*(0.13 + rnd()*0.26);
      var g = c.createRadialGradient(mx, my, 0, mx, my, mr);
      g.addColorStop(0, 'rgba(150,152,148,' + (0.22 + rnd()*0.2).toFixed(2) + ')');
      g.addColorStop(1, 'rgba(150,152,148,0)');
      c.fillStyle = g; c.beginPath(); c.arc(mx, my, mr, 0, Math.PI*2); c.fill();
    }
    c.restore();

    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  // Equirectangular night sky: gradient and milky way only.
  function makeSky(){
    var maxT = 2048;
    try{
      var gl0 = ren && ren.getContext && ren.getContext();
      if(gl0) maxT = Math.min(2048, gl0.getParameter(gl0.MAX_TEXTURE_SIZE) || 2048);
    }catch(e){}
    // Only the gradient and the milky way live here -- both low frequency, so
    // 1024 is plenty. The stars are geometry, below, because a star baked into
    // a texture is a smeared blob the moment you look at it up close.
    var W = Math.min(maxT, LITE ? 512 : 1024), H = W/2;       // 2:1, power of two
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var sd = 4211, rnd = function(){ sd = (sd*9301 + 49297) % 233280; return sd/233280; };

    // zenith at the top of the image, a touch of city glow toward the horizon
    var g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0,    '#0a0f20');
    g.addColorStop(0.5,  '#0e152a');
    g.addColorStop(1,    '#0a0f20');
    c.fillStyle = g; c.fillRect(0, 0, W, H);

    // milky way: a broad band across the sphere, built from overlapping puffs
    c.save();
    c.translate(W*0.5, H*0.42);
    c.rotate(-0.42);
    for(var i=0;i<260;i++){
      var mx = (rnd()-0.5)*W*1.5;
      var my = (rnd()-0.5)*H*0.34 * (1 - Math.abs(mx)/(W*0.9));
      var mr = H*(0.035 + rnd()*0.10);
      var mg = c.createRadialGradient(mx, my, 0, mx, my, mr);
      var a1 = 0.030 + rnd()*0.075;
      mg.addColorStop(0, 'rgba(176,192,228,' + a1.toFixed(3) + ')');
      mg.addColorStop(1, 'rgba(150,168,210,0)');
      c.fillStyle = mg;
      c.beginPath(); c.arc(mx, my, mr, 0, Math.PI*2); c.fill();
    }
    // dust lanes cutting through it
    for(var d=0;d<70;d++){
      var dx = (rnd()-0.5)*W*1.3, dy = (rnd()-0.5)*H*0.22, dr = H*(0.02 + rnd()*0.06);
      var dg = c.createRadialGradient(dx, dy, 0, dx, dy, dr);
      dg.addColorStop(0, 'rgba(6,9,18,' + (0.10 + rnd()*0.16).toFixed(3) + ')');
      dg.addColorStop(1, 'rgba(6,9,18,0)');
      c.fillStyle = dg; c.beginPath(); c.arc(dx, dy, dr, 0, Math.PI*2); c.fill();
    }
    c.restore();

    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.wrapS = THREE.RepeatWrapping;
    if(ren) t.anisotropy = ren.capabilities.getMaxAnisotropy();
    return t;
  }

  // A soft round dot, used as the sprite for every star.
  function makeStarDot(){
    var N = 64, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var c = cv.getContext('2d'), C = N/2;
    var g = c.createRadialGradient(C, C, 0, C, C, C);
    g.addColorStop(0,    'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.42, 'rgba(255,255,255,0.24)');
    g.addColorStop(1,    'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, N, N);
    var t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  // Stars as real points on a sphere, not pixels in an image. sizeAttenuation
  // is off, so each one is a fixed number of screen pixels however close the
  // camera gets — a pinprick at any zoom, on any display density.
  function makeStars(radius){
    var dot = makeStarDot();
    var g = new THREE.Group();
    var sd = 90210, rnd = function(){ sd = (sd*9301 + 49297) % 233280; return sd/233280; };
    // three passes: the sky is mostly faint stars with a few that carry
    var bands = LITE ? [[2800, 1.5, 0.55], [700, 2.4, 0.85], [80, 4.4, 1.0]]
                     : [[6200, 1.7, 0.62], [1550, 2.8, 0.90], [190, 5.4, 1.0]];
    bands.forEach(function(band){
      var n = band[0], pos = new Float32Array(n*3), col = new Float32Array(n*3);
      for(var i=0;i<n;i++){
        // uniform on the sphere: acos keeps them from bunching at the poles
        var th = Math.acos(1 - 2*rnd()), ph = rnd()*Math.PI*2;
        pos[i*3]   = radius * Math.sin(th) * Math.cos(ph);
        pos[i*3+1] = radius * Math.cos(th);
        pos[i*3+2] = radius * Math.sin(th) * Math.sin(ph);
        var warm = rnd(), v = 0.6 + rnd()*0.4;
        var c3 = warm > 0.86 ? [1.00, 0.89, 0.77]
               : warm > 0.64 ? [1.00, 0.96, 0.91]
                             : [0.84, 0.90, 1.00];
        col[i*3] = c3[0]*v; col[i*3+1] = c3[1]*v; col[i*3+2] = c3[2]*v;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({
        map: dot, size: band[1], sizeAttenuation: false, vertexColors: true,
        transparent: true, opacity: band[2], depthWrite: false,
        blending: THREE.AdditiveBlending
      })));
    });
    return g;
  }

  function makeConcrete(){
    var N = 1024, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    var c = cv.getContext('2d');
    c.fillStyle = '#8d8a83'; c.fillRect(0,0,N,N);

    function blot(x, y, r, v, a){
      for(var ox=-1; ox<=1; ox++){
        for(var oy=-1; oy<=1; oy++){
          var g = c.createRadialGradient(x+ox*N, y+oy*N, 0, x+ox*N, y+oy*N, r);
          g.addColorStop(0, 'rgba(' + v + ',' + v + ',' + ((v*0.985)|0) + ',' + a + ')');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g;
          c.beginPath(); c.arc(x+ox*N, y+oy*N, r, 0, Math.PI*2); c.fill();
        }
      }
    }
    var i;
    for(i=0;i<26;i++) blot(Math.random()*N, Math.random()*N, 150+Math.random()*260,
                           (126 + (Math.random()-0.5)*40)|0, 0.20);   // broad pours
    for(i=0;i<90;i++) blot(Math.random()*N, Math.random()*N, 20+Math.random()*90,
                           (130 + (Math.random()-0.5)*54)|0, 0.16);   // patchiness
    for(i=0;i<420;i++) blot(Math.random()*N, Math.random()*N, 2+Math.random()*7,
                            (110 + Math.random()*80)|0, 0.30);        // aggregate

    var img = c.getImageData(0,0,N,N), d = img.data;
    for(i=0;i<d.length;i+=4){
      var n = (Math.random()-0.5)*20;
      d[i]+=n; d[i+1]+=n; d[i+2]+=n*0.96;
    }
    c.putImageData(img,0,0);

    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = ren ? ren.capabilities.getMaxAnisotropy() : 1;
    return t;
  }

  // The body, modelled in SketchUp and exported as OBJ: 554 triangles, arms
  // spread exactly 1.50 m fingertip to fingertip so the hands meet the runs,
  // feet on y = 0. Positions only, as Int16 metres x4096 — the normals are
  // computed per face at load, which keeps the facets. A body this size in a
  // dark hall reads better cut than smoothed, and it matches the frame.
  var FIGURE = LIFE_DATA.figure;
  function buildFigure(){
    var g = new THREE.Group();
    var pi = b64ints(FIGURE.p);
    var pos = new Float32Array(pi.length);
    for(var i=0;i<pi.length;i++) pos[i] = pi[i] / 4096;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();            // non-indexed, so this is per-face
    var m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      color:0x40424a, shininess:14, specular:0x1a1c22, flatShading:true,
      side: THREE.DoubleSide
    }));
    m.castShadow = true; m.receiveShadow = true;
    m.userData.shared = true;              // cached across rebuilds, never disposed
    g.add(m);
    return g;
  }

  function b64ints(b64){
    var bin = atob(b64), n = bin.length, bytes = new Uint8Array(n);
    for(var i=0;i<n;i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }
  function decodePart(rec){
    var pi = b64ints(rec.p), ui = b64ints(rec.u);
    var pos = new Float32Array(pi.length), uv = new Float32Array(ui.length);
    for(var j=0;j<pi.length;j++) pos[j] = pi[j] / PART_SCALE;
    for(var k=0;k<ui.length;k++) uv[k] = ui[k] / PART_UVS;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals();          // non-indexed, so the machined edges stay hard
    return g;
  }

  // dark stained ply, the way the built frame looks: grain along the length,
  // a few darker streaks, and enough noise that it is not a flat colour
  function makeWood(){
    var W = 512, H = 512, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    c.fillStyle = '#3b3a38'; c.fillRect(0,0,W,H);
    var i, y;
    for(i=0;i<300;i++){
      y = Math.random()*H;
      var v = 46 + Math.random()*34;
      c.strokeStyle = 'rgba(' + (v|0) + ',' + ((v*0.95)|0) + ',' + ((v*0.9)|0) + ',' + (0.10+Math.random()*0.30) + ')';
      c.lineWidth = 0.6 + Math.random()*2.6;
      c.beginPath();
      c.moveTo(0, y);
      for(var x=0; x<=W; x+=32) c.lineTo(x, y + Math.sin((x/W)*6.283*(1+Math.random()) )*3.5);
      c.stroke();
    }
    for(i=0;i<16;i++){                       // darker figure
      y = Math.random()*H;
      c.strokeStyle = 'rgba(24,23,22,' + (0.10+Math.random()*0.16) + ')';
      c.lineWidth = 3 + Math.random()*9;
      c.beginPath(); c.moveTo(0,y);
      for(var x2=0; x2<=W; x2+=48) c.lineTo(x2, y + Math.sin(x2*0.02)*5);
      c.stroke();
    }
    var img = c.getImageData(0,0,W,H), d = img.data;
    for(i=0;i<d.length;i+=4){
      var n = (Math.random()-0.5)*16;
      d[i]+=n; d[i+1]+=n*0.95; d[i+2]+=n*0.9;
    }
    c.putImageData(img,0,0);
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if(ren) t.anisotropy = ren.capabilities.getMaxAnisotropy();
    return t;
  }

  var partGeo = null, woodTex = null, partMats = null;
  function framePart(){
    if(!partGeo){
      partGeo = {};
      for(var k in PARTS) partGeo[k] = decodePart(PARTS[k]);
      woodTex = makeWood();
    }
    // Built once and shared. These used to be four new materials per call and
    // four calls per rebuild, none of them ever disposed — every Frame/Pillars
    // switch left sixteen live materials and their compiled GL programs behind,
    // which is how a phone ends up out of memory after a few dozen taps.
    if(!partMats){
      partMats = {
        wood:  new THREE.MeshPhongMaterial({ color:0x9c968c, map:woodTex, bumpMap:woodTex,
                                             bumpScale:0.012, shininess:9, specular:0x1b1a18 }),
        metal: new THREE.MeshPhongMaterial({ color:0xb9bec6, shininess:118, specular:0xe0e4ea,
                                             envMap: envTarget ? envTarget.texture : null,
                                             reflectivity:0.42, combine: THREE.MixOperation }),
        rail:  new THREE.MeshPhongMaterial({ color:0x9298a1, shininess:96, specular:0xb6bcc4 }),
        // frosted acrylic, not a dark plate: the run has to read through it
        lens:  new THREE.MeshPhongMaterial({ color:0xc9d2dc, emissive:0x1c2027, shininess:64,
                                             specular:0x7d858f, transparent:true, opacity:0.22,
                                             depthWrite:false })
      };
    }
    var g = new THREE.Group();
    var mats = partMats;
    for(var kk in partGeo){
      var m = new THREE.Mesh(partGeo[kk], mats[kk] || mats.metal);
      m.castShadow = true; m.receiveShadow = true;
      m.userData.shared = true;        // cached geometry and material: never dispose
      g.add(m);
    }
    return g;
  }

  // One module stood upright. Composed as nested groups so the rotations stay
  // readable: (x,y,z) -> (z, -x, -y). Length runs up Y, the channel faces +Z.
  var PILLAR_LEN = 2.0532, PILLAR_Z = 0.90, PILLAR_FACE = 0.15, PILLAR_HALF = 0.15;
  function pillarPart(){
    var upright = new THREE.Group();
    upright.rotation.z = -Math.PI/2;
    upright.add(framePart());
    var facing = new THREE.Group();
    facing.rotation.y = Math.PI/2;
    facing.add(upright);
    var g = new THREE.Group();
    g.add(facing);
    facing.position.set(0, 0, PILLAR_Z);      // body back on the axis
    return g;
  }



  var footMat = null;
  function releaseTemp(root){
    root.traverse(function(o){
      if(!o.isMesh && !o.isPoints) return;
      if(o.userData && o.userData.shared) return;
      if(o.geometry) o.geometry.dispose();
      if(o.material && o.material.dispose) o.material.dispose();
    });
  }

  function rebuildGeometry(){
    if(!three.ready && !scn) return;
    var side = state.sideCm/100;                 // metres
    var isP = state.layout === 'pillars';

    // Hand back what this rebuild allocated last time -- geometry AND materials.
    // The old teardown disposed geometry only, and it disposed the *shared*
    // module geometry along with it, so every switch both leaked materials and
    // threw away buffers it still needed.
    [frameMesh, ledMesh, ledGhost].forEach(function(m){
      if(!m) return;
      scn.remove(m);
      releaseTemp(m);
    });
    while(pillarGroup.children.length){
      var oldChild = pillarGroup.children[0];
      pillarGroup.remove(oldChild);
      releaseTemp(oldChild);
    }
    ledGhost = null;

    if(!footMat) footMat = new THREE.MeshLambertMaterial({ color:0x2b2d33 });
    var body = footMat;

    // The real module: aperture 150, band 30, depth 30 — four of them, rotated.
    var MODEL_SIDE = 1.50, sc = side / MODEL_SIDE;
    var band = 0.30*sc, depth = 0.30*sc;
    frameBand = band;
    frameBevel = 0.012;
    frameBase = (side/2 + band);                 // outer edge on the slab
    if(!isP){
      frameMesh = new THREE.Group();
      for(var q=0; q<4; q++){
        var piece = framePart();
        piece.rotation.z = q * Math.PI/2;
        frameMesh.add(piece);
      }
      frameMesh.scale.set(sc, sc, sc);
      frameMesh.position.set(0, frameBase, 0);
      scn.add(frameMesh);
      pillarGroup.visible = false;
    } else {
      frameMesh = null;
      pillarGroup.visible = true;
      // The same module, stood on end. Two rotations: Z takes the long axis
      // vertical, Y swings the LED channel round to face the room.
      var gap = side*0.62;
      for(var r=0;r<4;r++){
        var pil = pillarPart();
        pil.scale.set(sc, sc, sc);
        pil.position.set((r-1.5)*gap, PILLAR_LEN*sc/2, 0);
        pillarGroup.add(pil);
        var foot = new THREE.Mesh(new THREE.BoxGeometry(0.44*sc, 0.03, 0.44*sc), body);
        foot.castShadow = true; foot.receiveShadow = true;
        foot.position.set((r-1.5)*gap, 0.015, 0);
        pillarGroup.add(foot);
      }
    }

    // one emissive box per addressable pixel
    var seg = new THREE.BoxGeometry(1,1,1);
    var mat = new THREE.MeshBasicMaterial({ vertexColors:false });
    ledMesh = new THREE.InstancedMesh(seg, mat, LEDS);
    ledMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LEDS*3), 3);
    ledMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    placeLeds(side, isP);
    scn.add(ledMesh);

    // a mirrored, dimmed copy under the slab — cheap reflection, no extra pass
    ledGhost = new THREE.InstancedMesh(seg,
      new THREE.MeshBasicMaterial({ transparent:true, opacity:0.20, depthWrite:false,
                                    blending:THREE.AdditiveBlending }), LEDS);
    ledGhost.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LEDS*3), 3);
    ledGhost.instanceMatrix.copy(ledMesh.instanceMatrix);
    ledGhost.scale.y = -1;
    ledGhost.position.y = -0.005;
    scn.add(ledGhost);

    placeRunLights();
    humPlace(0, isP ? PILLAR_LEN*(side/1.50)/2 : frameBase, 0);
    if(ren) ren.shadowMap.needsUpdate = true;

    if(figure){
      figure.visible = !isP;
      var sc = side/1.50;                       // built 1.50 m across the hands
      figure.scale.set(sc, sc, sc);
      figure.position.set(0, frameBase - side/2, -0.02);   // standing inside the opening
    }
  }

  function placeLeds(side, isP){
    var per = Math.max(1, Math.round(LEDS/4)), half = side/2;
    var gapC = 0.016, run = side - gapC*2, step = run/per;
    var sc = side/1.50;
    // The run sits INSIDE the acrylic, not on top of it. The module's cover plate
    // runs from 0.7500 (the face you see) to 0.7629, so bedding the 9 mm strip at
    // 0.7565 puts it wholly within the diffuser: the light leaves through frosted
    // plastic instead of a bar standing proud of the profile. Any deeper and the
    // aluminium body swallows it.
    var flat = side*0.006;                      // 9 mm through the face
    var wide = side*0.045;                      // the channel it sits in
    var base = isP ? PILLAR_LEN*sc/2 : frameBase;
    var BEDDED = 0.0065 * sc;                   // mid-thickness of the cover plate
    var rad = side/2 + BEDDED;                  // into the acrylic, off the aperture
    var zf = 0;                                 // mid-depth of the profile
    var zp = PILLAR_FACE*sc - BEDDED;           // into the acrylic, back from the face
    var i = 0;
    for(var r=0;r<4;r++){
      for(var j=0;j<per;j++){
        var d = -half + gapC + step*(j + 0.5);
        if(isP){
          var pgap = side*0.62;
          dummy.position.set((r-1.5)*pgap, base + d, zp);
          dummy.scale.set(wide, step, flat);
        } else {
          if(r===0){ dummy.position.set(d, base + rad, zf); dummy.scale.set(step, flat, wide); }
          else if(r===1){ dummy.position.set(rad, base - d, zf); dummy.scale.set(flat, step, wide); }
          else if(r===2){ dummy.position.set(-d, base - rad, zf); dummy.scale.set(step, flat, wide); }
          else { dummy.position.set(-rad, base + d, zf); dummy.scale.set(flat, step, wide); }
        }
        dummy.updateMatrix();
        ledMesh.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    ledMesh.instanceMatrix.needsUpdate = true;
  }

  function placeRunLights(){
    var side = state.sideCm/100, sc = side/1.50;
    var isP = state.layout === 'pillars';
    var base = isP ? PILLAR_LEN*sc/2 : frameBase, half = side/2 - frameBevel;
    var pgap = side*0.62;
    for(var r=0;r<runLights.length;r++){
      var L = runLights[r];
      if(isP){
        // just off the face, firing forward and fanning outward — nothing aimed back
        L.position.set((r-1.5)*pgap, base, PILLAR_FACE*sc + 0.05);
        L.target.position.set((r-1.5)*pgap*1.9, base*0.35, 3.4);
      } else {
        // each run fires across the aperture and out the far side, as the strip does
        if(r===0){ L.position.set(0, base + half, 0); L.target.position.set(0, -1.2, 2.2); }
        else if(r===1){ L.position.set(half, base, 0); L.target.position.set(-2.6, base*0.4, 2.2); }
        else if(r===2){ L.position.set(0, base - half, 0); L.target.position.set(0, base*2.4, 2.2); }
        else { L.position.set(-half, base, 0); L.target.position.set(2.6, base*0.4, 2.2); }
      }
      L.target.updateMatrixWorld();
    }
  }

  var perf = { t0:0, frames:0, level:2, checked:false };
  function autoQuality(){
    if(perf.checked || !three.ready) return;
    var now = performance.now();
    if(!perf.t0){ perf.t0 = now; perf.frames = 0; return; }
    perf.frames++;
    if(now - perf.t0 < 2200) return;
    var fps = perf.frames / ((now - perf.t0)/1000);
    // Shadows are the whole effect, so they go last, not first. Step one gives
    // up the reflection cube and some resolution and keeps them.
    if(fps < 34 && perf.level === 2){
      perf.level = 1;
      envCam = null;
      ren.setPixelRatio(0.85);
      resize3D();
      perf.t0 = 0; perf.frames = 0;
      return;
    }
    if(fps < 26 && perf.level === 1){
      perf.level = 0;
      if(apertureLight) apertureLight.castShadow = false;
      ren.shadowMap.enabled = false;
      ren.setPixelRatio(0.7);
      resize3D();
    }
    perf.checked = true;
  }

  // ---------- walking ----------
  // Push a circle of radius r out of an axis-aligned box, along whichever axis
  // it has penetrated least. Two of these make the frame's side rails solid
  // while leaving the opening walkable.
  function pushOut(p, cx, cz, hx, hz, r){
    var dx = p.x - cx, dz = p.z - cz;
    var ox = hx + r - Math.abs(dx), oz = hz + r - Math.abs(dz);
    if(ox <= 0 || oz <= 0) return;
    if(ox < oz) p.x = cx + (dx < 0 ? -1 : 1) * (hx + r);
    else        p.z = cz + (dz < 0 ? -1 : 1) * (hz + r);
  }

  function stepWalk(){
    var now = performance.now();
    var dt = walk.last ? Math.min(0.05, (now - walk.last)/1000) : 0.016;
    walk.last = now;

    var k = walk.keys;
    var fwd = (k.w || k.up ? 1 : 0) - (k.s || k.down ? 1 : 0) + walk.joyY;
    var str = (k.d || k.right ? 1 : 0) - (k.a || k.left ? 1 : 0) + walk.joyX;
    var mag = Math.hypot(fwd, str);
    if(mag > 1){ fwd /= mag; str /= mag; }

    var sp = (walk.run ? WALK_RUN : WALK_SPEED);
    // forward is -Z at yaw 0; right is +X at yaw 0
    var tx = (-Math.sin(walk.yaw)*fwd + Math.cos(walk.yaw)*str) * sp;
    var tz = (-Math.cos(walk.yaw)*fwd - Math.sin(walk.yaw)*str) * sp;
    // ease in and out so it never feels like a teleport
    var ease = 1 - Math.pow(0.0015, dt);
    walk.vx += (tx - walk.vx) * ease;
    walk.vz += (tz - walk.vz) * ease;

    var p = { x: walk.x + walk.vx*dt, z: walk.z + walk.vz*dt };

    if(state.layout === 'pillars'){
      // four modules stood in a row — each one solid
      var side = state.sideCm/100, pgap = side*0.62, hw = PILLAR_HALF*(side/1.50);
      for(var r=0;r<4;r++) pushOut(p, (r-1.5)*pgap, 0, hw, hw, BODY_R);
    } else {
      // the two upright rails; the gap between them is the opening you pose in
      var side = state.sideCm/100, off = side/2 + frameBand/2;
      pushOut(p,  off, 0, frameBand/2, 0.16, BODY_R);
      pushOut(p, -off, 0, frameBand/2, 0.16, BODY_R);
    }

    var lim = roomW/2 - 0.5;
    walk.x = Math.max(-lim, Math.min(lim, p.x));
    walk.z = Math.max(-lim, Math.min(lim, p.z));
    if(walk.x !== p.x) walk.vx = 0;
    if(walk.z !== p.z) walk.vz = 0;
  }

  function setNav(mode){
    var on = mode === 'walk';
    if(on && !walk.on){
      // step in wherever the orbit camera was standing, still facing the frame
      if(cam){
        walk.x = cam.position.x; walk.z = cam.position.z;
        walk.yaw = Math.atan2(walk.x, walk.z);       // look back at the origin
      } else {
        walk.x = 0; walk.z = 4.6; walk.yaw = 0;
      }
      walk.savedEl = orbit.el;                       // give it back on the way out
      var d0 = Math.hypot(walk.x, walk.z);
      if(d0 < 2.2){                                  // never start inside the frame
        var k0 = 2.2/(d0 || 1);
        walk.x *= k0; walk.z *= k0;
        if(!d0){ walk.z = 2.2; walk.yaw = 0; }
      }
      walk.pitch = -0.03;
      walk.vx = walk.vz = 0; walk.last = 0;
      walk.keys = {}; walk.joyX = walk.joyY = 0;
    }
    if(!on && walk.on && cam){
      // and hand it back the other way, so Look does not snap to a new angle
      var rh = Math.max(0.4, Math.hypot(walk.x, walk.z));
      orbit.az = Math.atan2(walk.x, walk.z);
      // heading and distance follow where you walked to; the viewing height is
      // the one you had before, so Look does not come back flattened
      orbit.el = (walk.savedEl === undefined) ? orbit.el : walk.savedEl;
      orbit.dist = Math.max(2.4, Math.min(9.2, rh / Math.max(0.2, Math.cos(orbit.el))));
    }
    walk.on = on;
    // a 38° lens is right for looking at an object and far too tight to walk behind
    if(cam){ cam.fov = on ? 64 : 38; cam.updateProjectionMatrix(); }
    joy.hidden = !on;
    glCanvas.style.cursor = on ? 'crosshair' : 'grab';
    document.querySelectorAll('[data-hud-nav]').forEach(function(b){
      b.classList.toggle('active', (b.dataset.hudNav === 'walk') === on);
    });
    walkHint.hidden = !on;
    if(on){
      clearTimeout(walkHint._t);
      walkHint._t = setTimeout(function(){ walkHint.hidden = true; }, 6000);
    }
  }


  // ---------- the frame's own noise ----------
  // Not a recording: the sandbox blocks external media, and this does not need
  // one. What a lit LED frame actually makes is the supply's ripple and a coil
  // whine that tracks load. 50 Hz mains rectifies to a 100 Hz ripple, so that is
  // the fundamental, with a little of its harmonics; the whine climbs as the
  // strip draws more. Positioned at the frame, so walking up to it works.
  var hum = { ctx:null, on:false, nodes:null, want:false };
  try{ hum.want = localStorage.getItem('life-hum') === '1'; }catch(e){}

  function humBuild(){
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return false;
    var ctx = new AC();
    var n = {};

    n.master = ctx.createGain();
    n.master.gain.value = 0;

    n.panner = ctx.createPanner();
    n.panner.panningModel  = 'HRTF';
    n.panner.distanceModel = 'inverse';
    n.panner.refDistance   = 1.7;
    n.panner.rolloffFactor = 1.0;
    n.panner.maxDistance   = 40;
    // A hall this size does not give back anything bright. Everything above a
    // kilohertz is soaked up by concrete long before it reaches you, so the
    // whole voice goes through one lowpass and what is left is the bottom end.
    n.lp = ctx.createBiquadFilter();
    n.lp.type = 'lowpass'; n.lp.frequency.value = 900; n.lp.Q.value = 0.4;
    n.panner.connect(n.lp);
    n.lp.connect(n.master);
    n.master.connect(ctx.destination);

    function tone(freq, gain, type){
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g); g.connect(n.panner); o.start();
      return { osc:o, gain:g };
    }
    n.r0 = tone(50, 0.0);               // mains itself, felt more than heard
    n.r1 = tone(100, 0.055);            // the ripple, the fundamental of the thing
    n.r2 = tone(200, 0.020);            // and the shape of a rectified sine
    n.r3 = tone(300, 0.009);
    n.whine = tone(520, 0.0);           // the switching note, low and round

    // a breath of driver hiss, band-limited so it sits under the whine
    var len = Math.floor(ctx.sampleRate * 2), buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for(var i=0;i<len;i++) d[i] = (Math.random()*2 - 1) * 0.5;
    var src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
    n.hiss = ctx.createGain(); n.hiss.gain.value = 0;
    src.connect(bp); bp.connect(n.hiss); n.hiss.connect(n.panner);
    src.start();
    n.hissSrc = src;

    hum.ctx = ctx; hum.nodes = n;
    return true;
  }

  function humSet(x, v, t){                 // ramp, never step — steps click
    if(x.setTargetAtTime) x.setTargetAtTime(v, hum.ctx.currentTime, t || 0.12);
    else x.value = v;
  }

  function humStart(){
    if(!hum.nodes && !humBuild()) return false;
    if(hum.ctx.state === 'suspended' && hum.ctx.resume) hum.ctx.resume();
    hum.on = true;
    humSet(hum.nodes.master.gain, 0.9, 0.5);
    return true;
  }
  function humStop(){
    if(!hum.nodes) return;
    hum.on = false;
    humSet(hum.nodes.master.gain, 0, 0.25);
    if(hum.ctx.suspend) setTimeout(function(){ if(!hum.on) hum.ctx.suspend(); }, 700);
  }

  var humPos = { x:0, y:0, z:0 };
  function humPlace(x, y, z){ humPos.x = x; humPos.y = y; humPos.z = z; }

  function humUpdate(){
    if(!hum.on || !hum.nodes || !hum.ctx) return;
    var n = hum.nodes, t = hum.ctx.currentTime;

    // load: what the strip is actually asking of the supply
    var load = state.power ? (0.10 + 0.90 * (state.brightness/100)) : 0.0;
    if(state.mode === 'react' && state.power) load *= (0.5 + reactLevel);
    load = Math.max(0, Math.min(1.3, load));

    // with the output off the supply is still on, so it still sings — quieter
    var idle = (state.power ? 1 : 0.30) * 1.9;   // 1.9: audible on a laptop

    humSet(n.r0.gain.gain, (0.026 + 0.030*load) * idle, 0.20);
    humSet(n.r1.gain.gain, (0.034 + 0.050*load) * idle, 0.20);
    humSet(n.r2.gain.gain, (0.009 + 0.017*load) * idle, 0.20);
    humSet(n.r3.gain.gain, (0.003 + 0.007*load) * idle, 0.20);
    humSet(n.whine.gain.gain, (0.0022 + 0.0090*load) * idle, 0.18);
    humSet(n.hiss.gain, (0.0014 + 0.0050*load) * idle, 0.25);
    // switching note climbs with load, and jitters when the effect is busy
    var busy = (state.motion === 'sparkle' || state.motion === 'flash') ? 1 : 0;
    var f = 300 + load*430 + busy*Math.sin(t*11.0)*26;
    humSet(n.whine.osc.frequency, f, 0.10);

    // where it is, and where the listener is
    var p = n.panner;
    if(p.positionX){
      p.positionX.setValueAtTime(humPos.x, t);
      p.positionY.setValueAtTime(humPos.y, t);
      p.positionZ.setValueAtTime(humPos.z, t);
    } else if(p.setPosition) p.setPosition(humPos.x, humPos.y, humPos.z);

    if(cam){
      var L = hum.ctx.listener;
      var fwd = new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
      var up  = new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion);
      if(L.positionX){
        L.positionX.setValueAtTime(cam.position.x, t);
        L.positionY.setValueAtTime(cam.position.y, t);
        L.positionZ.setValueAtTime(cam.position.z, t);
        L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t);
        L.forwardZ.setValueAtTime(fwd.z, t);
        L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
      } else {
        if(L.setPosition) L.setPosition(cam.position.x, cam.position.y, cam.position.z);
        if(L.setOrientation) L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
      }
    }
  }

  function render3D(){
    if(!three.ready || three.failed) return;
    try{ render3Dinner(); }
    catch(err){ glFail(err && err.message ? err.message : String(err)); }
  }
  function render3Dinner(){
    autoQuality();
    humUpdate();
    var c = ledMesh.instanceColor.array;
    for(var i=0;i<LEDS;i++){
      c[i*3]   = Math.min(1, pxR[i]/190);        // over 1.0 reads as blown out
      c[i*3+1] = Math.min(1, pxG[i]/190);
      c[i*3+2] = Math.min(1, pxB[i]/190);
    }
    ledMesh.instanceColor.needsUpdate = true;
    if(ledGhost){ ledGhost.instanceColor.array.set(c); ledGhost.instanceColor.needsUpdate = true; }

    // each run drives its own light
    var per = Math.max(1, Math.round(LEDS/4));
    for(var r=0;r<4;r++){
      var sr=0, sg=0, sb=0;
      for(var k=r*per; k<(r+1)*per && k<LEDS; k++){ sr+=pxR[k]; sg+=pxG[k]; sb+=pxB[k]; }
      var n = per*255, L = runLights[r];
      if(!L) continue;                       // safe mode runs a single light
      L.color.setRGB(Math.min(1, sr/n*2.6), Math.min(1, sg/n*2.6), Math.min(1, sb/n*2.6));
      L.intensity = state.power ? 0.15 + ((sr+sg+sb)/(n*3))*2.2 : 0.02;
    }

    // the aperture light carries the whole frame's colour and does the shadow work
    var side3 = state.sideCm/100, isP3 = state.layout === 'pillars';
    // In the frame it sits in the aperture and throws both ways, because the
    // frame is a lit window. Pillars are not: the strip is on one face only, so
    // the light source sits well in front of them and the pillars themselves
    // shadow everything behind. Tighter falloff too — no washing the far wall.
    apertureLight.position.set(0, isP3 ? PILLAR_LEN*(side3/1.50)*0.55 : frameBase, isP3 ? 0.95 : 0);
    // three.js legacy attenuation is (1 - d/distance)^decay, not inverse-square,
    // so a generous `distance` means almost no falloff at all -- which is how a
    // lamp meant to pool at the frame ended up lighting a 20 m hall evenly.
    if(apLayout !== isP3){                 // constants; they were set 60 times a second
      apLayout = isP3;
      apertureLight.distance = isP3 ? 20 : 26;
      apertureLight.decay = isP3 ? 1.9 : 1.7;
    }
    apertureLight.color.setRGB(Math.min(1, avgR/255*2.4), Math.min(1, avgG/255*2.4), Math.min(1, avgB/255*2.4));
    var lvl = (avgR+avgG+avgB)/765;
    apertureLight.intensity = state.power ? (isP3 ? 0.3 + lvl*4.4 : 0.6 + lvl*8.5) : 0.05;

    // bounce: the room lit by its own reflected colour
    if(bounce){
      // night sky underneath, the strip's own bounce layered on top of it
      bounce.color.setRGB(Math.min(0.92, 0.20 + avgR/255*1.1),
                          Math.min(0.92, 0.30 + avgG/255*1.1),
                          Math.min(0.95, 0.48 + avgB/255*1.1));
      bounce.intensity = state.power ? 0.42 + lvl*(isP3 ? 0.24 : 0.50) : 0.42;
    }

    // the strip thrown back off the wet patches
    // the same five meshes every frame, so find them once
    if(room && !sheens && room.userData.puddles){
      sheens = [];
      room.userData.puddles.traverse(function(o){ if(o.name === 'sheen') sheens.push(o); });
    }
    if(sheens){
      var pk = state.power ? 0.03 + lvl*0.17 : 0.01;
      var sr = Math.min(1, avgR/255*1.6), sg2 = Math.min(1, avgG/255*1.6), sb = Math.min(1, avgB/255*1.6);
      for(var si=0; si<sheens.length; si++){
        sheens[si].material.color.setRGB(sr, sg2, sb);
        sheens[si].material.opacity = pk;
      }
    }

    var wantFov = walk.on ? 64 : 38;
    if(cam.fov !== wantFov){ cam.fov = wantFov; cam.updateProjectionMatrix(); }
    if(walk.on){
      stepWalk();
      var cp = Math.cos(walk.pitch);
      cam.position.set(walk.x, walk.eye, walk.z);
      cam.lookAt(walk.x - Math.sin(walk.yaw)*cp,
                 walk.eye + Math.sin(walk.pitch),
                 walk.z - Math.cos(walk.yaw)*cp);
    } else {
      var r = orbit.dist, e = orbit.el, a = orbit.az;
      // stay inside the hall on every axis — never pass through a surface
      var lim = roomW/2 - 0.8;
      var camY = Math.min(roomH - 0.8, Math.max(0.55, 1.25 + r*Math.sin(e)));
      var camX = Math.max(-lim, Math.min(lim, r*Math.cos(e)*Math.sin(a)));
      var camZ = Math.max(-lim, Math.min(lim, r*Math.cos(e)*Math.cos(a)));
      cam.position.set(camX, camY, camZ);
      cam.lookAt(0, state.layout==='pillars' ? state.sideCm/100*0.55 : frameBase*0.92, -0.2);
    }
    // refresh the environment capture now and then — the geometry never moves,
    // only the colour, so a few times a second is plenty
    if(envCam && !LITE && (envTick++ % 20) === 0){
      envCam.visible = false;
      envCam.update(ren, scn);
    }
    ren.render(scn, cam);
    checkBlack();                    // must follow the draw, before the buffer clears
  }

  function resize3D(){
    if(!three.ready) return;
    var fs = state.view === '3d' && !document.body.classList.contains('flow3d');
    var w = fs ? window.innerWidth : glCanvas.clientWidth;
    var h = fs ? window.innerHeight : glCanvas.clientHeight;
    if(!w || !h) return;
    ren.setSize(w, h, false);
    cam.aspect = w/h; cam.updateProjectionMatrix();
  }

  function flowMode(){ return window.innerWidth <= 640; }

  function setView(v){
    state.view = v;
    var is3 = v === '3d';
    var flow = is3 && flowMode();
    glCanvas.hidden = !is3;
    glCanvas.classList.toggle('fs', is3 && !flow);
    document.body.classList.toggle('mode-3d', is3);
    document.body.classList.toggle('flow3d', flow);
    // Fullscreen: .chassis leaves the page, so anything that must stay visible
    // moves out of it. In flow mode everything stays where it belongs and the
    // HUD simply sits under the stage.
    if(is3 && !flow){
      document.body.appendChild(glCanvas); document.body.appendChild(hud);
      document.body.appendChild(shot); document.body.appendChild(joy);
      document.body.appendChild(walkHint); document.body.appendChild(glNote);
    } else {
      frameStage.appendChild(glCanvas); frameStage.appendChild(shot);
      frameStage.appendChild(joy);
      stageEl.appendChild(glNote);
      if(is3){ stageEl.appendChild(walkHint); stageEl.appendChild(hud); }
    }
    placeJoy();
    if(!is3){ setNav('orbit'); walkHint.hidden = true; }
    joy.hidden = !(is3 && walk.on);
    hud.hidden = !is3;
    document.documentElement.style.overflow = (is3 && !flow) ? 'hidden' : '';
    if(is3 && !flow) window.scrollTo(0,0);
    ledCanvas.style.visibility = is3 ? 'hidden' : 'visible';
    bloomCanvas.style.visibility = is3 ? 'hidden' : 'visible';
    frameInner.style.visibility = (is3 || state.layout==='pillars') ? 'hidden' : 'visible';
    scaleMark.style.visibility = is3 ? 'hidden' : 'visible';
    document.querySelectorAll('.view-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.view === v);
    });
    viewNote.textContent = '';
    // the hum belongs to the 3D scene; leaving it is leaving the room
    if(!is3) humStop();
    else if(hum.want && hum.nodes && !hum.on) humStart();
    if(typeof humMark === 'function') humMark();
    if(is3){
      perf.t0 = 0; perf.frames = 0;
      blackChk.t0 = 0; blackChk.done = false;
      loadThree(function(){
        watchGlErrors();
        if(SAFE){
          glNoteSet('Simple 3D is on — reduced lighting, no shadows or reflections.');
          offerFull();
        }
        try{
          if(!scn) buildScene(); else { rebuildGeometry(); }
          resize3D();
          if(!ren || !ren.getContext || !ren.getContext()){
            glFail('this browser would not give the page a WebGL context.');
          }
        }catch(err){
          glFail((err && err.message ? err.message : String(err)));
        }
      });
    }
    saveState();
  }

  // orbit by hand — OrbitControls is not on the CDN and this is twenty lines
  glCanvas.addEventListener('pointerdown', function(e){
    orbit.drag = true; orbit.lx = e.clientX; orbit.ly = e.clientY;
    try{ glCanvas.setPointerCapture(e.pointerId); }catch(err){}
  });
  glCanvas.addEventListener('pointermove', function(e){
    if(!orbit.drag) return;
    var dx = e.clientX - orbit.lx, dy = e.clientY - orbit.ly;
    if(walk.on){
      // same drag, but it turns your head instead of swinging the room
      walk.yaw -= dx * 0.005;
      walk.pitch = Math.max(-0.85, Math.min(0.85, walk.pitch - dy * 0.004));
      walkHint.hidden = true;
    } else {
      orbit.az -= dx * 0.008;
      orbit.el = Math.max(0.02, Math.min(0.92, orbit.el - dy * 0.006));
    }
    orbit.lx = e.clientX; orbit.ly = e.clientY;
  });
  ['pointerup','pointercancel'].forEach(function(ev){
    glCanvas.addEventListener(ev, function(){ orbit.drag = false; });
  });
  glCanvas.addEventListener('wheel', function(e){
    e.preventDefault();
    if(walk.on){
      // walk forward and back, so the wheel still means "closer / further"
      walk.z -= Math.cos(walk.yaw) * e.deltaY * 0.002;
      walk.x -= Math.sin(walk.yaw) * e.deltaY * 0.002;
    } else {
      orbit.dist = Math.max(2.4, Math.min(9.2, orbit.dist + e.deltaY*0.003));
    }
  }, { passive:false });

  // ---- walk input: keys, and a thumb pad for touch ----
  var KEYMAP = { KeyW:'w', KeyA:'a', KeyS:'s', KeyD:'d',
                 ArrowUp:'up', ArrowLeft:'left', ArrowDown:'down', ArrowRight:'right' };
  function typing(){
    var el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }
  window.addEventListener('keydown', function(e){
    if(!walk.on || typing()) return;
    if(e.key === 'Shift'){ walk.run = true; return; }
    var k = KEYMAP[e.code];
    if(!k) return;
    e.preventDefault();
    walk.keys[k] = true;
    walkHint.hidden = true;
  });
  window.addEventListener('keyup', function(e){
    if(e.key === 'Shift'){ walk.run = false; return; }
    var k = KEYMAP[e.code];
    if(k) walk.keys[k] = false;
  });
  window.addEventListener('blur', function(){ walk.keys = {}; walk.run = false; });

  var joyId = null;
  function joyMove(e){
    var r = joy.getBoundingClientRect(), rad = r.width/2 - 12;
    var dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
    var d = Math.hypot(dx, dy);
    if(d > rad){ dx *= rad/d; dy *= rad/d; }
    joyKnob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    walk.joyX = dx/rad;
    walk.joyY = -dy/rad;                       // pad up = walk forward
    walkHint.hidden = true;
  }
  joy.addEventListener('pointerdown', function(e){
    joyId = e.pointerId;
    try{ joy.setPointerCapture(e.pointerId); }catch(err){}
    joyMove(e);
  });
  joy.addEventListener('pointermove', function(e){ if(e.pointerId === joyId) joyMove(e); });
  ['pointerup','pointercancel'].forEach(function(ev){
    joy.addEventListener(ev, function(){
      joyId = null; walk.joyX = walk.joyY = 0;
      joyKnob.style.transform = 'translate(0,0)';
    });
  });

  function placeJoy(){
    // in flow mode the pad sits inside the stage, so CSS already places it
    joy.style.bottom = document.body.classList.contains('flow3d') ? '' : '22px';
  }

  document.querySelectorAll('.view-btn').forEach(function(b){
    b.addEventListener('click', function(){ setView(b.dataset.view); });
  });
  hudExit.addEventListener('click', function(){ setView('2d'); });
  document.querySelectorAll('[data-hud-nav]').forEach(function(b){
    b.addEventListener('click', function(){ setNav(b.dataset.hudNav); placeJoy(); });
  });
  document.querySelectorAll('[data-hud-layout]').forEach(function(b){
    b.addEventListener('click', function(){
      state.layout = b.dataset.hudLayout;
      layout(); if(three.ready) rebuildGeometry(); syncUI();
    });
  });
  document.querySelectorAll('[data-hud-motion]').forEach(function(b){
    b.addEventListener('click', function(){
      state.motion = b.dataset.hudMotion;
      // same reset the 2D chips do, so the two paths behave identically
      if(state.motion==='scan') scanPos = 0;
      if(state.motion==='flash') flashPhase = 0;
      if(state.motion==='sparkle') spawnSparks(6);
      syncUI(); saveState();
    });
  });
  hudBri.addEventListener('input', function(){ state.brightness = +hudBri.value; syncUI(); saveState(); });
  hudSpeed.addEventListener('input', function(){ state.speed = +hudSpeed.value; syncUI(); saveState(); });
  hudAmount.addEventListener('input', function(){ state.amount = +hudAmount.value; syncUI(); saveState(); });
  hudSat.addEventListener('input', function(){ state.sat = +hudSat.value; syncUI(); saveState(); });

  // Colour swatches: one per mood, built from the same MOODS table the 2D deck uses.
  Object.keys(MOODS).forEach(function(name){
    var b = document.createElement('button');
    b.className = 'swatch';
    b.dataset.hudMood = name;
    b.title = name.charAt(0).toUpperCase() + name.slice(1);
    b.setAttribute('aria-label', b.title);
    b.style.background = 'linear-gradient(135deg,' + MOODS[name].join(',') + ')';
    b.addEventListener('click', function(){
      state.mode = 'mood'; state.mood = name;
      syncUI(); saveState();
    });
    hudMoods.appendChild(b);
  });
  UI.hudMood = qa('[data-hud-mood]');

  hudScene.addEventListener('change', function(){
    var i = hudScene.value;
    if(i === '') return;
    var sc = (state.scenes || [])[+i];
    if(sc) applyLook(sc.look);
    hudScene.value = '';
  });
  hudShot.addEventListener('click', function(){ startShot.click(); });

  // Sound is opt-in and remembered. The browser will not let a page make noise
  // before it is touched, so the first build of the audio graph happens here,
  // inside the click, and never on load.
  function humMark(){
    var on = hum.on;
    hudSound.classList.toggle('active', on);
    hudSound.setAttribute('aria-pressed', on ? 'true' : 'false');
    hudSound.textContent = on ? 'Sound on' : 'Sound';
  }
  hudSound.addEventListener('click', function(){
    if(hum.on){ humStop(); hum.want = false; }
    else if(humStart()){ hum.want = true; }
    else { glNoteSet('This browser would not open an audio output.'); return; }
    try{ localStorage.setItem('life-hum', hum.want ? '1' : '0'); }catch(e){}
    humMark();
  });
  humMark();

  // a hum from a tab you are not looking at is just noise
  document.addEventListener('visibilitychange', function(){
    if(!hum.ctx) return;
    if(document.hidden){ if(hum.on && hum.ctx.suspend) hum.ctx.suspend(); }
    else if(hum.on && hum.ctx.resume) hum.ctx.resume();
  });
  hudMoreBtn.addEventListener('click', function(){
    var open = hudMore.hasAttribute('hidden');
    if(open) hudMore.removeAttribute('hidden'); else hudMore.setAttribute('hidden','');
    hudMoreBtn.textContent = open ? 'Hide controls' : 'Controls';
    hudMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    placeJoy();
  });

  window.addEventListener('resize', onResize);

  loadState();
  if(!state.scenes) state.scenes = DEFAULT_SCENES.slice();
  setPixelCount(state.perSide * 4);
  renderScenes();
  syncUI();
  liveInit();
  if(state.view === '3d') setView('3d');
  if(state.motion==='sparkle') spawnSparks(10);
  requestAnimationFrame(loop);
})();
