/**
 * SpotiTV Virtual Cursor Engine for Android TV Remotes
 *
 * Provides a smooth, accelerated on-screen mouse cursor controlled via D-pad.
 * Supports:
 * - Fluid pointer physics with acceleration
 * - Edge auto-scrolling on whichever container is under the cursor
 * - Realistic PointerEvent / MouseEvent dispatch for clicks and hover effects
 * - Modal / history back handling
 */
(function() {
    'use strict';

    if (window.__spotitv_cursor_initialized) return;
    window.__spotitv_cursor_initialized = true;

    // Viewport dimensions
    let width = window.innerWidth || 1280;
    let height = window.innerHeight || 720;
    window.addEventListener('resize', function() {
        width = window.innerWidth || 1280;
        height = window.innerHeight || 720;
    });

    // Cursor position (default center screen)
    let x = Math.round(width / 2);
    let y = Math.round(height / 2);

    // Direction state
    const keys = { up: false, down: false, left: false, right: false };
    const keyTimes = { up: 0, down: 0, left: 0, right: 0 };

    // Movement settings
    const INITIAL_STEP = 22;   // px instant jump on single tap
    const HOLD_DELAY = 140;    // ms before continuous glide starts
    const BASE_SPEED = 10;     // px per frame initial glide
    const MAX_SPEED = 28;      // px per frame max glide
    const ACCEL_TIME = 350;    // ms to reach max speed
    const SCROLL_SPEED = 18;   // px per frame edge scroll
    const SCROLL_MARGIN_V = 65;// px from top/bottom edge to trigger scroll
    const SCROLL_MARGIN_H = 40;// px from left/right edge to trigger scroll

    let animFrame = null;
    let lastHoverEl = null;

    // -------------------------------------------------------------------------
    // Create Visual Cursor
    // -------------------------------------------------------------------------
    let cursor = document.getElementById('spotitv-cursor');
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'spotitv-cursor';
        cursor.innerHTML = `
            <svg viewBox="0 0 24 24" width="28" height="28" style="overflow:visible;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.85)) drop-shadow(0 0 2px rgba(0,0,0,0.9));">
                <path d="M3 2 L3 20 L8 15 L13 22 L16 20 L11 13 L18 13 Z" fill="#ffffff" stroke="#121212" stroke-width="1.5" stroke-linejoin="round"/>
                <circle cx="3" cy="2" r="2.2" fill="#1ed760"/>
            </svg>
            <div id="spotitv-cursor-ripple" style="
                position: absolute;
                top: 2px;
                left: 3px;
                width: 24px;
                height: 24px;
                margin-top: -12px;
                margin-left: -12px;
                border-radius: 50%;
                border: 2px solid #1ed760;
                opacity: 0;
                transform: scale(0.5);
                pointer-events: none;
                transition: transform 0.25s ease-out, opacity 0.25s ease-out;
            "></div>
        `;
        cursor.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 28px;
            height: 28px;
            pointer-events: none;
            z-index: 2147483647;
            transform: translate3d(${x - 3}px, ${y - 2}px, 0);
            will-change: transform;
            transition: transform 0.03s linear;
        `;
        (document.body || document.documentElement).appendChild(cursor);
    }

    const ripple = document.getElementById('spotitv-cursor-ripple');

    function updateCursorTransform() {
        if (cursor) {
            cursor.style.transform = `translate3d(${x - 3}px, ${y - 2}px, 0)`;
        }
    }

    // -------------------------------------------------------------------------
    // Scroll Container Finder
    // -------------------------------------------------------------------------
    function findScrollable(xPos, yPos) {
        let el = document.elementFromPoint(xPos, yPos);
        while (el && el !== document.body && el !== document.documentElement) {
            const style = window.getComputedStyle(el);
            const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && (el.scrollHeight > el.clientHeight + 10);
            const canScrollX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && (el.scrollWidth > el.clientWidth + 10);
            if (canScrollY || canScrollX) return el;
            el = el.parentElement;
        }
        // Spotify fallbacks
        return document.querySelector('[data-overlayscrollbars-viewport]') ||
               document.querySelector('main') ||
               window;
    }

    // -------------------------------------------------------------------------
    // Physics & Animation Loop
    // -------------------------------------------------------------------------
    function getSpeed(dir) {
        if (!keys[dir]) return 0;
        const elapsed = performance.now() - (keyTimes[dir] || performance.now());
        if (elapsed < HOLD_DELAY) return 0;
        const progress = Math.min(1, (elapsed - HOLD_DELAY) / ACCEL_TIME);
        return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * progress;
    }

    function step() {
        const anyActive = keys.up || keys.down || keys.left || keys.right;
        if (!anyActive) {
            animFrame = null;
            return;
        }

        let dx = 0;
        let dy = 0;

        if (keys.left) dx -= getSpeed('left');
        if (keys.right) dx += getSpeed('right');
        if (keys.up) dy -= getSpeed('up');
        if (keys.down) dy += getSpeed('down');

        // Normalize diagonal speed
        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        x = Math.max(2, Math.min(width - 5, x + dx));
        y = Math.max(2, Math.min(height - 5, y + dy));

        updateCursorTransform();

        // Edge Auto-Scrolling
        const scroller = findScrollable(x, y);
        if (scroller) {
            if (keys.up && y <= SCROLL_MARGIN_V) {
                if (typeof scroller.scrollBy === 'function') {
                    scroller.scrollBy(0, -SCROLL_SPEED);
                } else if (scroller && 'scrollTop' in scroller) {
                    scroller.scrollTop = Math.max(0, (scroller.scrollTop || 0) - SCROLL_SPEED);
                }
            } else if (keys.down && y >= height - SCROLL_MARGIN_V) {
                if (typeof scroller.scrollBy === 'function') {
                    scroller.scrollBy(0, SCROLL_SPEED);
                } else if (scroller && 'scrollTop' in scroller) {
                    scroller.scrollTop = (scroller.scrollTop || 0) + SCROLL_SPEED;
                }
            }

            if (keys.left && x <= SCROLL_MARGIN_H) {
                if (typeof scroller.scrollBy === 'function') {
                    scroller.scrollBy(-SCROLL_SPEED, 0);
                }
            } else if (keys.right && x >= width - SCROLL_MARGIN_H) {
                if (typeof scroller.scrollBy === 'function') {
                    scroller.scrollBy(SCROLL_SPEED, 0);
                }
            }
        }

        // Hover Simulation
        triggerHover(x, y);

        animFrame = requestAnimationFrame(step);
    }
    function triggerHover(px, py) {
        const currentHoverEl = document.elementFromPoint(px, py);
        if (currentHoverEl && currentHoverEl !== lastHoverEl) {
            if (lastHoverEl) {
                lastHoverEl.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window, clientX: px, clientY: py }));
                lastHoverEl.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, cancelable: true, view: window, clientX: px, clientY: py }));
            }
            currentHoverEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window, clientX: px, clientY: py }));
            currentHoverEl.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true, view: window, clientX: px, clientY: py }));
            lastHoverEl = currentHoverEl;
        }
        if (currentHoverEl) {
            currentHoverEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, view: window, clientX: px, clientY: py }));
        }
    }

    function startLoop() {
        if (!animFrame) {
            animFrame = requestAnimationFrame(step);
        }
    }

    // -------------------------------------------------------------------------
    // Click Simulation
    // -------------------------------------------------------------------------
    function animateClick() {
        if (!ripple) return;
        ripple.style.transition = 'none';
        ripple.style.transform = 'scale(0.3)';
        ripple.style.opacity = '1';
        ripple.offsetHeight; // trigger reflow
        ripple.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
        ripple.style.transform = 'scale(1.8)';
        ripple.style.opacity = '0';
    }

    function simulateClick() {
        animateClick();

        const target = document.elementFromPoint(x, y);
        if (!target) return;

        // Focus input if clicked
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            target.focus();
        }

        const eventInit = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons: 1
        };

        target.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        target.dispatchEvent(new MouseEvent('mousedown', eventInit));

        if (typeof target.focus === 'function') {
            try { target.focus(); } catch (_) {}
        }

        eventInit.buttons = 0;
        target.dispatchEvent(new PointerEvent('pointerup', eventInit));
        target.dispatchEvent(new MouseEvent('mouseup', eventInit));
        target.dispatchEvent(new MouseEvent('click', eventInit));

        // In case an inner SVG / span was hit, ensure parent button / link is also clicked
        const clickable = target.closest('button, a, [role="button"], [role="link"], [data-testid]');
        if (clickable && clickable !== target) {
            try { clickable.click(); } catch (_) {}
        }
    }

    // -------------------------------------------------------------------------
    // Back Button Handler
    // -------------------------------------------------------------------------
    window.__spotitv_back = function() {
        // If an input is focused, blur it first
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            document.activeElement.blur();
            return true;
        }

        // Close any visible modal / dialog
        const closeBtn = document.querySelector('[data-testid="modal-close-button"], [aria-label="Close"], [aria-label="Back"]');
        if (closeBtn && closeBtn.offsetParent !== null) {
            closeBtn.click();
            return true;
        }

        // Navigate history back
        if (window.location.pathname !== '/' && window.location.pathname !== '') {
            window.history.back();
            return true;
        }
        if (window.history.length > 1) {
            window.history.back();
            return true;
        }
        return false;
    };

    // -------------------------------------------------------------------------
    // Public Cursor API (invoked from MainActivity.kt)
    // -------------------------------------------------------------------------
    window.__spotitv_cursor = {
        keyDown: function(dir) {
            if (!keys[dir]) {
                keys[dir] = true;
                keyTimes[dir] = performance.now();
                let dx = 0, dy = 0;
                if (dir === 'left') dx = -INITIAL_STEP;
                if (dir === 'right') dx = INITIAL_STEP;
                if (dir === 'up') dy = -INITIAL_STEP;
                if (dir === 'down') dy = INITIAL_STEP;
                x = Math.max(2, Math.min(width - 5, x + dx));
                y = Math.max(2, Math.min(height - 5, y + dy));
                updateCursorTransform();
                triggerHover(x, y);
                startLoop();
            }
        },
        keyUp: function(dir) {
            keys[dir] = false;
        },
        click: function() {
            simulateClick();
        },
        getPos: function() {
            return { x, y };
        }
    };

    // -------------------------------------------------------------------------
    // Fallback: Listen for browser keyboard events directly
    // -------------------------------------------------------------------------
    const keyMap = {
        'ArrowUp': 'up',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'ArrowRight': 'right'
    };

    window.addEventListener('keydown', function(e) {
        const dir = keyMap[e.key];
        if (dir) {
            e.preventDefault();
            e.stopPropagation();
            window.__spotitv_cursor.keyDown(dir);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            window.__spotitv_cursor.click();
        }
    }, true);

    window.addEventListener('keyup', function(e) {
        const dir = keyMap[e.key];
        if (dir) {
            e.preventDefault();
            e.stopPropagation();
            window.__spotitv_cursor.keyUp(dir);
        }
    }, true);

})();
