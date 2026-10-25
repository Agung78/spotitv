(function() {
    if (window.__spotiduck_bridge_applied) {
        if (typeof window.SF_UPDATE === 'function' && window.SF_CONFIG) {
            window.SF_UPDATE(window.SF_CONFIG);
        }
        return;
    }
    window.__spotiduck_bridge_applied = true;

    // Global flags injected by Android:
    // window.SF_CONFIG = { ... };

    // =========================================================================
    // SECTION 1: CORE CONTEXT & INITIALIZATION
    // =========================================================================

    let reqPause = false;
    let firstPlay = true;
    let ulFlag = false;
    let ffDone = false;
    let featVer = `web-player_${new Date().toISOString().split('T')[0]}_${Date.now()}_${Math.floor(Math.random()*0xFFFFFFF).toString(16).padStart(7,'0')}`;
    let lastState = null;
    let lastPos = null;
    window.playing = false;
    let pfint = null;
    let afint = null;
    let cssint = null;
    let aaint = null;
    let tagint = null;
    let fsUpdateTimer = null;
    let fsScrubbing = false;

    try {
        window.spotAuthToken = window.spotAuthToken || localStorage.getItem('spot_auth_token') || null;
        window.spotCliToken = window.spotCliToken || localStorage.getItem('spot_cli_token') || null;
        window.spotDevId = window.spotDevId || localStorage.getItem('spot_dev_id') || localStorage.getItem('spot_device_id') || null;
    } catch (_) {}

    // --- Webpack Module Hook: Capture SpotiDuck Platform APIs & CosmosAsync ---
    (function hookSpotiDuckPlatform() {
        const chunkName = window.webpackChunkopen_spotify ? "webpackChunkopen_spotify" : "webpackChunkxpui";
        const chunkArray = window[chunkName] = window[chunkName] || [];

        chunkArray.push([
            [Symbol("sf-spotiduck-platform")],
            {},
            (require) => {
                try {
                    const modules = require.m;
                    for (const id in modules) {
                        try {
                            const mod = require(id);
                            if (mod && mod.Platform) {
                                window.SpotiDuck = window.SpotiDuck || {};
                                window.SpotiDuck.Platform = mod.Platform;
                                console.log("[SpotiDuck] Captured Native Spotify Platform API!", mod.Platform);
                            }
                            if (mod && mod.CosmosAsync) {
                                window.SpotiDuck = window.SpotiDuck || {};
                                window.SpotiDuck.CosmosAsync = mod.CosmosAsync;
                            }
                        } catch (e) {}
                    }
                } catch (e) {}
            }
        ]);
    })();

    // --- Native SVG Paths (Spotifuck Assets) ---
    const NATIVE_SVGS = {
        previous: `
            <svg viewBox="0 0 16 16" width="32" height="32">
                <path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575
                         a.7.7 0 0 1-1.05.607L4 8.949V14.3a.7.7 0 0 1-.7.7H1.7
                         a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7z" fill="currentColor"/>
            </svg>
        `,
        next: `
            <svg viewBox="0 0 16 16" width="32" height="32">
                <path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575
                         a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6
                         a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7z" fill="currentColor"/>
            </svg>
        `,
        shuffle: `
            <svg viewBox="0 0 24 24" width="28" height="28">
                <path d="M18.788 3.702a1 1 0 0 1 1.414-1.414L23.914 6l-3.712 3.712
                         a1 1 0 1 1-1.414-1.414L20.086 7h-1.518a5 5 0 0 0-3.826 1.78
                         l-7.346 8.73a7 7 0 0 1-5.356 2.494H1v-2h1.04
                         a5 5 0 0 0 3.826-1.781l7.345-8.73A7 7 0 0 1 18.569 5
                         h1.518l-1.298-1.298z" fill="currentColor"/>
                <path d="M18.788 14.289a1 1 0 0 0 0 1.414L20.086 17h-1.518
                         a5 5 0 0 1-3.826-1.78l-1.403-1.668-1.306 1.554 1.178 1.4
                         A7 7 0 0 0 18.568 19h1.518l-1.298 1.298a1 1 0 1 0 1.414 1.414
                         L23.914 18l-3.712-3.713a1 1 0 0 0-1.414 0z
                         M7.396 6.49l2.023 2.404-1.307 1.553-2.246-2.67
                         a5 5 0 0 0-3.826-1.78H1v-2h1.04A7 7 0 0 1 7.396 6.49" fill="currentColor"/>
            </svg>
        `,
        smart_shuffle: `
            <svg viewBox="0 0 24 24" width="28" height="28">
                <path d="M 7.335 0.6 a 0.667 0.667 0 0 0 -1.327 0 c -0.083 0.86 -0.457 2.21 -1.309 3.386
                         C 3.86 5.142 2.567 6.126 0.6 6.333 a 0.667 0.667 0 0 0 0 1.327
                         c 1.967 0.207 3.26 1.19 4.099 2.347 c 0.851 1.176 1.227 2.527 1.307 3.386
                         a 0.666 0.666 0 0 0 1.329 0 c 0.08 -0.86 0.456 -2.21 1.307 -3.386
                         c 0.839 -1.156 2.132 -2.14 4.099 -2.348 a 0.667 0.667 0 0 0 0 -1.326
                         c -1.967 -0.207 -3.26 -1.191 -4.1 -2.347 C 7.792 2.81 7.417 1.459 7.336 0.6 Z
                         m 11.979 6.186 a 1 1 0 0 1 1.415 -1.414 l 3.211 3.211 l -3.212 3.211
                         a 1 1 0 0 1 -1.414 -1.414 l 0.797 -0.797 h -0.862 a 4 4 0 0 0 -3.06 1.425
                         l -6.122 7.275 a 7.3 7.3 0 0 1 -1.383 1.279 c -0.51 0.352 -1.178 0.685 -1.905 0.685
                         v -2 c 0.137 0 0.4 -0.077 0.768 -0.331 c 0.35 -0.242 0.7 -0.577 0.99 -0.921
                         l 6.12 -7.275 a 6 6 0 0 1 4.592 -2.137 h 0.863 Z" fill="currentColor"/>
                <path d="M19.249 19.584a6 6 0 0 1-4.591-2.137l-.771-.917-.006-.007-.003-.003-.016-.02-.06-.07
                         a2 2 0 0 0-.118-.12l1.289-1.53a3.3 3.3 0 0 1 .42.433l.028.035.007.007.76.904
                         a4 4 0 0 0 3.06 1.425h.84l-.798-.797a1 1 0 0 1 1.414-1.415l3.212 3.212-3.212 3.211
                         a1 1 0 1 1-1.414-1.414l.797-.797z" fill="currentColor"/>
            </svg>
        `,
        repeat: `
            <svg viewBox="0 0 16 16" width="28" height="28">
                <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5
                         a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06
                         L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439
                         a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5
                         A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75
                         A3.75 3.75 0 0 1 0 9.75z" fill="currentColor"/>
            </svg>
        `,
        repeat_one: `
            <svg viewBox="0 0 16 16" width="28" height="28">
                <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h.75v1.5h-.75A2.25 2.25 0 0 0 1.5 4.75v5
                         A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75z
                         M12.25 2.5a2.25 2.25 0 0 1 2.25 2.25v5A2.25 2.25 0 0 1 12.25 12H9.81
                         l1.018-1.018a.75.75 0 0 0-1.06-1.06L6.939 12.75l2.829 2.828
                         a.75.75 0 1 0 1.06-1.06L9.811 13.5h2.439A3.75 3.75 0 0 0 16 9.75v-5
                         A3.75 3.75 0 0 0 12.25 1h-.75v1.5z" fill="currentColor"/>
                <path d="m8 1.85.77.694H6.095V1.488q1.046-.077 1.507-.385.474-.308.583-.913h1.32V8H8z" fill="currentColor"/>
                <path d="M8.77 2.544 8 1.85v.693z" fill="currentColor"/>
            </svg>
        `,
        repeat_on: `
            <svg viewBox="0 0 16 16" width="28" height="28">
                <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5
                         a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06
                         L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439
                         a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5
                         A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75
                         A3.75 3.75 0 0 1 0 9.75z" fill="currentColor"/>
                <path d="M8 5.75A1.5 1.5 0 1 0 8 8.75A1.5 1.5 0 1 0 8 5.75Z" fill="currentColor"/>
            </svg>
        `,
        fav_on: `
            <svg viewBox="0 0 16 16" width="28" height="28">
                <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m11.748-1.97
                         a.75.75 0 0 0-1.06-1.06l-4.47 4.47-1.405-1.406
                         a.75.75 0 1 0-1.061 1.06l2.466 2.467 5.53-5.53z" fill="currentColor"/>
            </svg>
        `,
        fav_off: `
            <svg viewBox="0 0 16 16" width="28" height="28">
                <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13
                         M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8" fill="currentColor"/>
                <path d="M11.75 8a.75.75 0 0 1-.75.75H8.75V11a.75.75 0 0 1-1.5 0
                         V8.75H5a.75.75 0 0 1 0-1.5h2.25V5a.75.75 0 0 1 1.5 0
                         v2.25H11a.75.75 0 0 1 .75.75" fill="currentColor"/>
            </svg>
        `
    };

    // --- DOM Tagger & Interaction Logic ---
    window.tagDOM = function() {
        const bar = document.querySelector('aside[data-testid="now-playing-bar"]');
        if (bar) {
            bar.classList.add('sf-player-bar');
            const widget = bar.querySelector('[data-testid*="now-playing-widget"]');
            if (widget) {
                widget.classList.add('sf-player-widget');
                const cover = widget.querySelector('[data-testid*="cover-art"], [data-testid="CoverSlotCollapsed__container"]');
                if (cover && !cover.classList.contains('sf-fs-trigger')) {
                    cover.classList.add('sf-fs-trigger');
                    cover.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openFullscreenPlayer();
                    });
                }
                for (let i = 0; i < widget.children.length; i++) {
                    let ch = widget.children[i];
                    if (!ch.querySelector('[data-testid*="cover-art"], [data-testid="CoverSlotCollapsed__container"]') && ch.querySelector('a, span[data-encore-id="text"]')) {
                        if (!ch.classList.contains('sf-track-info')) {
                            ch.classList.add('sf-track-info');
                            // Removed swipe gesture from mini-player song title
                            // setupSwipe(ch);
                        }
                        break;
                    }
                }
            }
        }

        // Setup swipe gesture ONLY on static cover art images, NOT video podcast containers
        let expArt = null;
        let coverImages = document.querySelectorAll('[data-testid="cover-art-image"]');
        for (let i = 0; i < coverImages.length; i++) {
            let img = coverImages[i];
            if (img.closest('aside[data-testid="now-playing-bar"]')) {
                continue;
            }
            if (img.closest('#main-view') || img.closest('.main-view-container') || img.closest('.YourLibraryX')) {
                continue;
            }
            expArt = img.parentElement || img;
            break;
        }
        if (expArt && !expArt.querySelector('video:not([src*="canvaz"])')) {
            setupSwipe(expArt);
        }
    };

    function openFullscreenPlayer() {
        if (document.getElementById('sf-fs-player')) return;
        const overlay = document.createElement('div');
        overlay.id = 'sf-fs-player';
        overlay.innerHTML = `
            <div id="sf-fs-bg"></div>
            <div class="sf-fs-top">
                <button class="sf-fs-min" aria-label="Close">
                    <svg viewBox="0 0 24 24" width="32" height="32">
                        <path d="M7 10l5 5 5-5z" fill="currentColor"/>
                    </svg>
                </button>

                <div class="sf-fs-top-right">
                    <button class="sf-fs-connect-btn" title="Connect">
                        <svg viewBox="0 0 16 16" width="22" height="22">
                            <path d="M6 2.75C6 1.784 6.784 1 7.75 1h6.5c.966 0 1.75.784 1.75 1.75v10.5
                                     A1.75 1.75 0 0114.25 15h-6.5A1.75 1.75 0 016 13.25zm1.75-.25
                                     a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h6.5a.25.25 0 00.25-.25
                                     V2.75a.25.25 0 00-.25-.25zm-6 0a.25.25 0 00-.25.25v6.5c0 .138.112.25.25.25
                                     H4V11H1.75A1.75 1.75 0 010 9.25v-6.5C0 1.784.784 1 1.75 1H4v1.5z
                                     M4 15H2v-1.5h2z" fill="currentColor"/>
                            <path d="M13 10a2 2 0 11-4 0 2 2 0 014 0m-1-5a1 1 0 11-2 0 1 1 0 012 0" fill="currentColor"/>
                        </svg>
                    </button>
                    <button class="sf-fs-queue-btn" title="Queue">
                        <svg viewBox="0 0 16 16" width="22" height="22">
                            <path d="M15 15H1v-1.5h14zm0-4.5H1V9h14z
                                     m-14-7A2.5 2.5 0 013.5 1h9a2.5 2.5 0 010 5h-9
                                     A2.5 2.5 0 011 3.5zm2.5-1a1 1 0 100 2h9a1 1 0 100-2z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="sf-fs-art-container" id="sf-fs-art-wrap">
                <img id="sf-fs-art" crossorigin="anonymous" draggable="false">
            </div>
            <div class="sf-fs-player-card">
                <div class="sf-fs-info">
                    <h2 id="sf-fs-title"></h2>
                    <p id="sf-fs-artist"></p>
                </div>
                <div class="sf-fs-progress">
                    <span id="sf-fs-pos">0:00</span>
                    <div id="sf-fs-bar-container">
                        <div id="sf-fs-bar-rail">
                            <div id="sf-fs-bar-fill"></div>
                            <div id="sf-fs-bar-handle"></div>
                        </div>
                    </div>
                    <span id="sf-fs-dur">0:00</span>
                </div>
                <div class="sf-fs-controls">
                    <button class="sf-fs-prev"><span id="sf-fs-prev-svg"></span></button>
                    <button class="sf-fs-play"><svg id="sf-fs-play-svg"></svg></button>
                    <button class="sf-fs-next"><span id="sf-fs-next-svg"></span></button>
                </div>
                <div class="sf-fs-extra-controls">
                    <button class="sf-fs-shuffle-btn"><span id="sf-fs-shuffle-svg"></span></button>
                    <button class="sf-fs-like-btn"><span id="sf-fs-like-svg"></span></button>
                    <button class="sf-fs-repeat-btn"><span id="sf-fs-repeat-svg"></span></button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('sf-fs-open');

        // Robust Event Listeners
        overlay.querySelector('.sf-fs-min').onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeFullscreenPlayer();
        };
        overlay.querySelector('.sf-fs-connect-btn').onclick = openConnect;
        overlay.querySelector('.sf-fs-queue-btn').onclick = openQueue;
        overlay.querySelector('.sf-fs-prev').onclick = actSkipBack;
        overlay.querySelector('.sf-fs-play').onclick = (e) => actPlayPause(null, e);
        overlay.querySelector('.sf-fs-next').onclick = actSkipForward;
        overlay.querySelector('.sf-fs-shuffle-btn').onclick = actShuffle;
        overlay.querySelector('.sf-fs-like-btn').onclick = actAddToFav;
        overlay.querySelector('.sf-fs-repeat-btn').onclick = actRepeat;

        setupFullscreenGestures(overlay);

        // Dynamic color extraction from album art with CORS support (active only when sf-fs-player is open)
        window.sfExtractArtworkColors = function(coverUrl) {
            if (!coverUrl || !document.getElementById('sf-fs-player')) return;
            try {
                const tempImg = new Image();
                tempImg.crossOrigin = 'anonymous';
                tempImg.onload = function() {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 16;
                        canvas.height = 16;
                        const ctx = canvas.getContext('2d', { willReadFrequently: true });
                        ctx.drawImage(tempImg, 0, 0, 16, 16);
                        const data = ctx.getImageData(0, 0, 16, 16).data;

                        // Top-left area (3,3)
                        const idx1 = (3 * 16 + 3) * 4;
                        let r1 = data[idx1], g1 = data[idx1+1], b1 = data[idx1+2];

                        // Bottom-right area (12,12)
                        const idx2 = (12 * 16 + 12) * 4;
                        let r2 = data[idx2], g2 = data[idx2+1], b2 = data[idx2+2];

                        // If samples are near-black, sample center areas
                        if (r1 + g1 + b1 < 60) {
                            const idx3 = (8 * 16 + 8) * 4;
                            r1 = data[idx3]; g1 = data[idx3+1]; b1 = data[idx3+2];
                        }
                        if (r2 + g2 + b2 < 60) {
                            const idx4 = (12 * 16 + 4) * 4;
                            r2 = data[idx4]; g2 = data[idx4+1]; b2 = data[idx4+2];
                        }

                        const rgbToHsl = (r, g, b) => {
                            r /= 255; g /= 255; b /= 255;
                            const max = Math.max(r, g, b), min = Math.min(r, g, b);
                            let h, s, l = (max + min) / 2;
                            if (max === min) {
                                h = s = 0;
                            } else {
                                const d = max - min;
                                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                                switch (max) {
                                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                                    case g: h = (b - r) / d + 2; break;
                                    case b: h = (r - g) / d + 4; break;
                                }
                                h /= 6;
                            }
                            return [h * 360, s * 100, l * 100];
                        };

                        let [h1, s1, l1] = rgbToHsl(r1, g1, b1);
                        let [h2, s2, l2] = rgbToHsl(r2, g2, b2);

                        // Ensure vibrant neon pastel properties
                        s1 = Math.max(75, s1);
                        s2 = Math.max(75, s2);
                        l1 = Math.max(55, Math.min(75, l1));
                        l2 = Math.max(55, Math.min(75, l2));

                        const color1 = `hsl(${h1.toFixed(1)}, ${s1.toFixed(1)}%, ${l1.toFixed(1)}%)`;
                        const color2 = `hsl(${h2.toFixed(1)}, ${s2.toFixed(1)}%, ${l2.toFixed(1)}%)`;

                        document.body.style.setProperty('--sf-art-color-from', color1);
                        document.body.style.setProperty('--sf-art-color-to', color2);
                    } catch (e) {
                        document.body.style.setProperty('--sf-art-color-from', '#9e80ff');
                        document.body.style.setProperty('--sf-art-color-to', '#ff9efc');
                    }
                };
                tempImg.onerror = function() {
                    document.body.style.setProperty('--sf-art-color-from', '#9e80ff');
                    document.body.style.setProperty('--sf-art-color-to', '#ff9efc');
                };
                tempImg.src = coverUrl;
            } catch (e) {}
        };

        const barContainer = document.getElementById('sf-fs-bar-container');
        barContainer.addEventListener('touchstart', (e) => {
            fsScrubbing = true;
            handleScrub(e);
        }, {passive: false});
        barContainer.addEventListener('touchmove', handleScrub, {passive: false});
        barContainer.addEventListener('touchend', () => {
            fsScrubbing = false;
        });
        updateFullscreenUI();
        fsUpdateTimer = setInterval(updateFullscreenUI, 500);
    }

    window.openConnect = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        closeFullscreenPlayer();
        document.querySelector('button[aria-label="Connect to a device"]')?.click();
    };

    window.openQueue = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        closeFullscreenPlayer();
        document.querySelector('button[data-testid="control-button-queue"]')?.click();
    };

    function handleScrub(e) {
        const rail = document.getElementById('sf-fs-bar-rail');
        const rect = rail.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const frac = Math.max(0, Math.min(1, x / rect.width));
        const pos = Math.round(frac * window.duration);
        actSeek(pos);
        updateProgressUI(pos, window.duration);
    }

    function updateFullscreenUI() {
        if (!document.getElementById('sf-fs-player')) {
            if (fsUpdateTimer) {
                clearInterval(fsUpdateTimer);
                fsUpdateTimer = null;
            }
            return;
        }
        document.getElementById('sf-fs-title').innerText = window.track || "No Track";
        document.getElementById('sf-fs-artist').innerText = window.artist || "No Artist";
        const art = document.getElementById('sf-fs-art');
        const bg = document.getElementById('sf-fs-bg');
        if (window.cover) {
            const bigCover = window.cover.replace('00004851', '0000b273');
            if (art.src !== bigCover) {
                art.crossOrigin = 'anonymous';
                art.src = bigCover;
                window.sfExtractArtworkColors(bigCover);
            }
            if (bg && bg.style.backgroundImage !== `url("${bigCover}")`) {
                bg.style.backgroundImage = `url("${bigCover}")`;
            }
        }

        document.getElementById('sf-fs-prev-svg').innerHTML = NATIVE_SVGS.previous;
        document.getElementById('sf-fs-next-svg').innerHTML = NATIVE_SVGS.next;

        const playSvg = document.getElementById('sf-fs-play-svg');
        if (playSvg) {
            playSvg.setAttribute('viewBox', '0 0 16 16');
            if (window.playing) {
                playSvg.innerHTML = `
                    <path d="M2.7 1a.7.7 0 00-.7.7v12.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7z
                             m8 0a.7.7 0 00-.7.7v12.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7z" fill="currentColor"/>
                `;
            } else {
                playSvg.innerHTML = `
                    <path d="M3 1.713a.7.7 0 011.05-.607l10.89 6.288
                             a.7.7 0 010 1.212L4.05 14.894A.7.7 0 013 14.287z" fill="currentColor"/>
                `;
            }
        }

        const shSvgWrap = document.getElementById('sf-fs-shuffle-svg');
        if (shSvgWrap) {
            if (window.shmode === 'mixed') {
                shSvgWrap.style.color = '#fff';
                shSvgWrap.innerHTML = NATIVE_SVGS.smart_shuffle;
            } else if (window.shmode === 'true') {
                shSvgWrap.style.color = '#fff';
                shSvgWrap.innerHTML = NATIVE_SVGS.shuffle;
            } else {
                shSvgWrap.style.color = '#b3b3b3';
                shSvgWrap.innerHTML = NATIVE_SVGS.shuffle;
            }
        }

        const repSvgWrap = document.getElementById('sf-fs-repeat-svg');
        if (repSvgWrap) {
            if (window.repmode === 'true') {
                repSvgWrap.style.color = '#fff';
                repSvgWrap.innerHTML = NATIVE_SVGS.repeat_on;
            } else if (window.repmode === 'mixed') {
                repSvgWrap.style.color = '#fff';
                repSvgWrap.innerHTML = NATIVE_SVGS.repeat_one;
            } else {
                repSvgWrap.style.color = '#b3b3b3';
                repSvgWrap.innerHTML = NATIVE_SVGS.repeat;
            }
        }

        const likeSvgWrap = document.getElementById('sf-fs-like-svg');
        if (likeSvgWrap) {
            if (window.isfav) {
                likeSvgWrap.style.color = '#fff';
                likeSvgWrap.innerHTML = NATIVE_SVGS.fav_on;
            } else {
                likeSvgWrap.style.color = '#b3b3b3';
                likeSvgWrap.innerHTML = NATIVE_SVGS.fav_off;
            }
        }

        if (!fsScrubbing) {
            updateProgressUI(window.position, window.duration);
        }
    }

    function updateProgressUI(pos, dur) {
        const fill = document.getElementById('sf-fs-bar-fill');
        const handle = document.getElementById('sf-fs-bar-handle');
        const posTxt = document.getElementById('sf-fs-pos');
        const durTxt = document.getElementById('sf-fs-dur');
        
        const safePos = (typeof pos === 'number' && isFinite(pos) && pos > 0) ? pos : 0;
        const safeDur = (typeof dur === 'number' && isFinite(dur) && dur > 0) ? dur : 0;
        
        if (safeDur > 0) {
            const pct = Math.max(0, Math.min(100, (safePos / safeDur) * 100));
            if (fill) fill.style.width = `${pct}%`;
            if (handle) handle.style.left = `${pct}%`;
        } else {
            if (fill) fill.style.width = '0%';
            if (handle) handle.style.left = '0%';
        }
        
        if (posTxt) posTxt.innerText = formatTime(pos);
        if (durTxt) durTxt.innerText = formatTime(dur);
    }

    function formatTime(ms) {
        if (typeof ms !== 'number' || !isFinite(ms) || ms < 0) {
            ms = 0;
        }
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
    }

    window.closeFullscreenPlayer = function() {
        const overlay = document.getElementById('sf-fs-player');
        if (overlay) {
            overlay.remove();
            document.body.classList.remove('sf-fs-open');
            if (fsUpdateTimer) {
                clearInterval(fsUpdateTimer);
                fsUpdateTimer = null;
            }
        }
    };

    /**
     * Touch gesture engine for the SpotiCap Fullscreen Player Overlay (#sf-fs-player).
     * Handles:
     * 1. Horizontal swipe left/right on artwork or track info to skip tracks.
     * 2. Vertical drag-down on artwork, top header, or track info to collapse/exit the player (120px threshold).
     * 3. Ignores interactive controls (buttons, seek bar) to prevent accidental drags.
     */
    function setupFullscreenGestures(overlay) {
        let startX = null, startY = null;
        let mode = null; // 'h' = horizontal track skip, 'v' = vertical drag-down collapse
        let currentDx = 0, currentDy = 0;
        const artWrap = overlay.querySelector('#sf-fs-art-wrap');

        // Prevent Android WebView native scrolling from swallowing touchmove events
        overlay.style.touchAction = 'none';

        overlay.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            // Ignore interactive control elements (buttons, progress bar, links, inputs)
            if (e.target.closest('button, #sf-fs-bar-container, a, input, select')) return;

            // Restrict gesture initiation to Artwork (#sf-fs-art-wrap), Header (.sf-fs-top), or Title/Artist (.sf-fs-info)
            const isTouchTarget = e.target.closest('#sf-fs-art-wrap, .sf-fs-top, .sf-fs-info');
            if (!isTouchTarget) return;

            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            mode = null;
            currentDx = 0;
            currentDy = 0;

            overlay.style.transition = 'none';
            if (artWrap) artWrap.style.transition = 'none';
        }, { passive: true });

        overlay.addEventListener('touchmove', (e) => {
            if (startX === null || startY === null) return;
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;

            if (!mode) {
                const isArtOrInfo = e.target.closest('#sf-fs-art-wrap, .sf-fs-info');
                if (isArtOrInfo && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
                    mode = 'h';
                } else if (dy > 8 && dy > Math.abs(dx)) {
                    mode = 'v';
                }
            }

            if (mode === 'h' && artWrap) {
                currentDx = dx;
                artWrap.style.transform = `translateX(${dx}px)`;
                artWrap.style.opacity = Math.max(0.3, 1 - Math.abs(dx) / 250);
            } else if (mode === 'v') {
                currentDy = Math.max(0, dy);
                overlay.style.transform = `translateY(${currentDy}px)`;
                overlay.style.opacity = Math.max(0.1, 1 - (currentDy / (window.innerHeight * 0.6)));
            }
        }, { passive: true });

        const handleEnd = () => {
            if (startX === null) return;
            startX = null;
            startY = null;

            if (mode === 'h' && artWrap) {
                const threshold = artWrap.offsetWidth / 2;
                if (Math.abs(currentDx) > threshold) {
                    if (currentDx > 0) {
                        actSkipBack();
                    } else {
                        actSkipForward();
                    }
                    setTimeout(updateFullscreenUI, 300);
                }
                artWrap.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                artWrap.style.transform = '';
                artWrap.style.opacity = '';
            } else if (mode === 'v') {
                const dismissThreshold = 120; // 120px pull-to-dismiss distance threshold
                if (currentDy > dismissThreshold) {
                    overlay.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
                    overlay.style.transform = 'translateY(100%)';
                    overlay.style.opacity = '0';
                    setTimeout(() => {
                        closeFullscreenPlayer();
                    }, 200);
                } else {
                    overlay.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
                    overlay.style.transform = '';
                    overlay.style.opacity = '';
                }
            } else {
                overlay.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
                overlay.style.transform = '';
                overlay.style.opacity = '';
            }
            mode = null;
        };

        overlay.addEventListener('touchend', handleEnd);
        overlay.addEventListener('touchcancel', handleEnd);
    }

    /**
     * Touch swipe helper for non-fullscreen elements (e.g. expanded now playing bar artwork).
     */
    function setupSwipe(el, isFs = false) {
        if (el._sfSwipeAttached) return;
        el._sfSwipeAttached = true;
        el.style.touchAction = 'pan-y';
        el.style.userSelect = 'none';
        el.style.webkitUserDrag = 'none';
        el.addEventListener('dragstart', (e) => e.preventDefault());
        
        // Also apply drag/selection prevention to nested images to prevent browser drag events
        el.querySelectorAll('img').forEach(img => {
            img.style.webkitUserDrag = 'none';
            img.style.userSelect = 'none';
            img.addEventListener('dragstart', (e) => e.preventDefault());
        });
        
        let startX = null, swiping = false;
        let currentDx = 0;
        
        el.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            swiping = false;
            currentDx = 0;
            el.style.transition = 'none';
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
            if (startX === null) return;
            let dx = e.touches[0].clientX - startX;
            if (!swiping && Math.abs(dx) > 10) {
                swiping = true;
            }
            if (swiping) {
                currentDx = dx;
                el.style.transform = `translateX(${dx}px)`;
                el.style.opacity = Math.max(0.3, 1 - Math.abs(dx) / 250);
            }
        }, { passive: true });

        el.addEventListener('touchend', () => {
            if (startX === null) return;
            startX = null;
            let threshold = el.offsetWidth / 2;
            if (swiping && Math.abs(currentDx) > threshold) {
                if (currentDx > 0) {
                    actSkipBack();
                } else {
                    actSkipForward();
                }
            }
            el.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            el.style.transform = '';
            el.style.opacity = '';
        });
    }

    // Dismiss search input focus/dropdown when tapping anywhere outside the search form
    document.addEventListener('click', function(e) {
        // Skip interception for mouse pointer events (Smart TV mice, desktop)
        if (e.pointerType === 'mouse') return;

        // Strictly match music tracklist rows ONLY (leave all podcasts 100% native default)
        const row = e.target.closest('[data-testid="tracklist-row"]');
        if (!row) return;
        
        // Never intercept inside sidebar, navigation drawers, or library lists
        if (row.closest('aside') || row.closest('nav') || row.closest('.YourLibraryX')) return;

        // If user tapped inside a popup menu, dialog, or dropdown options, let native interaction happen
        if (e.target.closest('[role="menu"], [role="menuitem"], [role="menuitemcheckbox"], [data-testid*="menu"], [data-tippy-root], #context-menu')) return;

        // If user tapped directly on a button, link, or input, let native interaction happen
        if (e.target.closest('button, a[href], input, textarea')) return;

        const playBtn = row.querySelector('button[data-testid="play-button"]') || 
                        row.querySelector('button[aria-label*="Play"]') || 
                        row.querySelector('button[aria-label*="play"]');
        if (playBtn) {
            e.preventDefault();
            e.stopPropagation();
            const sr = document.querySelector('input[data-testid="search-input"]');
            if (sr) {
                sr.blur();
            }
            playBtn.click();
        }
    }, true);

    // Dismiss search input focus/dropdown when tapping anywhere outside the search form
    let _sfCollapseDebounceMs = 0; // prevents double-click from touchstart+mousedown toggling the bar
    const _sfCollapseSearchBar = (sr, sb, reason) => {
        const now = Date.now();
        if (now - _sfCollapseDebounceMs < 400) {
            return;
        }
        _sfCollapseDebounceMs = now;
        sb.click();
        // After bar collapses, clean up any lingering dropdown that Spotify keeps mounted
        setTimeout(() => {
            const searchForm2 = document.querySelector('form[role="search"]');
            const drop = searchForm2?.querySelector('[role="listbox"]') ||
                          searchForm2?.querySelector('[data-tippy-root]');
            if (drop && sr?.getAttribute('aria-expanded') !== 'true') {
                drop.style.setProperty('display', 'none', 'important');
                // Restore after a tick so React doesn't break on remount
                requestAnimationFrame(() => drop.style.removeProperty('display'));
            }
        }, 300);
    };

    const dismissSearch = (e) => {
        const searchForm = document.querySelector('form[role="search"]');
        if (!searchForm) return;

        const isInsideForm = searchForm.contains(e.target);

        // Narrow dropdown to only elements INSIDE the search form — avoids false-positives
        // from home-page grids that also use role="listbox"
        const searchDropdownEl = searchForm.querySelector('[role="listbox"]') ||
                                  searchForm.querySelector('[data-tippy-root]') ||
                                  searchForm.querySelector('[role="dialog"]');
        const isInsideDropdown = !!(searchDropdownEl && searchDropdownEl.contains(e.target));
        const isInsideInputArea = isInsideForm && !isInsideDropdown;

        const sr = document.querySelector('input[data-testid="search-input"]');

        if (isInsideInputArea) {
            // Tapping the input/search-button area — let normal focus flow handle it
            return;
        }

        if (isInsideDropdown) {
            // Tapping inside the search dropdown — only act on play-button / album-art taps
            const isPlayClick = e.target.closest('[class*="header-side"]') ||
                                 e.target.closest('[id*="-play"]') ||
                                  e.target.closest('button[aria-label*="Play" i]') ||
                                  e.target.closest('button[aria-label*="Pause" i]') ||
                                  e.target.closest('[data-testid="entity-image"]') ||
                                  (e.target.closest('[data-encore-id="listRow"]') && (e.target.tagName === 'IMG' || e.target.closest('[class*="header-side-flex"]')));
            if (isPlayClick && sr) {
                window._sfBlurFromDropdown = true;
                sr.blur();
                // Spotify may blur the input itself before our blur() runs (no blur event fires).
                // After 50ms, if the blur handler never consumed the flag, advance it to 'pending'
                // so gobserver can collapse the bar when the dropdown is removed from DOM.
                setTimeout(() => {
                    if (window._sfBlurFromDropdown === true) {
                        window._sfBlurFromDropdown = 'pending';
                    }
                }, 50);
            }
        } else {
            // Tapping completely outside the form

            // Clear any stale pending state from a previous play-in-dropdown
            if (window._sfBlurFromDropdown) {
                window._sfBlurFromDropdown = false;
            }

            const sb = sr?.closest('form')?.querySelector('button[data-testid="search-icon"]');
            const isAriaExpanded = sr?.getAttribute('aria-expanded') === 'true';
            const isPort = window.matchMedia('(orientation: portrait)').matches;

            if (isAriaExpanded && isPort && sb) {
                _sfCollapseSearchBar(sr, sb, 'Outside tap aria-expanded=true');
            } else {
                // Not expanded or landscape — just blur
                if (sr) sr.blur();
            }
        }
    };
    document.addEventListener('touchstart', dismissSearch, { capture: true, passive: true });
    // Only attach mousedown dismissal for touch-emulated mice (pointerType check inside),
    // not for real mouse devices (Smart TV, desktop) to avoid eating login/input clicks.
    document.addEventListener('mousedown', function(e) {
        if (e.pointerType === 'mouse') return;
        dismissSearch(e);
    }, { capture: true });

    // -------------------------------------------------------------------------
    // TV / D-PAD FOCUS HIGHLIGHT
    // Add body.sf-tv-nav on first keydown (TV remote / keyboard) to activate
    // the Spotify-green focus ring CSS. Remove it on touchstart so the ring
    // never shows for phone / tablet users.
    // -------------------------------------------------------------------------
    let _sfTvNavActive = false;
    document.addEventListener('keydown', function(e) {
        // D-pad keys: DPAD_CENTER(23), UP(19), DOWN(20), LEFT(21), RIGHT(22)
        // Also handle Tab and Enter for desktop keyboard nav
        const tvKeys = [9, 13, 19, 20, 21, 22, 23, 37, 38, 39, 40];
        if (!_sfTvNavActive && tvKeys.includes(e.keyCode)) {
            _sfTvNavActive = true;
            document.body.classList.add('sf-tv-nav');
        }
    }, { capture: true, passive: true });
    document.addEventListener('touchstart', function() {
        if (_sfTvNavActive) {
            _sfTvNavActive = false;
            document.body.classList.remove('sf-tv-nav');
        }
    }, { capture: true, passive: true });
    document.addEventListener('mousedown', function(e) {
        // Real mouse click (Smart TV mouse pointer) — keep nav mode off
        if (e.pointerType === 'mouse' && _sfTvNavActive) {
            _sfTvNavActive = false;
            document.body.classList.remove('sf-tv-nav');
        }
    }, { capture: true, passive: true });

    // =========================================================================
    // SECTION 2: FETCH & CREDENTIAL INTERCEPTION
    // =========================================================================

    const canvasSelector = [
        '#VideoPlayerNpv_ReactPortal video',
        '.canvasVideoContainerNPV video',
        '[data-testid="track-visual-enhancement"] ~ div video',
        '[data-testid="canvas-video"] video',
        '.VideoPlayer__container video'
    ].join(', ');

    window.SF_UPDATE = function(config) {
        if (!config) return;
        window.SF_CONFIG = Object.assign(window.SF_CONFIG || {}, config);
        
        if (typeof config.isCanvasDisabled !== 'undefined') {
            if (config.isCanvasDisabled) {
                document.body.classList.add('sf-hide-canvas');
                document.body.classList.remove('sf-video-bg');
            } else {
                document.body.classList.remove('sf-hide-canvas');
                document.body.classList.add('sf-video-bg');
            }
        }

        if (typeof config.isFullScreenEnabled !== 'undefined') {
            if (config.isFullScreenEnabled) {
                document.body.classList.add('sf-fullscreen-enabled');
                document.body.classList.remove('sf-fullscreen-disabled');
            } else {
                document.body.classList.remove('sf-fullscreen-enabled');
                document.body.classList.add('sf-fullscreen-disabled');
            }
        }

        if (typeof config.isAmoled !== 'undefined') {
            const amStyleId = 'sf-amoled-override';
            let style = document.getElementById(amStyleId);
            if (config.isAmoled) {
                if (!style) {
                    style = document.createElement('style');
                    style.id = amStyleId;
                    style.textContent = `
                        .encore-dark-theme {
                            --background-base: #000 !important;
                            --background-highlight: #000 !important;
                            --background-elevated-base: #000 !important;
                            --background-elevated-highlight: #000 !important;
                            --background-elevated-press: #000 !important;
                            --background-tinted-base: #000 !important;
                        }
                        aside[data-testid=now-playing-bar] {
                            background: #000 !important;
                            box-shadow: none;
                            border-top: 1px solid #666;
                        }
                    `;
                    document.head.appendChild(style);
                }
            } else if (style) {
                style.remove();
            }
        }
    };

    window.syncUserInfo = function() {
        try {
            let username = '';
            let displayName = '';
            let avatarUrl = '';

            // 1. Spicetify / Spotify internal UserAPI memory lookup
            if (window.Spicetify && window.Spicetify.Platform && window.Spicetify.Platform.UserAPI) {
                window.Spicetify.Platform.UserAPI.getUser().then(u => {
                    if (u) {
                        username = u.uri ? u.uri.replace('spotify:user:', '') : (u.username || '');
                        displayName = u.name || u.displayName || username;
                        avatarUrl = u.images && u.images[0] ? u.images[0].url : '';
                        if (window.AndBridge && typeof window.AndBridge.onUserInfoCaptured === 'function' && displayName) {
                            window.AndBridge.onUserInfoCaptured(username, displayName, avatarUrl);
                        }
                    }
                }).catch(() => {});
            }

            // 2. DOM Selector Fallback (Target explicit profile widget buttons)
            const userBtn = document.querySelector('button[data-testid="user-widget-link"]') ||
                            document.querySelector('[data-testid="user-widget-avatar"]') ||
                            document.querySelector('button[aria-label*="Profile" i]') ||
                            document.querySelector('a[data-testid="user-widget-link"]') ||
                            Array.from(document.querySelectorAll('a[href*="/user/"]')).find(a => {
                                const href = a.getAttribute('href') || '';
                                return !href.includes('/collection') && !href.includes('/playlist') && !href.includes('/album');
                            });

            if (userBtn) {
                const userHref = userBtn.getAttribute('href') || '';
                if (userHref.includes('/user/')) {
                    const candidate = userHref.split('/user/')[1].split('?')[0].split('/')[0];
                    if (candidate && candidate !== 'collection') {
                        username = candidate;
                        window.spotUserId = username;
                    }
                }
                const rawName = (userBtn.getAttribute('aria-label') || userBtn.innerText || '').replace(/^Profile:\s*/i, '').trim();
                const invalidNames = ['Liked Songs', 'Your Library', 'Home', 'Search', 'Create Playlist', 'Liked songs'];
                if (rawName && !invalidNames.includes(rawName)) {
                    displayName = rawName;
                }
                const avatarImg = userBtn.querySelector('img');
                if (avatarImg && avatarImg.src) {
                    avatarUrl = avatarImg.src;
                }

                if (window.AndBridge && typeof window.AndBridge.onUserInfoCaptured === 'function' && (displayName || username)) {
                    window.AndBridge.onUserInfoCaptured(username, displayName, avatarUrl);
                }
            }
        } catch(e) {}
    };

    window.updMedia = function(force = false) {
        const currState = [
            window.track || "",
            window.artist || "",
            window.playing,
            window.repmode || "",
            window.shmode || "",
            window.isfav,
            window.cover || ""
        ].join('|');
        if (force || currState !== lastState) {
            lastState = currState;
            const values = {
                artist: window.artist || "No Artist",
                track: window.track || "No Track",
                playing: window.playing,
                repeat: window.repmode || "false",
                shuffle: window.shmode || "false",
                fav: window.isfav,
                cover: window.cover || "",
                duration: window.duration || 0,
                position: window.position || 0
            };
            AndBridge.recMediaStatus(JSON.stringify(values));
            lastPos = window.position;
        } else if (window.playing) {
            if (lastPos === null || Math.abs(window.position - lastPos) >= 3000) {
                AndBridge.recMediaPosition(window.position);
                lastPos = window.position;
            }
        }
        window.syncUserInfo();
    };

    const oriFetch = window.fetch;
    window.fetch = async function(...args) {
        const [url, opts] = args;
        const method = opts?.method?.toUpperCase?.() || 'GET';
        
        if (window.SF_CONFIG.isCanvasDisabled && (url.includes('canvas-storage') || url.includes('/v1/canvas'))) {
            return new Response(JSON.stringify({canvases:[]}), {status: 200});
        }
        
        const headers = opts?.headers || {};
        if (method === 'POST' && url.includes('/track-playback/v1/devices') && opts?.body) {
            const body = JSON.parse(opts.body);
            const deviceId = body?.device?.device_id;
            if (deviceId && deviceId !== window.spotDevId) {
                window.spotDevId = deviceId;
                try { localStorage.setItem('spot_dev_id', deviceId); } catch(_) {}
                typeof checkMediaLib === 'function' && checkMediaLib();
            }
        }
        
        const cliToken = headers['Client-Token'] || headers['client-token'];
        if (cliToken && cliToken !== window.spotCliToken) {
            window.spotCliToken = cliToken;
            try { localStorage.setItem('spot_cli_token', cliToken); } catch(_) {}
            typeof checkMediaLib === 'function' && checkMediaLib();
        }
        
        const authHead = headers.Authorization || headers.authorization;
        if (authHead?.startsWith('Bearer ') && authHead !== window.spotAuthToken) {
            window.spotAuthToken = authHead;
            try { localStorage.setItem('spot_auth_token', authHead); } catch(_) {}
            typeof checkMediaLib === 'function' && checkMediaLib();
        }
        
        if (method === 'POST' && url.includes('pathfinder/v2/query') && opts?.body) {
            try {
                const bodyObj = typeof opts.body === 'string' ? JSON.parse(opts.body) : null;
                const opName = bodyObj?.operationName;
                const hash = bodyObj?.extensions?.persistedQuery?.sha256Hash;
                if (opName && hash) {
                    window.spHashes = window.spHashes || {};
                    if (window.spHashes[opName] !== hash) {
                        window.spHashes[opName] = hash;
                        try { localStorage.setItem('sp_hash_' + opName, hash); } catch(_) {}
                        console.log(`[Spotifuck] Dynamic GQL hash captured for ${opName}: ${hash.substring(0, 10)}...`);
                        if (opName === 'libraryV3' || opName === 'fetchLibraryTracks') {
                            typeof checkMediaLib === 'function' && checkMediaLib(true);
                        }
                    }
                }
            } catch(e) {}
        }
        
        if (ffDone && url.includes('/track-playback/') && method === 'PUT') {
            const bodyStr = opts?.body ? (typeof opts.body === 'string' ? opts.body : '') : '';
            if (bodyStr.includes('"paused":true')) {
                manageAll(false);
            } else if (bodyStr.includes('"paused":false')) {
                manageAll(true);
            }
        }
        
        const strUrl = typeof url === 'string' ? url : (url && url.url ? url.url : '');
        if (strUrl && (strUrl.includes('connect-state') || strUrl.includes('melody/v1/msg'))) {
            try {
                const reqHeaders = opts?.headers || {};
                const reqBody = opts?.body ? (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)) : null;
                const rawRes = AndBridge.nativeFetch(strUrl, method, JSON.stringify(reqHeaders), reqBody);
                if (rawRes) {
                    const parsed = JSON.parse(rawRes);
                    const status = parsed.status || 200;
                    const resBody = parsed.body || '';
                    return {
                        ok: status >= 200 && status < 300,
                        status: status,
                        statusText: status === 200 ? 'OK' : '',
                        headers: new Headers(parsed.headers || {}),
                        url: strUrl,
                        json: async () => JSON.parse(resBody || '{}'),
                        text: async () => resBody,
                        arrayBuffer: async () => new TextEncoder().encode(resBody).buffer,
                        clone: function() { return this; }
                    };
                }
            } catch (e) {
                console.error('[Spotifuck] Proxy nativeFetch error:', e);
            }
        }

        try {
            const resp = await oriFetch(url, opts);
            if (resp.status === 404 && url.includes('connect-state') && url.includes('/command/from/')) {
                AndBridge.deferMessage('reload');
                location.reload();
            }
            return resp;
        } catch (err) {
            throw err;
        }
    };

    // =========================================================================
    // SECTION 3: WAKE LOCK & BACKGROUND CONTROL
    // =========================================================================

    window.playFromUri = function(uri, contextUri) {
        if (!uri) return;

        if (uri && (uri.startsWith('http://') || uri.startsWith('https://'))) {
            try {
                const u = new URL(uri);
                let pathSegments = u.pathname.split('/').filter(Boolean);
                if (pathSegments.length > 0 && pathSegments[0].startsWith('intl-')) {
                    pathSegments = pathSegments.slice(1);
                }
                if (pathSegments.length >= 2) {
                    uri = 'spotify:' + pathSegments.join(':');
                } else if (pathSegments.length === 1) {
                    uri = 'spotify:' + pathSegments[0];
                }
            } catch(e) {}
        }

        if (uri && uri.startsWith('spotify:search:')) {
            const query = decodeURIComponent(uri.substring('spotify:search:'.length));
            if (typeof window.openSearch === 'function') {
                window.openSearch(query);
            }
            return;
        }

        const devId = window.spotDevId || localStorage.getItem('spot_dev_id');
        if (!devId) {
            console.warn('[Spotifuck] Cannot playFromUri: device ID not ready yet');
            return;
        }

        let playContext = contextUri || uri;
        let isTrack = uri && uri.startsWith('spotify:track:');
        let isContextItem = uri && (uri.startsWith('spotify:album:') || uri.startsWith('spotify:playlist:') || uri.startsWith('spotify:artist:') || uri.startsWith('spotify:show:'));

        if (isContextItem) {
            playContext = uri;
        }

        let isLikedSongs = (playContext === 'your_library' || playContext.includes('collection') || playContext === 'playlists' || playContext === 'spotify:collection:tracks');

        let playOptions = {
            license: 'tft',
            skip_to: {},
            player_options_override: {}
        };

        let commandContext = {
            uri: playContext,
            url: 'context://' + playContext,
            metadata: {}
        };

        let featIdent = playContext.match(/^spotify:([^:]+)/)?.[1];
        if (featIdent == 'user' || isLikedSongs) featIdent = 'your_library';

        if (isLikedSongs) {
            let tracks = window.likedSongsCache || [];
            let targetUri = isTrack ? uri : (tracks[0]?.id || uri);
            let trackList = (tracks || []).map(t => t.id || t.uri || t).filter(Boolean);

            if (targetUri && targetUri.includes(':track:') && !trackList.includes(targetUri)) {
                trackList.unshift(targetUri);
            }

            let collectionUri = window.spotUserId ? `spotify:user:${window.spotUserId}:collection` : "spotify:collection:tracks";

            commandContext = {
                uri: collectionUri,
                url: "context://" + collectionUri,
                metadata: {
                    context_description: "Liked Songs"
                },
                pages: [{
                    page_url: "context://" + collectionUri,
                    tracks: trackList.map(u => ({ uri: u }))
                }]
            };

            featIdent = 'collection-tracks';

            playOptions.skip_to = {
                track_uri: targetUri
            };
        } else if (isTrack) {
            if (contextUri && contextUri !== uri && !contextUri.startsWith('spotify:track:')) {
                playOptions.skip_to = {
                    track_uri: uri
                };
            } else {
                commandContext = {
                    uri: uri,
                    url: "context://" + uri,
                    metadata: {},
                    pages: [{
                        page_url: "context://" + uri,
                        tracks: [{ uri: uri }]
                    }]
                };
                playOptions.skip_to = {
                    track_uri: uri
                };
                featIdent = 'search';
            }
        }

        const token = window.spotAuthToken || localStorage.getItem('spot_auth_token');
        const cliTok = window.spotCliToken || localStorage.getItem('spot_cli_token');
        if (!token) {
            console.warn('[Spotifuck] Cannot playFromUri: AuthToken not ready');
            return;
        }

        console.log(`[Spotifuck] playFromUri sending command for uri=${uri}, contextUri=${contextUri}, devId=${devId}`);

        fetch(`https://gew4-spclient.spotify.com/connect-state/v1/player/command/from/${devId}/to/${devId}`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Client-Token': cliTok || '',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: {
                    context: commandContext,
                    play_origin: {
                        feature_identifier: featIdent || 'your_library',
                        feature_version: featVer || '1.2.40.0',
                        referrer_identifier: 'your_library'
                    },
                    options: playOptions,
                    endpoint: 'play'
                }
            })
        });
    };

    async function searchAndPlay(query) {
        if (!query) return;
        try {
            await ensureAuthToken();
            const token = window.spotAuthToken || (function() { try { return localStorage.getItem('spot_auth_token'); } catch(_) { return null; } })();
            const cliTok = window.spotCliToken || (function() { try { return localStorage.getItem('spot_cli_token'); } catch(_) { return null; } })();
            if (!token) {
                console.warn('[Spotifuck] searchAndPlay: Auth token unavailable.');
                return;
            }
            const headers = {
                'Authorization': token,
                'Content-Type': 'application/json;charset=UTF-8',
                'app-platform': 'WebPlayer',
                'spotify-app-version': '1.2.40.0'
            };
            if (cliTok) {
                headers['Client-Token'] = cliTok;
            }
            const resp = await oriFetch('https://api-partner.spotify.com/pathfinder/v2/query', {
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
                headers: headers,
                body: JSON.stringify({
                    variables: {
                        searchTerm: query,
                        offset: 0,
                        limit: 10,
                        numberOfTopResults: 5,
                        includeAudiobooks: false,
                        includeArtistHasConcertsField: false,
                        includePreReleases: false,
                        includeLocalConcertsField: false,
                        includeAuthors: false
                    },
                    operationName: 'searchDesktop',
                    extensions: {
                        persistedQuery: {
                            version: 1,
                            sha256Hash: getGqlHash('searchDesktop', '4801118d4a100f756e833d33984436a3899cff359c532f8fd3aaf174b60b3b49')
                        }
                    }
                })
            });
            if (!resp.ok) return;
            const data = await resp.json();
            const searchData = data?.data?.searchV2 || data?.data?.search;
            const topResults = searchData?.topResultsV2?.items || searchData?.topResults?.items || [];
            let targetUri = null;
            for (const elem of topResults) {
                const itemWrapper = elem?.item || elem;
                const d = itemWrapper?.data || itemWrapper;
                const uri = itemWrapper?.uri || d?.uri || (d?.id ? 'spotify:' + (d?.__typename?.toLowerCase().replace('responsewrapper', '') || 'track') + ':' + d?.id : null);
                if (uri) {
                    targetUri = uri;
                    break;
                }
            }
            if (!targetUri) {
                const tracks = searchData?.tracksV2?.items || searchData?.tracks?.items || [];
                const firstTrack = tracks[0]?.item || tracks[0];
                const d = firstTrack?.data || firstTrack;
                targetUri = firstTrack?.uri || d?.uri || (d?.id ? 'spotify:track:' + d.id : null);
            }
            if (targetUri) {
                window.playFromUri(targetUri);
            }
        } catch (e) {
            console.error('[Spotifuck] searchAndPlay failed for ' + query, e);
        }
    }
    window.searchAndPlay = searchAndPlay;

    window.openSearch = function(query) {
        if (!query) return;
        console.log('[Spotifuck] openSearch called with query:', query);

        const executeSearchOnInput = (sr) => {
            if (sr._valueTracker) {
                try { sr._valueTracker.setValue(''); } catch(e) {}
            }
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(sr, query);
            } else {
                sr.value = query;
            }

            try {
                sr.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: query }));
            } catch(e) {}
            sr.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            sr.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            // Dispatch React Fiber synthetic onChange
            const reactKey = Object.keys(sr).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
            if (reactKey && sr[reactKey]?.onChange) {
                try {
                    sr[reactKey].onChange({
                        target: sr,
                        currentTarget: sr,
                        bubbles: true,
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    });
                } catch(e) {}
            }

            // Step 2: After React batches the input change, submit the search via Enter and Form submit
            setTimeout(() => {
                const enterInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
                sr.dispatchEvent(new KeyboardEvent('keydown', enterInit));
                sr.dispatchEvent(new KeyboardEvent('keypress', enterInit));
                sr.dispatchEvent(new KeyboardEvent('keyup', enterInit));

                if (reactKey && sr[reactKey]?.onKeyDown) {
                    try {
                        sr[reactKey].onKeyDown({
                            ...enterInit,
                            target: sr,
                            currentTarget: sr,
                            preventDefault: () => {},
                            stopPropagation: () => {}
                        });
                    } catch(e) {}
                }

                const form = sr.closest('form');
                if (form) {
                    const formReactKey = Object.keys(form).find(k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$'));
                    if (formReactKey && form[formReactKey]?.onSubmit) {
                        try {
                            form[formReactKey].onSubmit({
                                target: form,
                                currentTarget: form,
                                bubbles: true,
                                preventDefault: () => {},
                                stopPropagation: () => {}
                            });
                        } catch(e) {}
                    }
                    try {
                        if (typeof form.requestSubmit === 'function') {
                            form.requestSubmit();
                        } else {
                            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                        }
                    } catch(e) {}
                }
            }, 50);
        };

        const tryPopulate = () => {
            let sr = document.querySelector('input[data-testid="search-input"]');
            if (sr) {
                executeSearchOnInput(sr);
                return true;
            }
            return false;
        };

        if (!tryPopulate()) {
            const navBtn = document.querySelector('a[href="/search"]') ||
                           document.querySelector('button[data-testid="search-icon"]') ||
                           document.querySelector('button[aria-label*="Search" i]');
            if (navBtn) navBtn.click();
            setTimeout(tryPopulate, 150);
            setTimeout(tryPopulate, 400);
            setTimeout(tryPopulate, 800);
        }
    };

    window.firstFuck = function() {
        if (pfint) clearInterval(pfint);
        pfint = setInterval(() => {
            if (typeof window.syncUserInfo === 'function') {
                window.syncUserInfo();
            }

            if (window.playing && document.visibilityState === 'hidden') {
                AndBridge.wakeUp();
            }
            
            window.syncNpBtnPos = function() {
                if (window.SF_CONFIG && window.SF_CONFIG.guiMode === "csshack") {
                    let lyBtn = document.querySelector('button[data-testid="lyrics-button"]');
                    let queueBtn = document.querySelector('button[aria-label*="Queue" i]') || document.querySelector('button[data-testid*="queue"]');
                    let connectBtn = document.querySelector('button[aria-label*="Connect" i]') || document.querySelector('button[data-testid*="connect"]');
                    let fallbackContainer = document.querySelector('aside[data-testid="now-playing-bar"] > div > div:last-child');
                    let anchorBtn = lyBtn || queueBtn || connectBtn;

                    if (anchorBtn && anchorBtn.parentNode) {
                        if (typeof window.npBtn === 'undefined') {
                            window.npBtn = document.createElement('button');
                            window.npBtn.className = 'npbtn';
                            window.npBtn.onclick = clickNP;
                            window.npBtn.innerHTML = `
                                <svg viewBox="0 0 16 17">
                                    <rect x="1" y="0.75" width="14" height="15.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
                                    <path d="M 6 5 L 6 5.9160156 L 9.6933594 8.5 L 6 11.080078 L 6 12 L 11 8.5 L 6 5 z"
                                          stroke="currentColor" stroke-width="1.2"/>
                                </svg>
                            `;
                        }
                        if (window.npBtn.nextSibling !== anchorBtn) {
                            anchorBtn.parentNode.insertBefore(window.npBtn, anchorBtn);
                        }
                    } else if (fallbackContainer && (!window.npBtn || !document.body.contains(window.npBtn))) {
                        if (typeof window.npBtn === 'undefined') {
                            window.npBtn = document.createElement('button');
                            window.npBtn.className = 'npbtn';
                            window.npBtn.onclick = clickNP;
                            window.npBtn.innerHTML = `
                                <svg viewBox="0 0 16 17">
                                    <rect x="1" y="0.75" width="14" height="15.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>
                                    <path d="M 6 5 L 6 5.9160156 L 9.6933594 8.5 L 6 11.080078 L 6 12 L 11 8.5 L 6 5 z"
                                          stroke="currentColor" stroke-width="1.2"/>
                                </svg>
                            `;
                        }
                        fallbackContainer.appendChild(window.npBtn);
                    }
                }
            };
            window.syncNpBtnPos();
            
            let pb = document.querySelector('button[data-testid=control-button-playpause]:not(.fuckd)') ||
                     document.querySelector('aside button[data-testid=control-button-playpause]:not(.fuckd)');
            if (pb) {
                AndBridge.playLoaded();
                pb.classList.add('fuckd');
                window.pBtn = pb;
                window.pBtn.addEventListener('click', () => {
                    if (window.playing) {
                        reqPause = true;
                        ulFlag = false;
                        manageWake(false);
                    } else if (!ulFlag) {
                        reqPause = false;
                        manageWake(true);
                        ulFlag = true;
                        setTimeout(() => {
                            if (ulFlag && !window.playing) {
                                AndBridge.deferMessage('unlock');
                                actSkipForward();
                                trigUnlock();
                            } else if (ulFlag) {
                                ulFlag = false;
                            }
                        }, 10000);
                    }
                });
                
                if (!ffDone) {
                    ffDone = true;
                    addGlobalCleanup();
                    addAutoFeatures();
                    addCSSJSHack();
                    addAndAuto();
                    tagDOM();
                    if (tagint) clearInterval(tagint);
                    tagint = setInterval(tagDOM, 6000);
                    manageAll(window.playing || false);
                }
            }
        }, 5000);
    };

    window.manageWake = function(enable) {
        if (enable) {
            if (document.visibilityState == 'hidden') AndBridge.wakeUp();
        } else {
            AndBridge.wakeOff();
        }
    };

    window.manageAll = function(play) {
        window.playing = play;
        AndBridge.manageTShut(!play);
        AndBridge.manageTSleep(play);
        if (play) {
            firstFuck();
            addGlobalCleanup();
            addAutoFeatures();
            addCSSJSHack();
            addAndAuto();
        } else {
            AndBridge.wakeOff();
        }
        updMedia();
    };

    window.clickNP = function() {
        let rBtn = document.querySelector('#Desktop_PanelContainer_Id')?.parentNode?.parentNode?.nextElementSibling?.querySelector('button');
        if (rBtn) {
            let npHid = document.querySelector('#Desktop_PanelContainer_Id').parentNode.parentNode.ariaHidden;
            if (typeof window.npBtn !== 'undefined') {
                if (npHid && npHid == 'true') {
                    window.npBtn.classList.add('active');
                } else {
                    window.npBtn.classList.remove('active');
                }
            }
            rBtn.click();
        }
    };

    window.closeNowPlay = function() {
        let rc = document.querySelector('#Desktop_PanelContainer_Id');
        if (rc && rc.parentNode.parentNode.ariaHidden == 'false') {
            let rBtn = rc.parentNode?.parentNode?.nextElementSibling?.querySelector('button');
            if (rBtn) rBtn.click();
        }
    };

    window.trigUnlock = function() {
        let uint = setInterval(() => {
            if (window.pBtn.disabled) {
                AndBridge.deferMessage('reload');
                window.location.reload();
            } else if (window.playing) {
                clearInterval(uint);
                ulFlag = false;
            }
        }, 3000);
    };

    window.actPlayPause = function(play, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const pb = document.querySelector('button[data-testid="control-button-playpause"]') || window.pBtn;
        if (!pb) return;
        
        if (play === null || typeof play === 'undefined') {
            pb.click();
        } else if (play === true) {
            if (!window.playing) pb.click();
        } else if (play === false) {
            if (window.playing) pb.click();
            manageWake(false);
        }
    };

    window.actSkipBack = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (window.SpotiDuck && window.SpotiDuck.Platform && window.SpotiDuck.Platform.PlayerAPI) {
            manageWake(true);
            window.SpotiDuck.Platform.PlayerAPI.previous();
            return;
        }
        let bb = document.querySelector('button[data-testid=control-button-skip-back]');
        if (bb) {
            manageWake(true);
            bb.click();
        }
    };

    window.actSkipForward = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (window.SpotiDuck && window.SpotiDuck.Platform && window.SpotiDuck.Platform.PlayerAPI) {
            manageWake(true);
            window.SpotiDuck.Platform.PlayerAPI.next();
            return;
        }
        let fb = document.querySelector('button[data-testid=control-button-skip-forward]');
        if (fb) {
            manageWake(true);
            fb.click();
        }
    };

    window.actRepeat = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (window.SpotiDuck && window.SpotiDuck.Platform && window.SpotiDuck.Platform.PlayerAPI) {
            window.SpotiDuck.Platform.PlayerAPI.toggleRepeat();
            setTimeout(() => addAndAuto(true), 100);
            return;
        }
        let rb = document.querySelector('button[data-testid=control-button-repeat]');
        if (rb) {
            rb.click();
            setTimeout(() => addAndAuto(true), 100);
            setTimeout(() => addAndAuto(true), 500);
        }
    };

    function getShuffleButton() {
        let sb = document.querySelector('button[data-testid="control-button-shuffle"]') ||
                 document.querySelector('button[data-testid*="shuffle"]') ||
                 document.querySelector('button[aria-label*="shuffle" i]');
        if (!sb) {
            let container = document.querySelector('div[data-testid="player-controls"]') ||
                            document.querySelector('aside[data-testid="now-playing-bar"]');
            if (container) {
                let btns = container.querySelectorAll('button');
                if (btns && btns.length >= 4) {
                    sb = btns[0];
                }
            }
        }
        return sb;
    }

    window.actShuffle = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (window.SpotiDuck && window.SpotiDuck.Platform && window.SpotiDuck.Platform.PlayerAPI) {
            window.SpotiDuck.Platform.PlayerAPI.toggleShuffle();
            setTimeout(() => {
                if (typeof window.syncShuffleState === 'function') window.syncShuffleState();
                if (typeof updMedia === 'function') updMedia(true);
            }, 150);
            return;
        }
        let sb = getShuffleButton();
        if (sb) {
            sb.click();
            setTimeout(() => {
                if (typeof window.syncShuffleState === 'function') window.syncShuffleState();
                if (typeof updMedia === 'function') updMedia(true);
            }, 150);
        }
    };

    window.actAddToFav = function(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        let fb = document.querySelector('[data-testid*="now-playing-widget"]>div:last-child>button');
        if (fb) {
            fb.click();
            setTimeout(() => addAndAuto(true), 100);
            setTimeout(() => addAndAuto(true), 500);
        }
    };

    window.actSeek = function(pos) {
        let rg = document.querySelector('div[data-testid=playback-progressbar] input[type=range]');
        if (rg) {
            rg.value = pos;
            rg.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    window.findCanvasToggle = function() {
        // Try the current known ID first
        let el = document.getElementById('settings.videos-and-canvas.canvas');
        if (el) return el;
        // Fallback: find a label whose visible text is exactly "Canvas" and grab its checkbox
        for (let label of document.querySelectorAll('label[for]')) {
            if ((label.textContent || '').trim() === 'Canvas') {
                try {
                    let cb = document.getElementById(label.htmlFor) || document.querySelector('#' + CSS.escape(label.htmlFor));
                    if (cb && cb.type === 'checkbox') return cb;
                } catch(e) {}
            }
        }
        return null;
    };

    window.syncCanvasToggle = function(el) {
        // Kept empty to prevent Spotify's internal global video player from being disabled for Video Podcasts
    };

    window.addGlobalCleanup = function() {
        let gst = document.createElement('style');
        gst.id = 'global-cleanup-style';
        gst.textContent = `
            /* Hide generic banners, but preserve login/form error alerts */
            div[data-encore-id=banner]:not([class*="error" i]):not(:has([role="alert"])):not([role="alert"]),
            #global-nav-bar > div:first-of-type,
            #global-nav-bar a[href="/download"],
            #global-nav-bar button[aria-label*="Upgrade" i],
            #global-nav-bar button[aria-label*="Premium" i],
            #global-nav-bar button[aria-label*="Explore" i],
            #global-nav-bar a[href*="premium" i],
            a[href*="spotify.com/premium"],
            [data-testid="upgrade-button"],
            button[aria-label*="Explore Premium"],
            button[aria-label*="Upgrade"],
            div.main-view-container__mh-footer-container,
            button[data-testid="open-in-desktop-app"],
            [data-testid="desktop-client-button"],
            a[href="/download"],
            button[aria-label="Open in Desktop app"],
            [aria-label="Download Spotify"],
            [data-testid="top-bar-download-button"],
            a[href*="desktop-download"],
            #Desktop_LeftSidebar_Id a[href*="/download"],
            #Desktop_LeftSidebar_Id button[aria-label*="Download"] {
                display: none !important;
            }

            aside[data-testid="now-playing-bar"],
            .lbtn {
                z-index: calc(var(--above-everything-grid-area-z-index) + 10) !important;
                opacity: 1 !important;
                visibility: visible !important;
            }

            .sf-hide-canvas .canvasVideoContainerNPV,
            .sf-hide-canvas [data-testid="canvas-video"],
            .sf-hide-canvas video[src*="canvaz"] {
                display: none !important;
            }

            .sf-hide-canvas [data-testid="track-visual-enhancement"] {
                display: block !important;
                pointer-events: auto !important;
                transform: none !important;
            }

            .sf-hide-canvas [data-testid="track-visual-enhancement"] img {
                display: block !important;
            }
        `;
        if (!document.getElementById('global-cleanup-style')) {
            document.head.appendChild(gst);
        }

        if (typeof window.gobserver === 'undefined') {
            window.gobserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    // ── Removed nodes: detect search dropdown leaving DOM ──────────────
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === 1 && window._sfBlurFromDropdown === 'pending') {
                            // Check if this removed node IS or CONTAINS the search dropdown
                            const isDropdown = (node.getAttribute?.('role') === 'listbox' ||
                                               node.getAttribute?.('role') === 'dialog' ||
                                               node.hasAttribute?.('data-tippy-root')) &&
                                              (node.querySelector?.('[data-encore-id="typeList"]') ||
                                               node.querySelector?.('[class*="type-list"]') ||
                                               (node.querySelector?.('[data-encore-id="listRow"]') && !node.querySelector?.('[role="menu"]')));
                            if (isDropdown) {
                                window._sfBlurFromDropdown = false;
                                const sr2 = document.querySelector('input[data-testid="search-input"]');
                                const sb2 = sr2?.closest('form')?.querySelector('button[data-testid="search-icon"]');
                                if (sr2 && sb2) {
                                    const isExpandedNow = sr2.getAttribute('aria-expanded') === 'true' || sr2.offsetWidth > 60;
                                    if (isExpandedNow) sb2.click();
                                }
                            }
                        }
                    });

                    // ── Added nodes ──────────────────────────────────────────────────────
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            // Skip inspecting elements inside the right sidebar / now playing panel
                            if (node.id === 'Desktop_PanelContainer_Id' ||
                                (node.closest && (node.closest('#Desktop_PanelContainer_Id') || node.closest('aside[data-testid="now-playing-view"]')))) {
                                return;
                            }
                            node.querySelectorAll("button, a, span").forEach(el => {
                                let txt = (el.textContent || "").toLowerCase();
                                const blockedTexts = [
                                    'open in desktop app', 'open app', 'install app',
                                    'download spotify', 'explore premium', 'upgrade to premium', 'get premium'
                                ];
                                if (blockedTexts.some(t => txt.includes(t))) {
                                    el.style.setProperty('display', 'none', 'important');
                                    if (el.closest('nav') || el.closest('#Desktop_LeftSidebar_Id') || el.closest('#global-nav-bar')) {
                                        let p = el.parentElement;
                                        if (p && p.childNodes.length === 1) {
                                            p.style.setProperty('display', 'none', 'important');
                                        }
                                    }
                                }
                            });
                            
                            let cv = findCanvasToggle();
                            if (cv && node.contains(cv)) {
                                syncCanvasToggle(cv);
                            }
                            
                            if (window.SF_CONFIG.isCanvasDisabled) {
                                node.querySelectorAll("[role='menuitem'], li").forEach(el => {
                                    let txt = (el.textContent || "").toLowerCase();
                                    if (txt.includes('canvas') && !txt.includes('artwork') && !txt.includes('album art')) {
                                        el.style.setProperty('display', 'none', 'important');
                                    }
                                });
                            }
                        }
                    });
                });
                if (!window._sfPostMutationRaf) {
                    window._sfPostMutationRaf = requestAnimationFrame(() => {
                        window._sfPostMutationRaf = null;
                        if (typeof window.syncNpBtnPos === 'function') {
                            window.syncNpBtnPos();
                        }
                        if (typeof window.tagDOM === 'function') {
                            window.tagDOM();
                        }
                    });
                }
            });
            window.gobserver.observe(document.body, { childList: true, subtree: true });
        }
    };

    window.addAutoFeatures = function() {
        if (window.SF_CONFIG.autoPlayMode === "onetime") {
            if ('pBtn' in window && firstPlay && !window.playing) {
                window.pBtn.click();
                firstPlay = false;
            }
        }
        
        if (window.SF_CONFIG.closeNowPlay ||
            window.SF_CONFIG.takeControl ||
            window.SF_CONFIG.autoPlayMode === "permanent" ||
            typeof window.SF_CONFIG.isCanvasDisabled !== 'undefined') {
            if (afint) clearInterval(afint);
            afint = setInterval(() => {
                if (typeof window.SF_CONFIG.isCanvasDisabled !== 'undefined') {
                    let cv = findCanvasToggle();
                    if (cv) syncCanvasToggle(cv);
                }
                if (window.SF_CONFIG.closeNowPlay) {
                    closeNowPlay();
                }
                if (window.SF_CONFIG.takeControl) {
                    let ft = document.querySelector('aside div.encore-bright-accent-set button');
                    if (ft) {
                        ft.click();
                        setTimeout(() => {
                            let cb = document.querySelector('aside ul[role=list] li[role=listitem] div[role=button]');
                            if (cb) cb.click();
                        }, 500);
                    }
                }
                if (window.SF_CONFIG.autoPlayMode === "permanent") {
                    if ('pBtn' in window && !reqPause && !ulFlag && !window.playing) {
                        window.pBtn.click();
                    }
                }
            }, 5000);
        }
    };

    window.addAndAuto = function(once = false) {
        const run = () => {
            let pBtn = document.querySelector('button[data-testid=control-button-playpause]') || window.pBtn;
            if (pBtn) {
                let isCurrentlyPlaying = (pBtn.querySelector('path')?.getAttribute('d')?.match(/z/gi) || []).length >= 2;
                if (typeof window.playing === 'boolean' && window.playing !== isCurrentlyPlaying) {
                    manageAll(isCurrentlyPlaying);
                }
            }

            let ta = document.querySelector('a[data-testid=context-item-link]') || document.querySelector('[data-testid*="now-playing-widget"] a');
            if (ta) {
                window.track = ta.innerText;
            } else {
                window.track = null;
            }
            
            let aa = document.querySelector('[data-testid*="byline"]') || document.querySelector('a[data-testid=context-item-info-artist]') || document.querySelector('a[data-testid=context-item-info-show]');
            if (aa) {
                window.artist = aa.innerText;
            } else {
                window.artist = '';
            }
            
            let rr = document.querySelector('button[data-testid=control-button-repeat]');
            if (rr) {
                window.repmode = rr.getAttribute('aria-checked');
            } else {
                window.repmode = 'false';
            }
            
            window.syncShuffleState = function() {
                let sh = getShuffleButton();

                if (sh) {
                    let html = sh.innerHTML || "";
                    let checked = sh.getAttribute('aria-checked') || sh.getAttribute('aria-pressed');
                    let isActive = checked === 'true' || checked === 'mixed' || sh.classList.contains('encore-internal-color-text-bright-accent');
                    let isSmartPath = html.includes('4.502') || html.includes('M4.502') || html.includes('sparkle') || checked === 'mixed';

                    if (!isActive) {
                        window.shmode = 'false';
                    } else if (isSmartPath) {
                        window.shmode = 'mixed';
                    } else {
                        window.shmode = 'true';
                    }
                } else {
                    window.shmode = 'false';
                }
            };

            let sh = getShuffleButton();
            if (sh && !sh.classList.contains('sf-click-bind')) {
                sh.classList.add('sf-click-bind');
                sh.addEventListener('click', () => {
                    setTimeout(() => {
                        if (typeof window.syncShuffleState === 'function') window.syncShuffleState();
                        if (typeof updMedia === 'function') updMedia(true);
                    }, 150);
                });
            }

            window.syncShuffleState();
            
            let fb = document.querySelector('[data-testid*="now-playing-widget"]>div:last-child>button');
            if (fb && fb.getAttribute('aria-checked') === 'true') {
                window.isfav = true;
            } else {
                window.isfav = false;
            }
            
            let rg = document.querySelector('div[data-testid=playback-progressbar] input[type=range]');
            if (rg) {
                window.duration = parseInt(rg.getAttribute('max'));
                window.position = parseInt(rg.getAttribute('value'));
            } else {
                window.duration = null;
                window.position = null;
            }
            
            let im = document.querySelector('img[data-testid=cover-art-image]');
            if (im) {
                window.cover = im.src;
            } else {
                window.cover = null;
            }
            
            if (document.body.classList.contains('sf-expanded')) {
                let candidates = Array.from(document.querySelectorAll('div[style*="--cinema-mode-bg-color-from"]'));
                let cs = candidates.find(el => el.offsetParent !== null || el.getClientRects().length > 0) || candidates[candidates.length - 1];
                if (cs) {
                    ['--cinema-mode-bg-color-from', '--cinema-mode-bg-color-to', '--background-base'].forEach(v => {
                        let val = cs.style.getPropertyValue(v).trim();
                        if (val) document.body.style.setProperty(v, val);
                    });
                }
            }
            updMedia(once);
        };
        
        if (once) {
            run();
            return;
        }
        if (aaint) clearInterval(aaint);
        aaint = setInterval(run, 1000);
    };

    window.addCSSJSHack = function() {
        let meta = document.querySelector('meta[name="viewport"]');
        let isBigWindow = window.SF_CONFIG && window.SF_CONFIG.guiMode === "bigwindow";
        let isLandscape = window.matchMedia("(orientation: landscape)").matches;
        
        let content = "width=device-width, initial-scale=1.0, viewport-fit=cover";
        if (isBigWindow && isLandscape) {
            let screenW = 0;
            if (window.SF_CONFIG && typeof window.SF_CONFIG.screenWidth === 'number' && typeof window.SF_CONFIG.screenHeight === 'number') {
                screenW = Math.max(window.SF_CONFIG.screenWidth, window.SF_CONFIG.screenHeight);
            }
            if (!screenW && window.screen) {
                screenW = Math.max(window.screen.width || 0, window.screen.height || 0);
            }
            if (screenW > 0) {
                let scale = screenW / 1280;
                content = `width=1280, initial-scale=${scale.toFixed(3)}, minimum-scale=${scale.toFixed(3)}, maximum-scale=${scale.toFixed(3)}, user-scalable=no, viewport-fit=cover`;
            } else {
                content = "width=1280, user-scalable=no, viewport-fit=cover";
            }

            // Ensure text-size-adjust is fixed and prevent container overflow flickering
            let bwStyle = document.getElementById('sf-bigwindow-base');
            if (!bwStyle) {
                bwStyle = document.createElement('style');
                bwStyle.id = 'sf-bigwindow-base';
                bwStyle.textContent = `
                    html, body, .Root__top-container, div[data-testid="root"] {
                        overflow-x: hidden !important;
                        max-width: 100vw !important;
                        -webkit-text-size-adjust: 100% !important;
                        text-size-adjust: 100% !important;
                    }
                    #Desktop_PanelContainer_Id,
                    aside[data-testid="now-playing-view"],
                    aside[data-testid="right-sidebar"] {
                        contain: paint layout !important;
                        will-change: width, transform;
                        transform: translateZ(0);
                        backface-visibility: hidden;
                    }
                `;
                (document.head || document.documentElement).appendChild(bwStyle);
            }
        }

        if (meta) {
            if (isBigWindow && isLandscape) {
                if (meta.getAttribute('content') !== content) {
                    meta.setAttribute('content', content);
                }
            } else {
                let current = meta.getAttribute('content') || "";
                if (!current.includes('viewport-fit=cover')) {
                    meta.setAttribute('content', current + ', viewport-fit=cover');
                }
            }
        } else {
            meta = document.createElement('meta');
            meta.name = "viewport";
            meta.content = content;
            document.head.appendChild(meta);
        }

        if (!window._sfResizeListenerAttached) {
            window._sfResizeListenerAttached = true;
            let lastW = window.innerWidth;
            let lastH = window.innerHeight;
            window.addEventListener('resize', (e) => {
                // Ignore synthetic resize events dispatched by web scripts (e.g. Spotify sidebar/panel toggles)
                if (e && e.isTrusted === false) return;
                // Only re-apply if actual window viewport dimensions changed (e.g. device rotation, multi-window resize)
                if (window.innerWidth === lastW && window.innerHeight === lastH) return;
                lastW = window.innerWidth;
                lastH = window.innerHeight;
                if (window.addCSSJSHack) window.addCSSJSHack();
            });
        }

        let existingVal = parseInt(document.documentElement.style.getPropertyValue('--sf-safe-area-top')) || 0;
        let sbHeight = existingVal;
        if (window.SF_CONFIG && !window.SF_CONFIG.hideStatusBar) {
            sbHeight = window.SF_CONFIG.statusBarHeight || existingVal || 0;
        }
        if (sbHeight > 0) {
            document.documentElement.style.setProperty('--sf-safe-area-top', sbHeight + 'px');
        }

        if (window.SF_CONFIG.guiMode === "csshack") {
            const checkExpanded = () => {
                let minBtn = document.querySelector(
                    'button[aria-label*="Minimize"]:not(#Desktop_LeftSidebar_Id *):not(.YourLibraryX *):not([aria-label*="Library"]), ' +
                    'button[aria-label*="Back to player"]'
                );
                let isVis = !!(minBtn && (minBtn.offsetParent !== null || minBtn.offsetWidth > 0));
                if (isVis !== window.sf_is_expanded) {
                    window.sf_is_expanded = isVis;
                    AndBridge.setExpanded(isVis);
                }
                if (isVis) {
                    document.body.classList.add('sf-expanded');
                    // Instant color extraction to prevent flash of fallback colors
                    let candidates = Array.from(document.querySelectorAll('div[style*="--cinema-mode-bg-color-from"]'));
                    let cs = candidates.find(el => el.offsetParent !== null || el.getClientRects().length > 0) || candidates[candidates.length - 1];
                    if (cs) {
                        ['--cinema-mode-bg-color-from', '--cinema-mode-bg-color-to', '--background-base'].forEach(v => {
                            let val = cs.style.getPropertyValue(v).trim();
                            if (val) document.body.style.setProperty(v, val);
                        });
                    }
                } else {
                    document.body.classList.remove('sf-expanded');
                    [
                        '--background-base',
                        '--background-highlight',
                        '--background-press',
                        '--cinema-mode-bg-color-from',
                        '--cinema-mode-bg-color-to'
                    ].forEach(v => {
                        document.body.style.removeProperty(v);
                    });
                }
            };

            if (window._sfExpandedObserver) window._sfExpandedObserver.disconnect();
            let obsTimer = null;
            window._sfExpandedObserver = new MutationObserver(() => {
                if (obsTimer) return;
                obsTimer = requestAnimationFrame(() => {
                    checkExpanded();
                    obsTimer = null;
                });
            });
            window._sfExpandedObserver.observe(document.body, { childList: true, subtree: true });
            checkExpanded();

            if (cssint) clearInterval(cssint);
            cssint = setInterval(function() {
                // Sidebar button setup
                if (!window.SF_CONFIG?.dockLeftSidebar) {
                    let lb = document.querySelector('#Desktop_LeftSidebar_Id header>div>div:first-child button:not(.fuckd)');
                    if (lb) {
                        window.lBtn = lb;
                        lb.classList.add('fuckd', 'lbtn');
                        lb.style.padding = '0px';
                        lb.style.height = '20px';
                        lb.addEventListener('click', function() {
                            setTimeout(() => switchLs(), 0);
                        });
                        switchLs();
                        AndBridge.cssInjected();
                    }

                    // Sidebar items setup
                    let lbit = document.querySelector('#Desktop_LeftSidebar_Id div[role=grid]:not(.fuckd)');
                    if (lbit) {
                        lbit.classList.add('fuckd');
                        lbit.addEventListener('click', () => {
                            setTimeout(() => {
                                window.lBtn.click();
                                closeNowPlay();
                            }, 0);
                        });
                    }
                }

                // Home button setup
                let hb = document.querySelector('#global-nav-bar button[data-testid=home-button]:not(.fuckd)');
                if (hb) {
                    hb.classList.add('fuckd');
                    hb.addEventListener('click', () => {
                        closeNowPlay();
                    });
                }

                // Search bar setup
                let sr = document.querySelector('input[data-testid=search-input]:not(.fuckd)');
                if (sr) {
                    sr.classList.add('fuckd');
                    let isTapping = false;
                    const sb = sr.closest('form')?.querySelector('button[data-testid="search-icon"]');
                    
                    if (sb) {
                        sb.addEventListener('mousedown', () => {
                            isTapping = true;
                        });
                        sb.addEventListener('touchstart', () => {
                            isTapping = true;
                        }, {passive:true});
                        sb.addEventListener('click', () => {
                            const isPort = window.matchMedia("(orientation: portrait)").matches;
                            const isExpanded = sr.getAttribute('aria-expanded') === 'true' || sr.offsetWidth > 60;
                            if (isPort) {
                                if (isExpanded) {
                                    if (sr.value !== '') {
                                        const val = sr.value;
                                        sr.value = '';
                                        setTimeout(() => {
                                            sr.value = val;
                                        }, 150);
                                    }
                                } else {
                                    setTimeout(() => {
                                        sr.focus();
                                    }, 50);
                                }
                            }
                        });
                    }
                    
                    sr.addEventListener('focus', () => {
                        isTapping = false;
                        document.body.classList.add('sf-search-focused');
                        AndBridge.setSearchActive(true);
                    });
                    
                    sr.addEventListener('blur', () => {
                        const isPort = window.matchMedia("(orientation: portrait)").matches;
                        const isExpanded = sr.getAttribute('aria-expanded') === 'true';
                        const fromDropdown = window._sfBlurFromDropdown === true;
                        // Consume the flag regardless
                        if (window._sfBlurFromDropdown === true) window._sfBlurFromDropdown = false;
                        document.body.classList.remove('sf-search-focused');
                        AndBridge.setSearchActive(false);
                        if (fromDropdown) {
                            // User tapped a play button inside the dropdown.
                            // Don't collapse immediately — the dropdown is still in the DOM.
                            // gobserver will watch for its removal and collapse then.
                            window._sfBlurFromDropdown = 'pending';
                            // Safety net: Spotify sometimes keeps the dropdown open after play.
                            // Synthesize a mousedown outside the form — this triggers both our
                            // dismissSearch (which debounces+collapses the bar) AND Spotify's
                            // own outside-click handler (which closes the dropdown).
                            setTimeout(() => {
                                if (window._sfBlurFromDropdown === 'pending') {
                                    window._sfBlurFromDropdown = false;
                                    document.body.dispatchEvent(new MouseEvent('mousedown', {
                                        bubbles: true, cancelable: false, view: window
                                    }));
                                }
                            }, 1000);
                        } else if (isPort && !isTapping && sb) {
                            setTimeout(() => {
                                const isExpandedNow = sr.getAttribute('aria-expanded') === 'true' || sr.offsetWidth > 60;
                                if (isExpandedNow) {
                                    const val = sr.value;
                                    if (val === '') {
                                        sb.click();
                                    } else {
                                        sr.value = '';
                                        sb.click();
                                        sr.value = val;
                                    }
                                }
                            }, 150);
                        }
                        setTimeout(() => {
                            isTapping = false;
                        }, 600);
                    });
                }

                // Backup check for player expand/minimize status
                checkExpanded();

                // User profile button setup
                let ub = document.querySelector('button[data-testid=user-widget-link]:not(.fuckd)');
                if (ub) {
                    ub.classList.add('fuckd');
                    ub.addEventListener('click', () => {
                        closeNowPlay();
                    });
                }
            }, 6000);

            // Library sidebar toggler helper
            window.switchLs = function() {
                let ls = document.querySelector('#Desktop_LeftSidebar_Id');
                if (ls) {
                    let navDiv = ls.querySelector('nav>div>div:first-child');
                    if (!navDiv) return;
                    let exp = navDiv.classList.length;
                    if (exp == 2) {
                        ls.style.setProperty('position', 'fixed', 'important');
                        ls.style.setProperty('width', '100%', 'important');
                        ls.style.setProperty('height', 'calc(100vh - 48px - var(--sf-safe-area-top, env(safe-area-inset-top)))', 'important');
                        ls.style.setProperty('top', 'calc(48px + var(--sf-safe-area-top, env(safe-area-inset-top)))', 'important');
                        ls.style.setProperty('bottom', '0px', 'important');
                        ls.style.setProperty('left', '0px', 'important');
                        ls.style.setProperty('overflow-y', 'auto', 'important');
                        ls.style.setProperty('z-index', 'calc(var(--above-everything-grid-area-z-index) + 5)', 'important');
                        let lh = ls.querySelector('header>div>div:first-child h1');
                        if (lh) lh.innerHTML = '✖ &nbsp; ' + (window.SF_CONFIG?.closeLibText || "Library");
                    } else {
                        ls.style.setProperty('z-index', '1', 'important');
                        ls.style.setProperty('position', 'fixed', 'important');
                        ls.style.setProperty('top', 'var(--sf-safe-area-top, env(safe-area-inset-top))', 'important');
                        ls.style.setProperty('left', '60px', 'important');
                        ls.style.setProperty('width', '48px', 'important');
                        ls.style.setProperty('height', '48px', 'important');
                        ls.style.removeProperty('bottom');
                        ls.style.removeProperty('overflow-y');
                    }
                }
            };
        }
    };

    // =========================================================================
    // SECTION 4: LIBRARY & FOLDER RESOLUTION
    // =========================================================================

    async function ensureAuthToken() {
        if (!window.spotAuthToken) {
            try {
                window.spotAuthToken = localStorage.getItem('spot_auth_token') || null;
                window.spotCliToken = localStorage.getItem('spot_cli_token') || null;
                window.spotDevId = localStorage.getItem('spot_dev_id') || localStorage.getItem('spot_device_id') || null;
            } catch (_) {}
        }
        if (window.spotAuthToken) return true;
        // Passive check: wait up to 3 seconds for Spotify's native Web Player fetch interceptor or localStorage to capture headers
        let attempts = 0;
        while (!window.spotAuthToken && attempts < 30) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
            if (!window.spotAuthToken) {
                try {
                    window.spotAuthToken = localStorage.getItem('spot_auth_token') || null;
                    window.spotCliToken = localStorage.getItem('spot_cli_token') || null;
                    window.spotDevId = localStorage.getItem('spot_dev_id') || localStorage.getItem('spot_device_id') || null;
                } catch (_) {}
            }
        }
        return !!window.spotAuthToken;
    }
    window.ensureAuthToken = ensureAuthToken;

    function getGqlHash(opName, fallbackHash) {
        if (window.spHashes && window.spHashes[opName]) return window.spHashes[opName];
        try {
            const stored = localStorage.getItem('sp_hash_' + opName);
            if (stored) return stored;
        } catch(_) {}
        return fallbackHash;
    }
    window.getGqlHash = getGqlHash;

    window.pendingMediaRequests = window.pendingMediaRequests || new Set();
    let isFetchingLib = false;
    async function checkMediaLib(force = false) {
        if (isFetchingLib && !force) return;
        await ensureAuthToken();
        if (!window.spotAuthToken) {
            console.warn("[Spotifuck] checkMediaLib: Auth token unavailable.");
            return;
        }
        isFetchingLib = true;
        try {
            const allItems = await fetchAllLibrary();
            window.mediaLib = parseLibrary(allItems);
            console.log("[Spotifuck] checkMediaLib: Successfully loaded mediaLib! Draining pending requests:", Array.from(window.pendingMediaRequests));
            if (window.pendingMediaRequests && window.pendingMediaRequests.size > 0) {
                for (const reqId of window.pendingMediaRequests) {
                    const items = window.mediaLib?.[reqId] || [];
                    AndBridge.onMediaItemsLoaded(reqId, JSON.stringify(items));
                }
                window.pendingMediaRequests.clear();
            }
        } catch (e) {
            console.error("Error fetching/parsing media library: ", e);
        } finally {
            isFetchingLib = false;
        }
    }
    window.checkMediaLib = checkMediaLib;

    async function fetchAllLibrary() {
        if (!window.spotAuthToken || !window.spotAuthToken.startsWith('Bearer ')) {
            console.warn("[Spotifuck] fetchAllLibrary: Authorization token not ready.");
            return [];
        }
        const limit = 50;
        let offset = 0;
        let allItems = [];
        let hasMore = true;
        
        while (hasMore && offset < 1000) {
            const headers = {
                'Authorization': window.spotAuthToken,
                'Content-Type': 'application/json;charset=UTF-8',
                'app-platform': 'WebPlayer',
                'spotify-app-version': '1.2.40.0'
            };
            if (window.spotCliToken) {
                headers['Client-Token'] = window.spotCliToken;
            }
            const activeHash = getGqlHash('libraryV3', '0082bf82412db50128add72dbdb73e2961d59100b9cbf41fb25c568bd8bc358b');
            const resp = await oriFetch('https://api-partner.spotify.com/pathfinder/v2/query', {
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
                headers: headers,
                body: JSON.stringify({
                    variables: {
                        filters: [],
                        order: null,
                        textFilter: '',
                        features: ['LIKED_SONGS', 'YOUR_EPISODES_V2', 'PRERELEASES', 'EVENTS'],
                        limit: limit,
                        offset: offset,
                        flatten: false,
                        expandedFolders: [],
                        folderUri: null,
                        includeFoldersWhenFlattening: true
                    },
                    operationName: 'libraryV3',
                    extensions: {
                        persistedQuery: {
                            version: 1,
                            sha256Hash: activeHash
                        }
                    }
                })
            });
            
            if (!resp.ok) {
                console.error("Pathfinder query failed: ", resp.statusText);
                break;
            }
            
            const data = await resp.json();
            const items = data?.data?.me?.libraryV3?.items || [];
            allItems = allItems.concat(items);
            
            if (items.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        }
        return allItems;
    }
    window.fetchAllLibrary = fetchAllLibrary;

    function parseLibrary(items) {
        const res = { playlists: [], albums: [], artists: [], podcasts: [] };
        if (!Array.isArray(items)) return res;
        
        items.forEach((elem) => {
            const data = elem?.item?.data || elem?.data || elem?.item || elem;
            if (!data) return;
            const typename = data.__typename || data.type || '';
            const uri = data.uri || data._uri || (data.id ? 'spotify:' + typename.toLowerCase() + ':' + data.id : '') || '';
            const name = data.name || data.title || data.profile?.name || 'Unknown';
            const image = data.images?.items?.[0]?.sources?.[0]?.url || data.images?.[0]?.url || data.coverArt?.sources?.[0]?.url || data.visuals?.avatarImage?.sources?.[0]?.url || null;

            if (!uri) return;

            if (typename.includes('Playlist') || uri.includes(':playlist:')) {
                const isLiked = name === 'Liked Songs' || uri.includes('collection');
                if (isLiked) {
                    if (res.playlists.some(p => p.name === 'Liked Songs' || p.id.includes('collection'))) return;
                } else if (res.playlists.some(p => p.id === uri)) {
                    return;
                }
                res.playlists.push({
                    id: isLiked ? 'spotify:collection:tracks' : uri,
                    name: name,
                    image: isLiked ? 'https://misc.scdn.co/liked-songs/liked-songs-640.png' : image,
                    browsable: true
                });
            } else if (typename.includes('Album') || uri.includes(':album:')) {
                res.albums.push({
                    id: uri,
                    name: name,
                    image: image,
                    artists: data.artists?.items?.map(a => a.profile?.name).filter(Boolean) || [],
                    browsable: true
                });
            } else if (typename.includes('Artist') || uri.includes(':artist:')) {
                res.artists.push({
                    id: uri,
                    name: name,
                    image: image,
                    browsable: true
                });
            } else if (typename.includes('Podcast') || typename.includes('Show') || uri.includes(':show:')) {
                res.podcasts.push({
                    id: uri,
                    name: name,
                    image: image,
                    artists: data.publisher?.name ? [data.publisher.name] : [],
                    browsable: true
                });
            }
        });
        console.log(`[Spotifuck] parseLibrary parsed ${res.playlists.length} playlists, ${res.albums.length} albums, ${res.artists.length} artists, ${res.podcasts.length} podcasts`);
        return res;
    }
    window.parseLibrary = parseLibrary;

    // =========================================================================
    // SECTION 5: ASYNCHRONOUS MEDIA BROWSER & SEARCH
    // =========================================================================

    async function fetchMediaItems(parentId) {
        try {
            await ensureAuthToken();
            // 1. Root categories (playlists, albums, artists, podcasts)
            if (parentId === 'playlists' || parentId === 'albums' || parentId === 'artists' || parentId === 'podcasts') {
                if (!window.mediaLib || !window.mediaLib[parentId]?.length) {
                    window.pendingMediaRequests.add(parentId);
                    await checkMediaLib();
                }
                if (window.mediaLib && window.mediaLib[parentId]) {
                    window.pendingMediaRequests.delete(parentId);
                    const items = window.mediaLib[parentId].map(item => {
                        let img = item.image;
                        if (item.name === 'Liked Songs' || (item.id && (item.id.includes('collection') || item.id === 'spotify:playlist:liked'))) {
                            img = 'https://misc.scdn.co/liked-songs/liked-songs-640.png';
                        }
                        return { ...item, image: img, isGrid: true };
                    });
                    AndBridge.onMediaItemsLoaded(parentId, JSON.stringify(items));
                    return;
                }
                console.log("[Spotifuck] fetchMediaItems: mediaLib not ready yet for " + parentId + ". Queued in pendingMediaRequests.");
                return;
            }

        window.likedSongsCache = window.likedSongsCache || null;

        async function getLikedSongsTracks() {
            if (window.likedSongsCache && window.likedSongsCache.length > 0) {
                return window.likedSongsCache;
            }

            const activeHash = getGqlHash('fetchLibraryTracks', '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240');

            try {
                console.log("[Spotifuck] Fetching Liked Songs via fetchLibraryTracks GQL (hash: " + activeHash.substring(0, 8) + ")...");
                await ensureAuthToken();
                const headers = {
                    'Authorization': window.spotAuthToken,
                    'Content-Type': 'application/json;charset=UTF-8',
                    'app-platform': 'WebPlayer',
                    'spotify-app-version': '1.2.40.0'
                };
                if (window.spotCliToken) {
                    headers['Client-Token'] = window.spotCliToken;
                }
                const resp = await oriFetch('https://api-partner.spotify.com/pathfinder/v2/query', {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'include',
                    headers: headers,
                    body: JSON.stringify({
                        variables: {
                            offset: 0,
                            limit: 50
                        },
                        operationName: 'fetchLibraryTracks',
                        extensions: {
                            persistedQuery: {
                                version: 1,
                                sha256Hash: activeHash
                            }
                        }
                    })
                });
                console.log("[Spotifuck] fetchLibraryTracks status:", resp.status);
                if (resp.ok) {
                    const data = await resp.json();
                    const tracksData = data?.data?.me?.library?.tracks || data?.data?.me?.libraryV3 || data?.data?.libraryTracks || data?.data;
                    const items = tracksData?.items || [];
                    const tracks = items.map(elem => {
                        const trackWrapper = elem?.track || elem?.itemV2 || elem;
                        const trackData = trackWrapper?.data || trackWrapper;
                        if (!trackData) return null;
                        const uri = trackWrapper?._uri || trackWrapper?.uri || trackData?.uri || (trackData?.id ? 'spotify:track:' + trackData.id : '') || "";
                        if (!uri || !uri.includes(':track:')) return null;
                        const artists = trackData.artists?.items?.map(a => a.profile?.name || a.name).filter(Boolean) || trackData.artists?.map(a => a.name).filter(Boolean) || [];
                        const albumData = trackData.albumOfTrack || trackData.album || {};
                        const coverUrl = albumData.coverArt?.sources?.[0]?.url || albumData.images?.[0]?.url || null;
                        return {
                            id: uri,
                            name: trackData.name || trackData.title || "Unknown Track",
                            image: coverUrl,
                            artists: artists,
                            browsable: false
                        };
                    }).filter(Boolean);
                    console.log(`[Spotifuck] fetchLibraryTracks parsed ${tracks.length} Liked Songs tracks!`);
                    if (tracks.length > 0) {
                        window.likedSongsCache = tracks;
                        return tracks;
                    }
                }
            } catch (e) {
                console.error("[Spotifuck] fetchLibraryTracks fetch failed:", e);
            }

            return window.likedSongsCache || [];
        }

        // 2. Liked Songs
        if (parentId === 'spotify:collection:tracks' || parentId.endsWith(':collection') || parentId.startsWith('spotify:collection')) {
            console.log("[Spotifuck] Liked Songs requested for parentId:", parentId);
            const tracks = await getLikedSongsTracks();
            console.log(`[Spotifuck] Returning ${tracks.length} Liked Songs tracks to Android Auto for ${parentId}`);
            AndBridge.onMediaItemsLoaded(parentId, JSON.stringify(tracks));
            return;
        }

            // 3. Specific Playlist tracks (using GQL fetchPlaylist)
            if (parentId.startsWith('spotify:playlist:') || (parentId.includes(':user:') && parentId.includes(':playlist:'))) {
                const resp = await oriFetch('https://api-partner.spotify.com/pathfinder/v2/query', {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'include',
                    headers: {
                        'Authorization': window.spotAuthToken,
                        'Client-Token': window.spotCliToken,
                        'Content-Type': 'application/json;charset=UTF-8',
                        'app-platform': 'WebPlayer',
                        'spotify-app-version': '1.2.40.0'
                    },
                    body: JSON.stringify({
                        variables: {
                            uri: parentId,
                            offset: 0,
                            limit: 100,
                            enableWatchFeedEntrypoint: false
                        },
                        operationName: 'fetchPlaylist',
                        extensions: {
                            persistedQuery: {
                                version: 1,
                                sha256Hash: getGqlHash('fetchPlaylist', '346811f856fb0b7e4f6c59f8ebea78dd081c6e2fb01b77c954b26259d5fc6763')
                            }
                        }
                    })
                });
                if (!resp.ok) throw new Error("Failed to fetch playlist tracks GQL: " + resp.statusText);
                const data = await resp.json();
                const playlistObj = data?.data?.playlistV2 || data?.data?.playlist || data?.data?.playlistUnion || data?.data?.me?.library || data?.data?.me;
                const content = playlistObj?.content || playlistObj?.tracks || playlistObj;
                const items = content?.items || playlistObj?.items || [];
                const tracks = items.map(elem => {
                    const itemV2 = elem?.itemV2 || elem?.item;
                    const trackData = itemV2?.data || elem?.track || itemV2 || elem;
                    if (!trackData) return null;
                    const uri = trackData.uri || trackData._uri || elem?.uri || (trackData.id ? 'spotify:track:' + trackData.id : '') || "";
                    if (!uri || !uri.includes(':track:')) return null;
                    const artists = trackData.artists?.items?.map(a => a.profile?.name || a.name).filter(Boolean) || trackData.artists?.map(a => a.name).filter(Boolean) || [];
                    const albumData = trackData.albumOfTrack || trackData.album || {};
                    const coverUrl = albumData.coverArt?.sources?.[0]?.url || albumData.images?.[0]?.url || null;
                    return {
                        id: uri,
                        name: trackData.name || trackData.title || "Unknown Track",
                        image: coverUrl,
                        artists: artists,
                        browsable: false
                    };
                }).filter(Boolean);
                console.log(`[Spotifuck] fetchPlaylist parsed ${tracks.length} tracks for ${parentId}`);
                AndBridge.onMediaItemsLoaded(parentId, JSON.stringify(tracks));
                return;
            }

            // 3. Specific Album tracks (using GQL getAlbum)
            if (parentId.startsWith('spotify:album:')) {
                const albumId = parentId.split(':')[2];
                const resp = await oriFetch('https://api-partner.spotify.com/pathfinder/v2/query', {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'include',
                    headers: {
                        'Authorization': window.spotAuthToken,
                        'Client-Token': window.spotCliToken,
                        'Content-Type': 'application/json;charset=UTF-8',
                        'app-platform': 'WebPlayer',
                        'spotify-app-version': '1.2.40.0'
                    },
                    body: JSON.stringify({
                        variables: {
                            uri: `spotify:album:${albumId}`,
                            locale: "",
                            offset: 0,
                            limit: 100
                        },
                        operationName: 'getAlbum',
                        extensions: {
                            persistedQuery: {
                                version: 1,
                                sha256Hash: getGqlHash('getAlbum', 'b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10')
                            }
                        }
                    })
                });
                if (!resp.ok) throw new Error("Failed to fetch album GQL: " + resp.statusText);
                const data = await resp.json();
                const albumData = data?.data?.albumUnion || data?.data?.album || data?.data?.albumV2;
                const albumCover = albumData?.coverArt?.sources?.[0]?.url || albumData?.images?.[0]?.url || null;
                const items = albumData?.tracksV2?.items || albumData?.tracks?.items || albumData?.tracks || [];
                const tracks = items.map(elem => {
                    const trackObj = elem?.track || elem?.item?.data || elem;
                    if (!trackObj) return null;
                    const uri = trackObj.uri || trackObj._uri || (trackObj.id ? 'spotify:track:' + trackObj.id : '') || "";
                    if (!uri) return null;
                    const artists = trackObj.artists?.items?.map(a => a.profile?.name || a.name).filter(Boolean) || trackObj.artists?.map(a => a.name).filter(Boolean) || [];
                    return {
                        id: uri,
                        name: trackObj.name || trackObj.title || "Unknown Track",
                        image: albumCover,
                        artists: artists,
                        browsable: false
                    };
                }).filter(Boolean);
                console.log(`[Spotifuck] getAlbum parsed ${tracks.length} tracks for ${parentId}`);
                AndBridge.onMediaItemsLoaded(parentId, JSON.stringify(tracks));
                return;
            }

            // 4. Specific Artist (fetch their top tracks using GQL queryArtistOverview)
            if (parentId.startsWith('spotify:artist:')) {
                const artistId = parentId.split(':')[2];
                const resp = await oriFetch('https://api-partner.spotify.com/pathfinder/v2/query', {
                    method: 'POST',
                    mode: 'cors',
                    credentials: 'include',
                    headers: {
                        'Authorization': window.spotAuthToken,
                        'Client-Token': window.spotCliToken,
                        'Content-Type': 'application/json;charset=UTF-8',
                        'app-platform': 'WebPlayer',
                        'spotify-app-version': '1.2.40.0'
                    },
                    body: JSON.stringify({
                        variables: {
                            uri: `spotify:artist:${artistId}`,
                            locale: ""
                        },
                        operationName: 'queryArtistOverview',
                        extensions: {
                            persistedQuery: {
                                version: 1,
                                sha256Hash: getGqlHash('queryArtistOverview', '5b9e64f43843fa3a9b6a98543600299b0a2cbbbccfdcdcef2402eb9c1017ca4c')
                            }
                        }
                    })
                });
                if (!resp.ok) throw new Error("Failed to fetch artist top tracks GQL: " + resp.statusText);
                const data = await resp.json();
                const artistData = data?.data?.artistUnion || data?.data?.artist;
                const items = artistData?.discography?.topTracks?.items || artistData?.topTracks?.items || artistData?.topTracks || [];
                const tracks = items.map(elem => {
                    const trackObj = elem?.track || elem?.item?.data || elem;
                    if (!trackObj) return null;
                    const uri = trackObj.uri || trackObj._uri || (trackObj.id ? 'spotify:track:' + trackObj.id : '') || "";
                    if (!uri) return null;
                    const artists = trackObj.artists?.items?.map(a => a.profile?.name || a.name).filter(Boolean) || [];
                    const albumData = trackObj.albumOfTrack || trackObj.album || {};
                    const coverUrl = albumData.coverArt?.sources?.[0]?.url || albumData.images?.[0]?.url || null;
                    return {
                        id: uri,
                        name: trackObj.name || trackObj.title || "Unknown Track",
                        image: coverUrl,
                        artists: artists,
                        browsable: false
                    };
                }).filter(Boolean);
                console.log(`[Spotifuck] queryArtistOverview parsed ${tracks.length} tracks for ${parentId}`);
                AndBridge.onMediaItemsLoaded(parentId, JSON.stringify(tracks));
                return;
            }

            // 5. Specific Podcast (fetch show episodes)
            if (parentId.startsWith('spotify:show:')) {
                const showId = parentId.split(':')[2];
                const resp = await fetch(`https://api.spotify.com/v1/shows/${showId}/episodes?limit=50`, {
                    headers: { 
                        'Authorization': window.spotAuthToken,
                        'Client-Token': window.spotCliToken,
                        'app-platform': 'WebPlayer'
                    }
                });
                if (!resp.ok) throw new Error("Failed to fetch show episodes");
                const data = await resp.json();
                const episodes = (data.items || []).map(e => {
                    const uri = e.uri || e._uri || (e.id ? 'spotify:episode:' + e.id : '') || "";
                    return {
                        id: uri,
                        name: e.name,
                        image: e.images?.[0]?.url || null,
                        browsable: false
                    };
                });
                AndBridge.onMediaItemsLoaded(parentId, JSON.stringify(episodes));
                return;
            }

            // Fallback for unknown categories
            AndBridge.onMediaItemsLoaded(parentId, "[]");
        } catch (e) {
            console.error("Error loading media items for " + parentId, e);
            AndBridge.onMediaItemsLoaded(parentId, "[]");
        }
    }
    window.fetchMediaItems = fetchMediaItems;

    async function searchMediaItems(query) {
        try {
            await ensureAuthToken();
            const token = window.spotAuthToken || (function() { try { return localStorage.getItem('spot_auth_token'); } catch(_) { return null; } })();
            const cliTok = window.spotCliToken || (function() { try { return localStorage.getItem('spot_cli_token'); } catch(_) { return null; } })();
            if (!token) {
                console.warn("[Spotifuck] searchMediaItems: Auth token unavailable.");
                AndBridge.onSearchCompleted(query, "[]");
                return;
            }
            const headers = {
                'Authorization': token,
                'Content-Type': 'application/json;charset=UTF-8',
                'app-platform': 'WebPlayer',
                'spotify-app-version': '1.2.40.0'
            };
            if (cliTok) {
                headers['Client-Token'] = cliTok;
            }
            const resp = await oriFetch('https://api-partner.spotify.com/pathfinder/v2/query', {
                method: 'POST',
                mode: 'cors',
                credentials: 'include',
                headers: headers,
                body: JSON.stringify({
                    variables: {
                        searchTerm: query,
                        offset: 0,
                        limit: 30,
                        numberOfTopResults: 5,
                        includeAudiobooks: false,
                        includeArtistHasConcertsField: false,
                        includePreReleases: false,
                        includeLocalConcertsField: false,
                        includeAuthors: false
                    },
                    operationName: 'searchDesktop',
                    extensions: {
                        persistedQuery: {
                            version: 1,
                            sha256Hash: getGqlHash('searchDesktop', '4801118d4a100f756e833d33984436a3899cff359c532f8fd3aaf174b60b3b49')
                        }
                    }
                })
            });
            if (!resp.ok) throw new Error("Failed to search GQL: " + resp.statusText);
            const data = await resp.json();
            const searchData = data?.data?.searchV2 || data?.data?.search;
            const results = [];
            const seenUris = new Set();

            const pushItem = (item) => {
                if (!item || !item.id || seenUris.has(item.id)) return;
                seenUris.add(item.id);
                results.push(item);
            };

            // 1. Top Result (Spotify's best direct match - Song, Artist, Album, etc.)
            const topResults = searchData?.topResultsV2?.items || searchData?.topResults?.items || [];
            topResults.forEach(elem => {
                const itemWrapper = elem?.item || elem;
                const data = itemWrapper?.data || itemWrapper;
                if (!data) return;
                const typeName = data.__typename || '';
                const uri = itemWrapper.uri || data.uri || (data.id ? 'spotify:' + (typeName.toLowerCase().replace('responsewrapper', '') || 'track') + ':' + data.id : '') || "";
                if (!uri) return;

                let type = 'Song';
                let isBrowsable = false;
                let artistsList = [];
                let img = null;

                if (uri.includes(':track:')) {
                    type = 'Song';
                    isBrowsable = false;
                    artistsList = data.artists?.items?.map(a => a.profile?.name || a.name).filter(Boolean) || data.artists?.map(a => a.name).filter(Boolean) || [];
                    const albumData = data.albumOfTrack || data.album || {};
                    img = albumData.coverArt?.sources?.[0]?.url || albumData.images?.[0]?.url || null;
                } else if (uri.includes(':artist:')) {
                    type = 'Artist';
                    isBrowsable = true;
                    img = data.visuals?.avatarImage?.sources?.[0]?.url || data.images?.[0]?.url || null;
                } else if (uri.includes(':album:')) {
                    type = 'Album';
                    isBrowsable = true;
                    artistsList = data.artists?.items?.map(a => a.profile?.name || a.name).filter(Boolean) || [];
                    img = data.coverArt?.sources?.[0]?.url || data.images?.[0]?.url || null;
                } else if (uri.includes(':playlist:')) {
                    type = 'Playlist';
                    isBrowsable = true;
                    const owner = data.ownerV2?.data?.name || data.owner?.name || "";
                    if (owner) artistsList = [owner];
                    img = data.images?.items?.[0]?.sources?.[0]?.url || data.images?.[0]?.url || null;
                }

                pushItem({
                    id: uri,
                    name: data.name || data.title || "Top Result",
                    image: img,
                    type: type,
                    artists: artistsList,
                    browsable: isBrowsable
                });
            });

            // Extract all category pools
            const rawSongs = [];
            (searchData?.tracksV2?.items || searchData?.tracks?.items || []).forEach(elem => {
                const itemWrapper = elem?.item || elem;
                const data = itemWrapper?.data || itemWrapper;
                if (!data) return;
                const uri = itemWrapper.uri || data.uri || (data.id ? 'spotify:track:' + data.id : '') || "";
                if (!uri || !uri.includes(':track:')) return;
                const artistsList = data.artists?.items?.map(a => a.profile?.name || a.name).filter(Boolean) || data.artists?.map(a => a.name).filter(Boolean) || [];
                const albumData = data.albumOfTrack || data.album || {};
                const coverUrl = albumData.coverArt?.sources?.[0]?.url || albumData.images?.[0]?.url || null;
                rawSongs.push({
                    id: uri,
                    name: data.name || data.title || "Track",
                    image: coverUrl,
                    type: 'Song',
                    artists: artistsList,
                    browsable: false
                });
            });

            const rawAlbums = [];
            (searchData?.albumsV2?.items || searchData?.albums?.items || []).forEach(elem => {
                const item = elem?.data || elem;
                if (!item) return;
                const uri = item.uri || (item.id ? 'spotify:album:' + item.id : '');
                if (!uri) return;
                const name = item.name || "Album";
                const img = item.coverArt?.sources?.[0]?.url || item.images?.[0]?.url || null;
                const artists = item.artists?.items?.map(a => a.profile?.name || a.name).filter(Boolean) || [];
                rawAlbums.push({
                    id: uri,
                    name: name,
                    image: img,
                    type: 'Album',
                    artists: artists,
                    browsable: true
                });
            });

            const rawPlaylists = [];
            (searchData?.playlists?.items || []).forEach(elem => {
                const item = elem?.data || elem;
                if (!item) return;
                const uri = item.uri || (item.id ? 'spotify:playlist:' + item.id : '');
                if (!uri) return;
                const name = item.name || item.title || "Playlist";
                const img = item.images?.items?.[0]?.sources?.[0]?.url || item.images?.[0]?.url || null;
                const owner = item.ownerV2?.data?.name || item.owner?.name || "";
                rawPlaylists.push({
                    id: uri,
                    name: name,
                    image: img,
                    type: 'Playlist',
                    artists: owner ? [owner] : [],
                    browsable: true
                });
            });

            const rawArtists = [];
            (searchData?.artists?.items || []).forEach(elem => {
                const item = elem?.data || elem;
                if (!item) return;
                const uri = item.uri || (item.id ? 'spotify:artist:' + item.id : '');
                if (!uri) return;
                const name = item.profile?.name || item.name || "Artist";
                const img = item.visuals?.avatarImage?.sources?.[0]?.url || item.images?.[0]?.url || null;
                rawArtists.push({
                    id: uri,
                    name: name,
                    image: img,
                    type: 'Artist',
                    artists: [],
                    browsable: true
                });
            });

            // 2. Interleave: Top 4 Songs -> Top 3 Albums -> Top 3 Playlists -> Top 2 Artists -> Remaining
            rawSongs.slice(0, 4).forEach(pushItem);
            rawAlbums.slice(0, 3).forEach(pushItem);
            rawPlaylists.slice(0, 3).forEach(pushItem);
            rawArtists.slice(0, 2).forEach(pushItem);

            // 3. Append remaining results
            rawSongs.slice(4).forEach(pushItem);
            rawAlbums.slice(3).forEach(pushItem);
            rawPlaylists.slice(3).forEach(pushItem);
            rawArtists.slice(2).forEach(pushItem);
            console.log(`[Spotifuck] Search parsed ${results.length} ordered results (Top -> Songs -> Albums -> Playlists -> Artists) for "${query}"`);
            AndBridge.onSearchCompleted(query, JSON.stringify(results));
        } catch (e) {
            console.error("Error searching for " + query, e);
            AndBridge.onSearchCompleted(query, "[]");
        }
    }
    window.searchMediaItems = searchMediaItems;

    firstFuck();
})();
