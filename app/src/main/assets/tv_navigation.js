/**
 * SpotiTV Smart TV Spatial Navigation Engine
 * Provides 2D Euclidean directional navigation, container auto-scrolling,
 * compound card selection, and activation for D-pad remotes.
 */
(function() {
    'use strict';

    if (window.__spotitv_spatial_nav) return;
    window.__spotitv_spatial_nav = true;
    if (document.body) document.body.classList.add('sf-tv-nav');
    // --- Helpers: Geometry & Visibility ---
    function getRect(el) {
        return el.getBoundingClientRect();
    }

    function isVisible(el, r) {
        if (!r) r = getRect(el);
        if (r.width < 10 || r.height < 10) return false;
        if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        return true;
    }

    // --- Zone Classification ---
    function getZone(el) {
        if (!el || el === document.body) return 'main';
        if (el.closest('#Desktop_LeftSidebar_Id, [data-testid="left-sidebar"], nav')) return 'sidebar';
        if (el.closest('#global-nav-bar')) return 'top';
        if (el.closest('[data-testid="now-playing-bar"], aside, footer')) return 'bottom';
        if (el.closest('.main-view-container__scroll-node, main')) return 'main';
        if (el.closest('header')) return 'top';
        return 'main';
    }

    // --- Scroll Containers ---
    function getMainScroller() {
        return document.querySelector('.main-view-container__scroll-node > div') ||
               document.querySelector('[data-overlayscrollbars-viewport]') ||
               Array.from(document.querySelectorAll('*')).find(el => {
                   const s = window.getComputedStyle(el);
                   return (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 50;
               });
    }

    function getHorizontalScroller(el) {
        let p = el ? el.parentElement : null;
        while (p && p !== document.body) {
            const s = window.getComputedStyle(p);
            if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 20) {
                return p;
            }
            p = p.parentElement;
        }
        return null;
    }

    // --- Candidate Discovery ---
    function getCandidates() {
        const selectors = [
            // Top Bar
            '#global-nav-bar button',
            '#global-nav-bar a[href]',
            '#global-nav-bar input',
            'header button',
            'header a[href]',
            // Left Sidebar
            '#Desktop_LeftSidebar_Id button',
            '#Desktop_LeftSidebar_Id a[href]',
            '#Desktop_LeftSidebar_Id [role="listitem"]',
            'nav[aria-label="Main"] a',
            'nav[aria-label="Main"] button',
            // Main Content: Compound Cards (treat as single unit)
            '[data-encore-id="card"]',
            '.Card',
            '[data-carousel-gridlist-item="true"]',
            // Main Content: Track rows
            'main div[role="row"][aria-rowindex]',
            // Filter pills / Chips / Buttons in main
            'main button[data-encore-id="chip"]',
            'main button[data-encore-id="buttonPrimary"]',
            'main button[data-encore-id="buttonSecondary"]',
            'main button:not([tabindex="-1"])',
            'main a[href]:not([tabindex="-1"])',
            // Bottom Playback Bar
            '[data-testid="now-playing-bar"] button',
            '[data-testid="now-playing-bar"] a[href]',
            '[data-testid="now-playing-bar"] [role="slider"]'
        ];

        const nodes = document.querySelectorAll(selectors.join(','));
        const candidates = [];
        const seen = new Set();

        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];

            // Don't treat inner elements of a card or track row as separate stops!
            const parentCard = el.closest('[data-encore-id="card"], .Card, [data-carousel-gridlist-item="true"]');
            if (parentCard && parentCard !== el) continue;

            const parentRow = el.closest('main div[role="row"][aria-rowindex]');
            if (parentRow && parentRow !== el) continue;

            if (seen.has(el)) continue;
            seen.add(el);

            const r = getRect(el);
            if (isVisible(el, r)) {
                if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
                candidates.push({ el, rect: r, zone: getZone(el) });
            }
        }

        return candidates;
    }

    // --- Directional Candidate Selection ---
    function findBestCandidate(currentEl, direction, candidates) {
        // Direct recovery if focus is lost or on document.body
        if (!currentEl || currentEl === document.body) {
            if (direction === 'up') {
                const top = candidates.find(c => c.zone === 'top');
                if (top) return top.el;
            } else if (direction === 'left') {
                const side = candidates.find(c => c.zone === 'sidebar');
                if (side) return side.el;
            }
            const mainFirst = candidates.find(c => c.zone === 'main' && isVisible(c.el, c.rect));
            if (mainFirst) return mainFirst.el;
            return candidates[0] ? candidates[0].el : null;
        }

        const curRect = getRect(currentEl);
        const curZone = getZone(currentEl);
        const curCenterX = (curRect.left + curRect.right) / 2;
        const curCenterY = (curRect.top + curRect.bottom) / 2;

        // Prefer candidates in the same zone first
        const sameZoneCandidates = candidates.filter(c => c.zone === curZone);
        const pool = sameZoneCandidates.length > 0 ? sameZoneCandidates : candidates;

        function evaluatePool(items) {
            let found = null;
            let minScore = Infinity;

            for (const item of items) {
                if (item.el === currentEl) continue;
                if (currentEl !== document.body && (currentEl.contains(item.el) || item.el.contains(currentEl))) continue;

                const r = item.rect;
                const candCenterX = (r.left + r.right) / 2;
                const candCenterY = (r.top + r.bottom) / 2;

                let inDirection = false;
                let primaryDist = 0;
                let secondaryDist = 0;

                switch (direction) {
                    case 'down':
                        if (r.top >= curRect.top + 6 || candCenterY > curCenterY + 10) {
                            inDirection = true;
                            primaryDist = Math.max(0, r.top - curRect.bottom);
                            secondaryDist = Math.abs(candCenterX - curCenterX);
                            // Collinear overlap bonus:
                            if (r.left < curRect.right && r.right > curRect.left) {
                                secondaryDist *= 0.25;
                            }
                        }
                        break;
                    case 'up':
                        if (r.bottom <= curRect.bottom - 6 || candCenterY < curCenterY - 10) {
                            inDirection = true;
                            primaryDist = Math.max(0, curRect.top - r.bottom);
                            secondaryDist = Math.abs(candCenterX - curCenterX);
                            if (r.left < curRect.right && r.right > curRect.left) {
                                secondaryDist *= 0.25;
                            }
                        }
                        break;
                    case 'right':
                        if (r.left >= curRect.left + 6 || candCenterX > curCenterX + 10) {
                            inDirection = true;
                            primaryDist = Math.max(0, r.left - curRect.right);
                            secondaryDist = Math.abs(candCenterY - curCenterY);
                            if (r.top < curRect.bottom && r.bottom > curRect.top) {
                                secondaryDist *= 0.25;
                            }
                        }
                        break;
                    case 'left':
                        if (r.right <= curRect.right - 6 || candCenterX < curCenterX - 10) {
                            inDirection = true;
                            primaryDist = Math.max(0, curRect.left - r.right);
                            secondaryDist = Math.abs(candCenterY - curCenterY);
                            if (r.top < curRect.bottom && r.bottom > curRect.top) {
                                secondaryDist *= 0.25;
                            }
                        }
                        break;
                }

                if (!inDirection) continue;

                const score = (primaryDist * 1.0) + (secondaryDist * 2.5);
                if (score < minScore) {
                    minScore = score;
                    found = item.el;
                }
            }
            return { found, minScore };
        }

        const sameResult = evaluatePool(pool);
        if (sameResult.found) {
            return sameResult.found;
        }

        // If no candidate in same zone, search across all candidates
        if (pool !== candidates) {
            const allResult = evaluatePool(candidates);
            if (allResult.found) return allResult.found;
        }

        return null;
    }

    // --- Focus Execution ---
    function focusElement(el) {
        if (!el) return;
        el.focus({ preventScroll: true });
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

        document.querySelectorAll('.sf-tv-active-focus').forEach(e => e.classList.remove('sf-tv-active-focus'));
        el.classList.add('sf-tv-active-focus');
    }

    // --- Element Activation ---
    function activateElement(el) {
        if (!el) return;
        if (el.tagName === 'INPUT') {
            el.focus();
            return;
        }

        // Visual press effect
        el.classList.add('sf-tv-pressed');
        setTimeout(() => el.classList.remove('sf-tv-pressed'), 140);

        let target = el;
        // If compound card, find primary link or play button
        const link = el.querySelector('a[href]');
        const playBtn = el.querySelector('button[aria-label*="Play" i], button[data-testid="play-button"]');
        const clickDiv = el.querySelector('.e-101040-card__on-click, [role="button"]');

        if (link) {
            target = link;
        } else if (playBtn) {
            target = playBtn;
        } else if (clickDiv) {
            target = clickDiv;
        }

        const opts = { bubbles: true, cancelable: true, view: window };
        target.dispatchEvent(new PointerEvent('pointerdown', opts));
        target.dispatchEvent(new MouseEvent('mousedown', opts));
        target.dispatchEvent(new PointerEvent('pointerup', opts));
        target.dispatchEvent(new MouseEvent('mouseup', opts));
        target.click();
    }

    // --- Main Navigation Dispatcher ---
    function handleNavigation(direction) {
        const current = document.activeElement;
        const curZone = getZone(current);
        const candidates = getCandidates();

        const next = findBestCandidate(current, direction, candidates);
        if (next) {
            focusElement(next);
            return true;
        }

        // Handle Horizontal Carousel Scrolling
        if (direction === 'right' || direction === 'left') {
            const hScroller = getHorizontalScroller(current);
            if (hScroller) {
                const delta = direction === 'right' ? 260 : -260;
                hScroller.scrollBy({ left: delta, behavior: 'smooth' });
                setTimeout(() => {
                    const fresh = getCandidates();
                    const cand = findBestCandidate(document.activeElement, direction, fresh);
                    if (cand) focusElement(cand);
                }, 120);
                return true;
            }
        }

        // Handle Vertical Main View Scrolling
        const vScroller = getMainScroller();
        if (vScroller && curZone === 'main') {
            if (direction === 'down' && vScroller.scrollTop < vScroller.scrollHeight - vScroller.clientHeight - 10) {
                vScroller.scrollBy({ top: 320, behavior: 'smooth' });
                setTimeout(() => {
                    const fresh = getCandidates();
                    const cand = findBestCandidate(document.activeElement, 'down', fresh);
                    if (cand) focusElement(cand);
                }, 140);
                return true;
            } else if (direction === 'up' && vScroller.scrollTop > 10) {
                vScroller.scrollBy({ top: -320, behavior: 'smooth' });
                setTimeout(() => {
                    const fresh = getCandidates();
                    const cand = findBestCandidate(document.activeElement, 'up', fresh);
                    if (cand) focusElement(cand);
                }, 140);
                return true;
            }
        }

        // Cross-Zone Transitions
        if (direction === 'left' && curZone === 'main') {
            const sidebarItem = document.querySelector('#Desktop_LeftSidebar_Id button, nav[aria-label="Main"] a, #Desktop_LeftSidebar_Id a');
            if (sidebarItem) { focusElement(sidebarItem); return true; }
        } else if (direction === 'right' && curZone === 'sidebar') {
            const mainItem = document.querySelector('main [data-encore-id="card"], main div[role="row"], main button');
            if (mainItem) { focusElement(mainItem); return true; }
        } else if (direction === 'up' && curZone === 'main') {
            const topItem = document.querySelector('#global-nav-bar a[href="/"], #global-nav-bar input, #global-nav-bar button');
            if (topItem) { focusElement(topItem); return true; }
        } else if (direction === 'down' && curZone === 'top') {
            const mainItem = document.querySelector('main [data-encore-id="card"], main div[role="row"], main button');
            if (mainItem) { focusElement(mainItem); return true; }
        } else if (direction === 'down' && curZone === 'main') {
            const bottomItem = document.querySelector('[data-testid="now-playing-bar"] button, aside button');
            if (bottomItem) { focusElement(bottomItem); return true; }
        } else if (direction === 'up' && curZone === 'bottom') {
            const mainItem = document.querySelector('main [data-encore-id="card"], main div[role="row"], main button');
            if (mainItem) { focusElement(mainItem); return true; }
        }

        return false;
    }

    // Expose directly for Android native remote bridge
    window.__spotitv_nav = function(dir) {
        return handleNavigation(dir);
    };
    window.__spotitv_activate = function() {
        activateElement(document.activeElement);
    };
    window.__spotitv_back = function() {
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            document.activeElement.blur();
            return true;
        }
        const closeBtn = document.querySelector('[data-testid="modal-close-button"], [aria-label="Close"]');
        if (closeBtn) {
            closeBtn.click();
            return true;
        }
        if (window.location.pathname !== '/' && window.location.pathname !== '') {
            const topBack = document.querySelector('button[aria-label="Go back"], button[data-testid="top-bar-back-button"]');
            if (topBack && !topBack.disabled) {
                topBack.click();
                return true;
            }
            if (window.history.length > 1) {
                window.history.back();
                return true;
            }
            window.location.href = '/';
            return true;
        }
        return false;
    };
    // --- Key Event Interception (Capture Phase) ---
    window.addEventListener('keydown', function(e) {
        const keyMap = {
            37: 'left', 38: 'up', 39: 'right', 40: 'down',
            'ArrowLeft': 'left', 'ArrowUp': 'up', 'ArrowRight': 'right', 'ArrowDown': 'down'
        };

        const dir = keyMap[e.keyCode] || keyMap[e.key];
        if (dir) {
            // Text cursor support inside inputs
            if (document.activeElement && document.activeElement.tagName === 'INPUT' && (dir === 'left' || dir === 'right')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            handleNavigation(dir);
            return;
        }

        // Enter / DPAD_CENTER
        if (e.keyCode === 13 || e.key === 'Enter') {
            if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            activateElement(document.activeElement);
            return;
        }
    }, true);

    // Auto-focus default on load or route changes
    function ensureInitialFocus() {
        if (!document.activeElement || document.activeElement === document.body) {
            const primary = document.querySelector('main [data-encore-id="card"], main button[data-encore-id="buttonPrimary"], header a[href="/"]');
            if (primary) focusElement(primary);
        }
    }

    let lastUrl = window.location.href;
    setInterval(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            setTimeout(ensureInitialFocus, 400);
        }
    }, 500);

    setTimeout(ensureInitialFocus, 600);
})();
