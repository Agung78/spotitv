(function() {
    if (window.sfPlaylistSort) {
        if (typeof window.sfPlaylistSort.refresh === 'function') window.sfPlaylistSort.refresh();
        return;
    }

    var LS_KEY_PREFIX = 'spotiduck_playlist_sort_';
    var RELOAD_KEY = 'spotiduck_sort_reload';
    var MAX_LIMIT = 1000;
    var TTL = 60000;
    var STYLE_ID = 'spotiduck-sort-style';

    var held = {};
    var sortedHits = {};
    var qcCache = null;
    var attachTimer = null;

    var SORT_MENU_ITEMS = [
        { id: 'CUSTOM', label: 'Custom order' },
        { id: 'TITLE', label: 'Title' },
        { id: 'ARTIST', label: 'Artist' },
        { id: 'ALBUM', label: 'Album' },
        { id: 'ADDED_AT', label: 'Recently added' },
        { id: 'RELEASE_DATE', label: 'Release date' },
        { id: 'DURATION', label: 'Duration' }
    ];

    function currentUri() {
        var m = location.pathname.match(/(?:^|\/)(playlist|album)\/([A-Za-z0-9]+)/);
        if (m) return 'spotify:' + m[1] + ':' + m[2];
        return null;
    }

    function albumPage() {
        return /(?:^|\/)album\//.test(location.pathname);
    }

    function getSortState(uri) {
        if (!uri) uri = currentUri();
        if (!uri) return null;
        try {
            var raw = localStorage.getItem(LS_KEY_PREFIX + uri);
            if (raw) {
                var s = JSON.parse(raw);
                if (s && s.field && s.field !== 'CUSTOM' && (s.order === 'ASC' || s.order === 'DESC')) {
                    return s;
                }
            }
        } catch(e) {}
        return null; // Default is always null (Custom order / Spotify default)
    }

    function saveSortState(uri, state) {
        if (!uri) uri = currentUri();
        if (!uri) return;
        try {
            if (state && state.field && state.field !== 'CUSTOM') {
                localStorage.setItem(LS_KEY_PREFIX + uri, JSON.stringify(state));
            } else {
                localStorage.removeItem(LS_KEY_PREFIX + uri);
            }
        } catch(e) {}
    }

    function sortKey(state) {
        return (state && state.field && state.field !== 'CUSTOM') ? state.field + ':' + state.order : 'CUSTOM';
    }

    function getArtistName(d, t) {
        try {
            var arts = (d && d.artists && d.artists.items) || (t && t.artists && t.artists.items) || [];
            if (Array.isArray(arts)) {
                var names = arts.map(function(a) {
                    return (a && a.profile && a.profile.name) || (a && a.name) || '';
                }).filter(Boolean);
                if (names.length) return names.join(', ');
            }
        } catch(e) {}
        return null;
    }

    function valueOf(item, field) {
        if (albumPage()) {
            var t = item && item.track;
            if (!t) return null;
            switch (field) {
                case 'TITLE': return t.name || null;
                case 'ARTIST': return getArtistName(null, t);
                case 'ALBUM': return (t.album && t.album.name) || null;
                case 'DURATION': return (t.duration && t.duration.totalMilliseconds) || 0;
            }
            return null;
        }

        var d = item && item.itemV2 ? item.itemV2.data : null;
        if (!d) return null;
        switch (field) {
            case 'TITLE': return d.name || null;
            case 'ARTIST': return getArtistName(d, null);
            case 'ALBUM': return (d.albumOfTrack && d.albumOfTrack.name) || null;
            case 'DURATION': return (d.trackDuration && d.trackDuration.totalMilliseconds) || 0;
            case 'RELEASE_DATE': return (d.albumOfTrack && d.albumOfTrack.date && d.albumOfTrack.date.isoString) || null;
            case 'ADDED_AT': return (item.addedAt && item.addedAt.isoString) || null;
        }
        return null;
    }

    function sortItems(items, state) {
        if (!state || !state.field || state.field === 'CUSTOM') return items;
        var field = state.field;
        var dir = state.order === 'DESC' ? -1 : 1;
        return items.slice().sort(function(a, b) {
            var x = valueOf(a, field), y = valueOf(b, field);
            if (x === null && y === null) return 0;
            if (x === null) return 1;
            if (y === null) return -1;
            if (typeof x === 'string' || typeof y === 'string') {
                return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }) * dir;
            }
            if (x === y) return 0;
            return (x < y ? -1 : 1) * dir;
        });
    }

    function readItems(j) {
        try { return j.data.playlistV2.content.items || null; } catch(e) {}
        try { return j.data.albumUnion.tracksV2.items || null; } catch(e) {}
        return null;
    }

    function readTotal(j, fallback) {
        try {
            var t = j.data.playlistV2.content.totalCount;
            if (typeof t === 'number') return t;
        } catch(e) {}
        try {
            var a = j.data.albumUnion.tracksV2.totalCount;
            if (typeof a === 'number') return a;
        } catch(e) {}
        return fallback;
    }

    function rebuild(j, items) {
        var out = j;
        try {
            if (j.data.playlistV2) {
                var content = Object.assign({}, j.data.playlistV2.content, { items: items });
                var pv2 = Object.assign({}, j.data.playlistV2, { content: content });
                out = Object.assign({}, j, { data: Object.assign({}, j.data, { playlistV2: pv2 }) });
            } else if (j.data.albumUnion) {
                var tv2 = Object.assign({}, j.data.albumUnion.tracksV2, { items: items });
                var au = Object.assign({}, j.data.albumUnion, { tracksV2: tv2 });
                out = Object.assign({}, j, { data: Object.assign({}, j.data, { albumUnion: au }) });
            }
        } catch(e) {}
        var headers = null;
        try {
            headers = new Headers();
            headers.set('content-type', 'application/json');
        } catch(e) { headers = null; }
        return new Response(JSON.stringify(out), { status: 200, statusText: 'OK', headers: headers });
    }

    // Traverse React Fiber to locate React Query's QueryClient
    function findQueryClient() {
        if (qcCache) return qcCache;
        var el = document.querySelector('[data-testid="playlist-tracklist"]') || document.body;
        if (!el) return null;
        var keys = Object.keys(el), fkey = null;
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf('__reactFiber$') === 0) { fkey = keys[i]; break; }
        }
        if (!fkey) return null;
        var fiber = el[fkey];
        while (fiber && fiber.return) fiber = fiber.return;
        if (!fiber) return null;
        var stack = [fiber], seen = [], guard = 0;
        while (stack.length && guard++ < 60000) {
            var node = stack.pop();
            if (!node || seen.indexOf(node) !== -1) continue;
            seen.push(node);
            var props = node.memoizedProps;
            if (props && props.value
                && typeof props.value.getQueryData === 'function'
                && typeof props.value.invalidateQueries === 'function') {
                qcCache = props.value;
                return qcCache;
            }
            if (node.child) stack.push(node.child);
            if (node.sibling) stack.push(node.sibling);
        }
        return null;
    }

    function apply() {
        var uri = currentUri();
        if (!uri) return false;
        if (albumPage()) return false;
        held[uri] = null;
        var qc = findQueryClient();
        if (!qc || typeof qc.getQueryCache !== 'function') return false;
        var all = [];
        try { all = qc.getQueryCache().getAll() || []; } catch(e) { return false; }
        var hit = false;
        for (var i = 0; i < all.length; i++) {
            var q = all[i];
            if (!q || !q.queryKey) continue;
            var str;
            try { str = JSON.stringify(q.queryKey); } catch(e) { continue; }
            if (str.indexOf(uri) === -1) continue;
            try { qc.invalidateQueries({ queryKey: q.queryKey }); hit = true; } catch(e) {}
        }
        return hit;
    }

    function albumReload(uri) {
        var key = sortKey(getSortState(uri));
        var n = 0;
        try { n = parseInt(sessionStorage.getItem(RELOAD_KEY + ':' + key) || '0', 10) || 0; } catch(e) {}
        if (n >= 2) return;
        try { sessionStorage.setItem(RELOAD_KEY + ':' + key, String(n + 1)); } catch(e) {}
        setTimeout(function() { try { location.reload(); } catch(e) {} }, 200);
    }

    function afterSortChange(uri) {
        updateSortButtonUI();
        if (!albumPage()) { apply(); return; }
        albumReload(uri);
    }

    function setSort(field, order) {
        var uri = currentUri();
        if (!uri) return;
        if (!field || field === 'CUSTOM') {
            saveSortState(uri, null);
        } else {
            saveSortState(uri, { field: field, order: order === 'DESC' ? 'DESC' : 'ASC' });
        }
        afterSortChange(uri);
    }

    function clearSort() {
        var uri = currentUri();
        if (!uri) return;
        saveSortState(uri, null);
        afterSortChange(uri);
    }

    function toggleField(field) {
        var uri = currentUri();
        if (!uri) return;
        if (!field || field === 'CUSTOM') {
            clearSort();
            return;
        }
        var cur = getSortState(uri);
        if (cur && cur.field === field) {
            setSort(field, cur.order === 'ASC' ? 'DESC' : 'ASC');
            return;
        }
        var defOrder = (field === 'ADDED_AT') ? 'DESC' : 'ASC';
        setSort(field, defOrder);
    }

    var SHORT_LABELS = {
        'CUSTOM': '',
        'TITLE': 'Title',
        'ARTIST': 'Artist',
        'ALBUM': 'Album',
        'ADDED_AT': 'Recent',
        'RELEASE_DATE': 'Release',
        'DURATION': 'Duration'
    };

    // =========================================================================
    // SECTION 2: UI (DEDICATED "SORT" / "CUSTOM ORDER" BUTTON BESIDE LIST)
    // =========================================================================

    function injectStyle() {
        var s = document.getElementById(STYLE_ID);
        if (!s) {
            s = document.createElement('style');
            s.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(s);
        }
        s.textContent =
            '#sf-album-toolbar{' +
            '  display:flex!important;align-items:center!important;height:44px!important;min-height:44px!important;' +
            '  box-sizing:border-box!important;gap:8px!important;margin:0!important;padding-top:0!important;padding-bottom:0!important;' +
            '}' +
            '#sf-sort-button{' +
            '  display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:6px!important;' +
            '  height:32px!important;min-height:32px!important;box-sizing:border-box!important;' +
            '  background:rgba(255,255,255,0.08);border:none!important;border-radius:32px!important;' +
            '  color:var(--text-base,#fff);font-family:inherit!important;font-size:12px!important;font-weight:700!important;' +
            '  padding:0 14px!important;cursor:pointer!important;-webkit-user-select:none!important;user-select:none!important;' +
            '  white-space:nowrap!important;flex-shrink:0!important;line-height:1!important;margin:0!important;' +
            '  transition:background-color .2s ease,color .2s ease;' +
            '}' +
            '#sf-sort-button:hover{background:rgba(255,255,255,0.15);}' +
            '#sf-sort-button.sf-sort-active{' +
            '  background:var(--text-bright-accent,#1ed760)!important;color:#000!important;' +
            '}' +
            '#sf-sort-button.sf-sort-active svg{fill:#000!important;}' +
            '#sf-sort-button svg{width:16px!important;height:16px!important;fill:currentColor;flex-shrink:0!important;}' +
            '.sf-sort-label{white-space:nowrap!important;}' +
            '#sf-sort-menu{' +
            '  position:fixed;z-index:99999;background:var(--background-elevated-base,#282828);' +
            '  border-radius:4px;padding:4px;box-shadow:0 16px 24px rgba(0,0,0,.5),0 6px 8px rgba(0,0,0,.3);' +
            '  min-width:180px;font-family:inherit;color:#fff;' +
            '}' +
            '.sf-sort-menu-header{' +
            '  padding:8px 12px 6px;font-size:11px;font-weight:700;color:var(--text-subdued,#b3b3b3);' +
            '  text-transform:capitalize;-webkit-user-select:none;user-select:none;' +
            '}' +
            '.sf-sort-menu-item{' +
            '  display:flex;align-items:center;justify-content:space-between;width:100%;' +
            '  background:transparent;border:none;border-radius:2px;padding:8px 12px;' +
            '  font-size:14px;font-weight:500;color:#fff;text-align:left;cursor:pointer;' +
            '  transition:background-color .15s ease;' +
            '}' +
            '.sf-sort-menu-item:hover{background:rgba(255,255,255,0.1);}' +
            '.sf-sort-menu-item.sf-active{color:var(--text-bright-accent,#1ed760);font-weight:600;}' +
            '.sf-sort-arrow{font-size:15px;line-height:1;margin-left:8px;font-weight:700;color:var(--text-bright-accent,#1ed760);}';
    }

    function getOrCreateAlbumToolbar() {
        var main = document.querySelector('main, [role="main"]');
        var scope = main || document;
        var actionBar = scope.querySelector('[data-testid="action-bar"], [data-testid="action-bar-row"]');
        if (!actionBar) return null;

        var host = actionBar.closest('[data-overlayscrollbars="host"]') || actionBar;
        if (!host || !host.parentNode) return null;

        var toolbar = document.getElementById('sf-album-toolbar');
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'sf-album-toolbar';
            toolbar.className = 'contentSpacing';
            toolbar.setAttribute('data-testid', 'album-toolbar');
            toolbar.style.cssText = 'display:flex;align-items:center;height:44px;min-height:44px;box-sizing:border-box;gap:8px;margin:0;padding-top:0;padding-bottom:0;';
        }

        if (host.nextElementSibling !== toolbar) {
            host.parentNode.insertBefore(toolbar, host.nextElementSibling);
        }

        return toolbar;
    }

    function findToolbarContainer() {
        if (albumPage()) {
            return getOrCreateAlbumToolbar();
        }

        var tb = document.querySelector('[data-testid="playlist-toolbar"]:not(#sf-album-toolbar)');
        if (tb && document.body.contains(tb)) {
            var viewport = tb.querySelector('[data-overlayscrollbars-viewport]');
            if (viewport) {
                return viewport.firstElementChild || viewport;
            }
            var host = tb.querySelector('[data-overlayscrollbars="host"]');
            if (host) return host;
            return tb;
        }

        return null;
    }

    function updateSortButtonUI() {
        var btn = document.getElementById('sf-sort-button');
        if (!btn) return;
        var cur = getSortState();
        var labelEl = btn.querySelector('.sf-sort-label');
        if (!labelEl) return;

        if (cur && cur.field && cur.field !== 'CUSTOM') {
            btn.classList.add('sf-sort-active');
            btn.style.background = 'var(--text-bright-accent, #1ed760)';
            btn.style.color = '#000';
            var svg = btn.querySelector('svg');
            if (svg) svg.style.fill = '#000';
            var dirIcon = cur.order === 'DESC' ? '↓' : '↑';
            var shortTxt = SHORT_LABELS[cur.field] || cur.field;
            labelEl.textContent = shortTxt + ' ' + dirIcon;
            labelEl.style.display = 'inline';
        } else {
            btn.classList.remove('sf-sort-active');
            btn.style.background = 'rgba(255,255,255,0.08)';
            btn.style.color = '#fff';
            var svg = btn.querySelector('svg');
            if (svg) svg.style.fill = 'currentColor';
            labelEl.textContent = 'Sort';
            labelEl.style.display = 'inline';
        }
    }

    function closeSortMenu() {
        var menu = document.getElementById('sf-sort-menu');
        if (menu && menu.parentNode) {
            menu.parentNode.removeChild(menu);
        }
    }

    function openSortMenu(anchorBtn) {
        closeSortMenu();
        var menu = document.createElement('div');
        menu.id = 'sf-sort-menu';

        var header = document.createElement('div');
        header.className = 'sf-sort-menu-header';
        header.textContent = 'Sort by';
        menu.appendChild(header);

        var cur = getSortState();
        var activeField = (cur && cur.field) ? cur.field : 'CUSTOM';
        var activeOrder = (cur && cur.order) ? cur.order : 'ASC';

        SORT_MENU_ITEMS.forEach(function(item) {
            var btn = document.createElement('button');
            btn.className = 'sf-sort-menu-item';
            btn.type = 'button';
            btn.setAttribute('data-sf-field', item.id);

            var labelSpan = document.createElement('span');
            labelSpan.textContent = item.label;
            btn.appendChild(labelSpan);

            if (item.id === activeField) {
                btn.classList.add('sf-active');
                if (item.id !== 'CUSTOM') {
                    var arrowSpan = document.createElement('span');
                    arrowSpan.className = 'sf-sort-arrow';
                    arrowSpan.textContent = activeOrder === 'DESC' ? '↓' : '↑';
                    btn.appendChild(arrowSpan);
                }
            }

            btn.addEventListener('click', function(ev) {
                ev.stopPropagation();
                toggleField(item.id);
                closeSortMenu();
            });

            menu.appendChild(btn);
        });

        document.body.appendChild(menu);

        var rect = anchorBtn.getBoundingClientRect();
        var menuWidth = 190;
        var left = rect.left;
        if (left + menuWidth > window.innerWidth - 12) {
            left = window.innerWidth - menuWidth - 12;
        }
        var top = rect.bottom + 6;
        var menuHeight = 280;
        if (top + menuHeight > window.innerHeight - 12 && rect.top > menuHeight + 12) {
            top = rect.top - menuHeight - 6;
        }
        menu.style.top = top + 'px';
        menu.style.left = Math.max(12, left) + 'px';
    }

    function attachSortButton() {
        if (!currentUri()) {
            var existing = document.getElementById('sf-sort-button');
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
            var albumTb = document.getElementById('sf-album-toolbar');
            if (albumTb && albumTb.parentNode) albumTb.parentNode.removeChild(albumTb);
            closeSortMenu();
            return;
        }

        if (!albumPage()) {
            var oldAlbumTb = document.getElementById('sf-album-toolbar');
            if (oldAlbumTb && oldAlbumTb.parentNode) oldAlbumTb.parentNode.removeChild(oldAlbumTb);
        }

        var container = findToolbarContainer();
        if (!container) return;

        var sortBtn = document.getElementById('sf-sort-button');
        if (sortBtn && document.body.contains(sortBtn)) {
            if (sortBtn.parentNode !== container) {
                if (container.firstChild) {
                    container.insertBefore(sortBtn, container.firstChild);
                } else {
                    container.appendChild(sortBtn);
                }
            }
            updateSortButtonUI();
            return;
        }

        if (sortBtn && sortBtn.parentNode) {
            sortBtn.parentNode.removeChild(sortBtn);
        }

        sortBtn = document.createElement('button');
        sortBtn.id = 'sf-sort-button';
        sortBtn.type = 'button';
        sortBtn.setAttribute('aria-label', 'Sort playlist');
        sortBtn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;gap:6px;' +
            'height:32px;min-height:32px;box-sizing:border-box;' +
            'background:rgba(255,255,255,0.08);border:none;border-radius:32px;' +
            'color:#fff;font-family:inherit;font-size:12px;font-weight:700;' +
            'padding:0 14px;cursor:pointer;-webkit-user-select:none;user-select:none;' +
            'white-space:nowrap!important;flex-shrink:0!important;line-height:1;margin:0;';

        sortBtn.innerHTML =
            '<svg role="img" height="16" width="16" viewBox="0 0 16 16">' +
            '  <path d="M15 3.25a.75.75 0 0 0-.75-.75h-9a.75.75 0 0 0 0 1.5h9a.75.75 0 0 0 .75-.75z' +
            '           M12 8a.75.75 0 0 0-.75-.75h-6a.75.75 0 0 0 0 1.5h6A.75.75 0 0 0 12 8z' +
            '           M9.25 12.75a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5H8.5a.75.75 0 0 1 .75.75z"/>' +
            '</svg>' +
            '<span class="sf-sort-label">Sort</span>';

        sortBtn.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var menu = document.getElementById('sf-sort-menu');
            if (menu) closeSortMenu();
            else openSortMenu(sortBtn);
        });

        if (container.firstChild) {
            container.insertBefore(sortBtn, container.firstChild);
        } else {
            container.appendChild(sortBtn);
        }
        updateSortButtonUI();
    }

    document.addEventListener('click', function(ev) {
        var menu = document.getElementById('sf-sort-menu');
        if (!menu) return;
        var sortBtn = document.getElementById('sf-sort-button');
        if (menu.contains(ev.target) || (sortBtn && sortBtn.contains(ev.target))) return;
        closeSortMenu();
    }, true);

    // =========================================================================
    // SECTION 3: FETCH INTERCEPTOR (DEFAULT PASS-THROUGH VS CLIENT SORT)
    // =========================================================================

    var prevFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
        try {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.indexOf('api-partner.spotify.com/pathfinder') === -1 || !init || !init.body) {
                return prevFetch(input, init);
            }
            var body = init.body;
            var parsed = typeof body === 'string' ? JSON.parse(body) : body;
            var op = parsed && parsed.operationName;
            var playlistOp = (op === 'fetchPlaylistContents' || op === 'fetchPlaylist');
            if (!parsed || (op !== 'getAlbum' && !playlistOp)) {
                return prevFetch(input, init);
            }
            var vars = parsed.variables || {};
            var uri = vars.uri || vars.albumUri || (vars.id ? ('spotify:' + (playlistOp ? 'playlist' : 'album') + ':' + vars.id) : null);
            if (!uri && (playlistOp || albumPage())) {
                uri = currentUri();
            }
            var want = playlistOp ? 'spotify:playlist:' : 'spotify:album:';
            if (!uri || String(uri).indexOf(want) !== 0) return prevFetch(input, init);

            var curState = getSortState(uri);

            // If in Custom order (Spotify default), let the original request proceed untouched,
            // or serve from pristine originalItems if available on albums
            if (!curState || !curState.field || curState.field === 'CUSTOM') {
                if (albumPage()) {
                    var hit = held[uri];
                    if (hit && hit.originalItems && hit.originalItems.length >= (hit.total || 0) && (Date.now() - hit.ts) < TTL) {
                        hit.key = 'CUSTOM';
                        return Promise.resolve(rebuild(hit.envelope, hit.originalItems));
                    }
                }
                // For all playlists and un-cached albums: completely pass through to Spotify
                return prevFetch(input, init);
            }

            // User has an explicit sort active for this playlist/album
            var offset = vars.offset | 0;
            var limit = (vars.limit | 0) || 50;
            var key = sortKey(curState);
            var hit = held[uri];
            if (!hit || (Date.now() - hit.ts) >= TTL) hit = null;

            if (hit && hit.originalItems && hit.originalItems.length) {
                var sorted = (hit.key === key && hit.items) ? hit.items : sortItems(hit.originalItems, curState);
                hit.items = sorted;
                hit.key = key;
                return Promise.resolve(rebuild(hit.envelope, albumPage() ? sorted : sorted.slice(offset, offset + limit)));
            }

            if (!hit) {
                var req = Object.assign({}, parsed);
                req.variables = playlistOp ? Object.assign({}, vars, { offset: 0, limit: MAX_LIMIT }) : vars;
                var init2 = Object.assign({}, init);
                init2.body = typeof body === 'string' ? JSON.stringify(req) : req;
                return prevFetch(input, init2).then(function(resp) {
                    return resp.clone().json().then(function(j) {
                        var items = readItems(j);
                        if (!items || !items.length) return resp;
                        var sorted = sortItems(items, curState);
                        held[uri] = {
                            items: sorted,
                            originalItems: items.slice(),
                            envelope: j,
                            total: readTotal(j, sorted.length),
                            key: key,
                            ts: Date.now()
                        };
                        if (albumPage()) sortedHits[uri + '|' + key] = 1;
                        return rebuild(j, albumPage() ? sorted : sorted.slice(offset, offset + limit));
                    }).catch(function() { return resp; });
                });
            }

            return prevFetch(input, init).then(function(resp) {
                return resp.clone().json().then(function(j) {
                    var items = readItems(j);
                    if (!items || !items.length) return resp;
                    return rebuild(j, sortItems(items, curState));
                }).catch(function() { return resp; });
            });
        } catch(e) {
            return prevFetch(input, init);
        }
    };

    window.sfPlaylistSort = {
        get: function() { return getSortState(); },
        set: setSort,
        clear: clearSort,
        cycle: toggleField,
        refresh: function() {
            attachSortButton();
            updateSortButtonUI();
            if (!albumPage()) apply();
        }
    };

    function scheduleAttach() {
        if (attachTimer) return;
        attachTimer = setTimeout(function() {
            attachTimer = null;
            attachSortButton();
        }, 120);
    }

    if (window.MutationObserver) {
        var obs = new MutationObserver(scheduleAttach);
        var root = document.body || document.documentElement;
        if (root) obs.observe(root, { childList: true, subtree: true });
    }

    setInterval(attachSortButton, 1000);
    injectStyle();
    attachSortButton();
})();
