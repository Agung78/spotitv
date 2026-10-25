(function() {
    if (window.__desktop_spoof_applied) return;
    window.__desktop_spoof_applied = true;

    // =========================================================================
    // SECTION 1: INTERVAL THROTTLE & VIDEO PARKING
    // =========================================================================

    /* === Interval throttle: 250ms -> 500ms ===
     * Throttles aggressive 250ms burst polling loops from web-player.js to 500ms,
     * cutting idle CPU wakeups by 50% with zero perceptible UX impact. */
    try {
        var origSI = window.setInterval.bind(window);
        window.setInterval = function(fn, delay) {
            if (delay === 250) delay = 500;
            return origSI(fn, delay);
        };
    } catch(e) {}

    /* === Background video park/restore ===
     * Stashes src and pauses background canvas videos when the app is hidden or
     * screen is locked. Restores them on return to save GPU, CPU, and RAM. */
    try {
        var parkedVideos = [];

        function isCanvasVid(v) {
            try {
                if (v.muted) return true;
                if (v.hasAttribute && v.hasAttribute('loop')) return true;
                if (v.style && v.style.objectFit === 'cover') return true;
            } catch(e) {}
            return false;
        }

        function parkLiveVideos() {
            var vs = document.querySelectorAll('video');
            for (var i = 0; i < vs.length; i++) {
                var v = vs[i];
                if (v.__sdParked) continue;
                if (!isCanvasVid(v)) continue;
                var src = v.currentSrc || v.getAttribute('src') || '';
                if (!src || src.indexOf('blob:') === 0) continue;
                v.__sdParked = true;
                parkedVideos.push({ el: v, src: src, t: (v.currentTime || 0), playing: (!v.paused && !v.ended) });
                try { v.pause(); } catch(e) {}
                try { v.removeAttribute('src'); } catch(e) {}
                try { v.load(); } catch(e) {}
            }
        }

        function restoreLiveVideos() {
            if (!parkedVideos.length) return;
            for (var i = 0; i < parkedVideos.length; i++) {
                var b = parkedVideos[i];
                var v = b.el;
                if (!v || !v.isConnected) continue;
                if (v.getAttribute('src') || v.currentSrc) {
                    v.__sdParked = false;
                    continue;
                }
                try {
                    v.src = b.src;
                    v.currentTime = b.t || 0;
                    if (b.playing) {
                        var p = v.play();
                        if (p && p.catch) p.catch(function() {});
                    }
                } catch(e) {}
                v.__sdParked = false;
            }
            parkedVideos = [];
        }

        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden') parkLiveVideos();
            else restoreLiveVideos();
        });
    } catch(e) {}

    // =========================================================================
    // SECTION 2: GOOGLE ANALYTICS & TELEMETRY NEUTRALIZER
    // =========================================================================

    /* Replaces window.ga with a noop that still fires hitCallbacks so pages
     * depending on GA callbacks don't break, and proxies dataLayer.push. */
    try {
        var noopfn = function() {};
        var Tracker = function() {};
        Tracker.prototype.get = noopfn;
        Tracker.prototype.set = noopfn;
        Tracker.prototype.send = noopfn;

        var ga = function() {
            var args = Array.from(arguments);
            var len = args.length;
            if (len === 0) return;
            var fn = null;
            var last = args[len - 1];
            if (last instanceof Object && last.hitCallback instanceof Function) {
                fn = last.hitCallback;
            } else if (last instanceof Function) {
                fn = function() { last(new Tracker()); };
            } else {
                var pos = args.indexOf('hitCallback');
                if (pos !== -1 && args[pos + 1] instanceof Function) {
                    fn = args[pos + 1];
                }
            }
            if (fn instanceof Function) {
                try { fn(); } catch(ex) {}
            }
        };
        ga.create = function() { return new Tracker(); };
        ga.getByName = function() { return new Tracker(); };
        ga.getAll = function() { return [new Tracker()]; };
        ga.remove = noopfn;
        ga.loaded = true;
        window.ga = ga;
        window.GoogleAnalyticsObject = 'ga';

        var dl = window.dataLayer;
        if (dl instanceof Object && typeof dl.push === 'function') {
            var doCallback = function(item) {
                if (item instanceof Object && typeof item.eventCallback === 'function') {
                    setTimeout(item.eventCallback, 1);
                    item.eventCallback = function() {};
                }
            };
            dl.push = new Proxy(dl.push, {
                apply: function(target, thisArg, args) {
                    doCallback(args[0]);
                    return Reflect.apply(target, thisArg, args);
                }
            });
        }
    } catch(e) {}

    // =========================================================================
    // SECTION 3: SCREEN & BROWSER USER-AGENT & CLIENT HINTS SPOOFING
    // =========================================================================

    function safeDefine(obj, name, getter) {
        try { Object.defineProperty(obj, name, { get: getter, configurable: true }); } catch(e) {}
    }

    safeDefine(navigator, 'webdriver', function() { return false; });
    safeDefine(navigator, 'vendor', function() { return 'Google Inc.'; });
    safeDefine(navigator, 'productSub', function() { return '20030107'; });
    safeDefine(navigator, 'platform', function() { return 'Win32'; });
    safeDefine(navigator, 'oscpu', function() { return 'Windows NT 10.0; Win64; x64'; });
    safeDefine(navigator, 'languages', function() { return ['en-US', 'en']; });
    safeDefine(navigator, 'language', function() { return 'en-US'; });

    // Mock HTML5 fullscreen capabilities to false so Spotify Web Player does not mount the desktop fullscreen button
    try {
        var retFalse = function() { return false; };
        safeDefine(document, 'fullscreenEnabled', retFalse);
        safeDefine(Document.prototype, 'fullscreenEnabled', retFalse);
        safeDefine(document, 'webkitFullscreenEnabled', retFalse);
        safeDefine(Document.prototype, 'webkitFullscreenEnabled', retFalse);
    } catch(e) {}

    // Mock Document Picture-in-Picture API wired to native Android PiP mode
    try {
        var activePipWindow = null;

        function createPipWindow() {
            var pipDoc = document.implementation.createHTMLDocument('SpotiDuck PiP');
            var listeners = {};
            var pipWin = {
                document: pipDoc,
                width: 512,
                height: 512,
                onpagehide: null,
                onunload: null,
                addEventListener: function(type, listener) {
                    if (!listener) return;
                    if (!listeners[type]) listeners[type] = [];
                    listeners[type].push(listener);
                },
                removeEventListener: function(type, listener) {
                    if (!listeners[type] || !listener) return;
                    listeners[type] = listeners[type].filter(function(l) { return l !== listener; });
                },
                dispatchEvent: function(event) {
                    var type = event ? event.type : '';
                    if (type === 'pagehide' && typeof pipWin.onpagehide === 'function') {
                        try { pipWin.onpagehide.call(pipWin, event); } catch(e) {}
                    }
                    if (type === 'unload' && typeof pipWin.onunload === 'function') {
                        try { pipWin.onunload.call(pipWin, event); } catch(e) {}
                    }
                    if (listeners[type]) {
                        var list = listeners[type].slice();
                        for (var i = 0; i < list.length; i++) {
                            try { list[i].call(pipWin, event); } catch(e) {}
                        }
                    }
                    return true;
                },
                close: function() {
                    if (activePipWindow === pipWin) {
                        activePipWindow = null;
                        try {
                            var ev = new Event('pagehide');
                            pipWin.dispatchEvent(ev);
                            var uev = new Event('unload');
                            pipWin.dispatchEvent(uev);
                        } catch(e) {}
                    }
                },
                matchMedia: window.matchMedia ? window.matchMedia.bind(window) : function() { return { matches: false, addListener: function(){}, removeListener: function(){} }; },
                getComputedStyle: window.getComputedStyle ? window.getComputedStyle.bind(window) : function() { return {}; },
                requestAnimationFrame: window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(fn) { return setTimeout(fn, 16); },
                cancelAnimationFrame: window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : function(id) { clearTimeout(id); }
            };
            try { pipDoc.defaultView = pipWin; } catch(e) {}
            return pipWin;
        }

        window.pipFillMark = function(n) {
            if (!n) return;
            try {
                if (n.__savedStyle === undefined) {
                    n.__savedStyle = n.getAttribute('style');
                    window.__pipFillList = window.__pipFillList || [];
                    window.__pipFillList.push(n);
                }
            } catch(e) {}
        };
        window.pipFillUnblock = function(n) {
            var props = [['transform','none'],['translate','none'],['rotate','none'],['scale','none'],['will-change','auto'],['contain','none'],['container-type','normal'],['filter','none'],['perspective','none'],['backdrop-filter','none'],['content-visibility','visible']];
            var el = n;
            while (el && el !== document.documentElement) {
                try {
                    var cs = window.getComputedStyle(el);
                    for (var i = 0; i < props.length; i++) {
                        var cur = cs.getPropertyValue(props[i][0]);
                        if (cur && cur !== 'none' && cur !== 'normal' && cur !== 'auto' && cur !== 'visible') {
                            window.pipFillMark(el);
                            el.style.setProperty(props[i][0], props[i][1], 'important');
                        }
                    }
                } catch(e) {}
                el = el.parentElement;
            }
        };
        window.pipFillApply = function() {
            try {
                var c = document.querySelector('.VideoPlayer__container') || document.querySelector('[data-testid="video-player-container"]');
                var v = c ? c.querySelector('video') : null;
                if (!v) {
                    var vs = document.querySelectorAll('video');
                    for (var i = 0; i < vs.length; i++) {
                        var src = vs[i].currentSrc || vs[i].src || '';
                        if (src.indexOf('canvaz') === -1) { v = vs[i]; break; }
                    }
                    if (v) c = v.closest('.VideoPlayer__container') || v.parentElement;
                }
                if (!c || !v) return false;
                window.pipFillMark(c);
                window.pipFillMark(v);
                window.pipFillUnblock(c);
                var vv = window.visualViewport;
                var vw = vv && vv.width ? Math.round(vv.width) : (window.innerWidth || 0);
                var vh = vv && vv.height ? Math.round(vv.height) : (window.innerHeight || 0);
                if (!(vw > 0) || !(vh > 0)) return false;
                var vox = vv && vv.offsetLeft ? Math.round(vv.offsetLeft) : 0;
                var voy = vv && vv.offsetTop ? Math.round(vv.offsetTop) : 0;
                c.style.setProperty('position', 'fixed', 'important');
                c.style.setProperty('transform', 'none', 'important');
                c.style.setProperty('margin', '0', 'important');
                c.style.setProperty('padding', '0', 'important');
                c.style.setProperty('border', '0', 'important');
                c.style.setProperty('overflow', 'hidden', 'important');
                c.style.setProperty('inset', 'auto', 'important');
                c.style.setProperty('top', voy + 'px', 'important');
                c.style.setProperty('left', vox + 'px', 'important');
                c.style.setProperty('width', vw + 'px', 'important');
                c.style.setProperty('height', vh + 'px', 'important');
                c.style.setProperty('min-width', '0', 'important');
                c.style.setProperty('min-height', '0', 'important');
                c.style.setProperty('max-width', 'none', 'important');
                c.style.setProperty('max-height', 'none', 'important');
                c.style.setProperty('z-index', '2147483646', 'important');
                c.style.setProperty('background', '#000', 'important');
                v.style.setProperty('width', '100%', 'important');
                v.style.setProperty('height', '100%', 'important');
                v.style.setProperty('object-fit', 'contain', 'important');
                v.style.setProperty('max-width', 'none', 'important');
                v.style.setProperty('max-height', 'none', 'important');
                window.pipFillTopLayer(c);
                return true;
            } catch(e) {}
            return false;
        };
        window.pipFillTopLayer = function(c) {
            try {
                if (window.__popoverSupported === undefined) {
                    window.__popoverSupported = !!(window.HTMLElement && HTMLElement.prototype && ('showPopover' in HTMLElement.prototype));
                }
                if (!window.__popoverSupported) return;
                if (c.matches(':popover-open')) return;
                if (!c.hasAttribute('popover')) c.setAttribute('popover', 'manual');
                try { c.showPopover(); } catch(e) {}
                if (!c.matches(':popover-open')) {
                    try { c.removeAttribute('popover'); } catch(e) {}
                }
            } catch(e) {}
        };
        window.pipFillRestore = function() {
            var l = window.__pipFillList || [];
            for (var i = 0; i < l.length; i++) {
                try {
                    var n = l[i];
                    if (n && n.isConnected) {
                        try { if (n.matches(':popover-open')) n.hidePopover(); } catch(e) {}
                        try { if (n.hasAttribute('popover')) n.removeAttribute('popover'); } catch(e) {}
                        if (n.__savedStyle == null) n.removeAttribute('style'); else n.setAttribute('style', n.__savedStyle);
                    }
                    if (n) delete n.__savedStyle;
                } catch(e) {}
            }
            window.__pipFillList = [];
        };
        window.pipFillVideo = function(on) {
            try {
                if (on) {
                    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch(e) {} }
                    if (!window.__pipFillActive) {
                        window.__pipFillActive = true;
                        if (!window.__pipFillHooked) {
                            window.__pipFillHooked = true;
                            var re = function() { if (window.__pipFillActive) window.pipFillApply(); };
                            window.addEventListener('orientationchange', re);
                            window.addEventListener('resize', re);
                            try {
                                if (window.visualViewport) {
                                    window.visualViewport.addEventListener('resize', re);
                                    window.visualViewport.addEventListener('scroll', re);
                                }
                            } catch(e) {}
                        }
                    }
                    if (!window.__pipFillTimer) window.__pipFillTimer = setInterval(function() { if (window.__pipFillActive) window.pipFillApply(); }, 700);
                    return window.pipFillApply();
                }
                if (!window.__pipFillActive) return true;
                window.__pipFillActive = false;
                if (window.__pipFillTimer) { clearInterval(window.__pipFillTimer); window.__pipFillTimer = null; }
                window.pipFillRestore();
                return true;
            } catch(e) {}
            return false;
        };

        window.documentPictureInPicture = {
            get window() { return activePipWindow; },
            onenter: null,
            requestWindow: async function(options) {
                try {
                    var vs = document.querySelectorAll('video');
                    var pv = null;
                    for (var i = 0; i < vs.length; i++) {
                        var v = vs[i];
                        var src = v.currentSrc || v.src || '';
                        if (src.indexOf('canvaz') === -1) {
                            pv = v;
                            break;
                        }
                    }
                    if (!pv) pv = document.querySelector('.VideoPlayer__container video');
                    if (pv && window.AndBridge && window.AndBridge.enterPipVideo) {
                        var w = pv.videoWidth || 0, h = pv.videoHeight || 0;
                        window.AndBridge.enterPipVideo(w, h);
                    } else if (window.AndBridge && window.AndBridge.enterPip) {
                        window.AndBridge.enterPip();
                    }
                } catch(e) {}
                activePipWindow = createPipWindow();
                if (typeof this.onenter === 'function') {
                    try { this.onenter({ window: activePipWindow }); } catch(e) {}
                }
                return activePipWindow;
            },
            addEventListener: function(type, listener) {},
            removeEventListener: function(type, listener) {}
        };

        window.onNativePipChanged = function(isInPip) {
            if (!isInPip && activePipWindow) {
                var win = activePipWindow;
                activePipWindow = null;
                try {
                    var ev = new Event('pagehide');
                    win.dispatchEvent(ev);
                    var uev = new Event('unload');
                    win.dispatchEvent(uev);
                } catch(e) {}
            }
        };
    } catch(e) {}

    // Mock navigator.userAgentData to align JS client hints with desktop User-Agent
    if (navigator.userAgentData) {
        var mockUserAgentData = {
            brands: [
                { brand: 'Not;A=Brand', version: '8' },
                { brand: 'Chromium', version: '134' },
                { brand: 'Google Chrome', version: '134' }
            ],
            mobile: false,
            platform: 'Windows',
            architecture: 'x86',
            bitness: '64',
            model: '',
            platformVersion: '10.0.0',
            uaFullVersion: '134.0.0.0',
            getHighEntropyValues: async function(hints) {
                return {
                    brands: [
                        { brand: 'Not;A=Brand', version: '8' },
                        { brand: 'Chromium', version: '134' },
                        { brand: 'Google Chrome', version: '134' }
                    ],
                    mobile: false,
                    platform: 'Windows',
                    platformVersion: '10.0.0',
                    architecture: 'x86',
                    bitness: '64',
                    model: '',
                    uaFullVersion: '134.0.0.0'
                };
            },
            toJSON: function() {
                return {
                    brands: this.brands,
                    mobile: this.mobile,
                    platform: this.platform
                };
            }
        };
        safeDefine(navigator, 'userAgentData', function() { return mockUserAgentData; });
    }

    // =========================================================================
    // SECTION 4: NON-BLOCKING ASYNC FETCH & CAPABILITIES INTERCEPTOR
    // =========================================================================

    // Non-blocking fetch interceptor: Rewrites connect-state device capabilities in JS
    // without invoking synchronous Java bridge calls, keeping the UI at 60fps.
    (function() {
        var _origFetch = window.fetch;
        window.fetch = async function(input, init) {
            var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
            var method = (init && init.method || (input && input.method) || 'GET').toUpperCase();

            // Rewrite connect-state capabilities
            if (url && url.indexOf('connect-state/v1/devices') !== -1 && method === 'PUT') {
                try {
                    var bodyText = null;
                    if (init && init.body) {
                        bodyText = (typeof init.body === 'string') ? init.body : await new Response(init.body).text();
                    } else if (input && input.body) {
                        bodyText = await input.clone().text();
                    }
                    if (bodyText) {
                        var payload = JSON.parse(bodyText);
                        var caps = payload && payload.device && payload.device.device_info && payload.device.device_info.capabilities;
                        if (caps) {
                            caps.can_be_player = true;
                            caps.hidden = false;
                        }
                        var newBody = JSON.stringify(payload);
                        if (init) {
                            init.body = newBody;
                        } else if (typeof input === 'object') {
                            init = Object.assign({}, input, { body: newBody });
                        }
                    }
                } catch(e) {}
            }

            return _origFetch.call(this, input, init);
        };
    })();

    // =========================================================================
    // SECTION 5: TOUCHSCREEN PLAY BUTTON INJECTION
    // =========================================================================

    // Inject custom CSS to make play buttons permanently visible on touchscreen
    (function() {
        var style = document.createElement('style');
        style.innerHTML = `
            /* Force play/pause buttons to be permanently visible */
            [data-testid="tracklist-row"] button[aria-label*="Play"],
            [data-testid="tracklist-row"] button[aria-label*="Pause"],
            [data-testid="tracklist-row"] button[class*="qrR_"] {
                opacity: 1 !important;
                visibility: visible !important;
                display: flex !important;
            }
            /* Hide track list index numbers so the play button sits in its place */
            [data-testid="tracklist-row"] [role="gridcell"]:first-child span {
                display: none !important;
            }
        `;
        if (document.documentElement) {
            document.documentElement.appendChild(style);
        } else {
            document.addEventListener('DOMContentLoaded', function() {
                document.documentElement.appendChild(style);
            });
        }
    })();
})();