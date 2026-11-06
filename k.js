/*!
 * KupuLampa v1.4.0 — «Гарри Поттер 4K» для Lampa
 * Автор: @Kirillka645 · https://github.com/Kirillka645/Kirillka645.github.io
 *
 *  • Пункт меню «Гарри Поттер 4K» — все 8 фильмов серии по порядку (данные TMDB)
 *  • Устанавливает предпочтение 2160p; качество зависит от источника и плеера
 *  • Настройки → KupuLampa → «Всегда 4K (2160p)» (можно выключить)
 *
 *  Прямой API Alloha: используется публичный токен клиента anime-dl-core, который может перестать работать.
 */
(function () {
    'use strict';

    if (window.kupulampa_ready) return;
    window.kupulampa_ready = true;

    var VERSION       = '1.4.0';
    var SOURCE        = 'kupulampa';
    var COLLECTION_ID = 1241; // TMDB: Harry Potter Collection
    var FALLBACK_IDS  = [671, 672, 673, 674, 675, 767, 12444, 12445];
    var SELF_URL      = /kirillka645\.github\.io\/k\.js/i;
    var SCRIPT_SRC    = (document.currentScript && document.currentScript.src) || '';

    var ICON = '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M14.2 1.5 4.6 13.4h6.1l-1.6 9.1 10.3-12.6h-6.3l1.1-8.4Z" fill="currentColor"/></svg>';

    var cache = null;

    function log() {
        try { console.log.apply(console, ['KupuLampa'].concat([].slice.call(arguments))); } catch (e) {}
    }

    function tr(key) {
        return Lampa.Lang.translate(key);
    }

    /* ---------- Локализация ---------- */

    function addLang() {
        Lampa.Lang.add({
            kupulampa_menu: {
                ru: 'Гарри Поттер 4K', uk: 'Гаррі Поттер 4K', be: 'Гары Потэр 4K', en: 'Harry Potter 4K'
            },
            kupulampa_force4k: {
                ru: 'Всегда 4K (2160p)', uk: 'Завжди 4K (2160p)', be: 'Заўсёды 4K (2160p)', en: 'Always 4K (2160p)'
            },
            kupulampa_force4k_descr: {
                ru: 'Запрашивает 2160p в Lampa; источник и плеер могут игнорировать настройку',
                uk: 'Плеєр обирає 2160p, якщо джерело його віддає, інакше — найкращу доступну якість',
                be: 'Плэер выбірае 2160p, калі крыніца яго аддае, інакш — найлепшую даступную якасць',
                en: 'The player picks 2160p when the source offers it, otherwise the best available quality'
            },
            kupulampa_descr: {
                ru: 'Фильмы о Гарри Поттере и веб-плеер через прямой API Alloha',
                uk: 'Усі фільми про Гаррі Поттера в меню + 4K (2160p) у плеєрі',
                be: 'Усе фільмы пра Гары Потэра ў меню + 4K (2160p) у плэеры',
                en: 'All Harry Potter films in the menu + 4K (2160p) in the player'
            }
        });
    }

    /* ---------- Данные (TMDB через встроенный клиент Lampa) ---------- */

    function tmdbGet(method, ok, fail) {
        var tmdb = Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb;

        if (tmdb && typeof tmdb.get === 'function') {
            tmdb.get(method, {}, ok, fail);
        } else {
            var lang = Lampa.Storage.field('tmdb_lang') || Lampa.Storage.get('language', 'ru') || 'ru';
            var url  = Lampa.TMDB.api(method + '?api_key=' + Lampa.TMDB.key() + '&language=' + lang);

            new Lampa.Reguest().silent(url, ok, fail);
        }
    }

    function prepare(items) {
        var seen = {};
        var out  = [];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            if (!item || !item.id || seen[item.id]) continue;

            seen[item.id] = true;
            item.source   = 'tmdb';

            if (!item.media_type) item.media_type = 'movie';

            out.push(item);
        }

        out.sort(function (a, b) {
            return String(a.release_date || '9999').localeCompare(String(b.release_date || '9999'));
        });

        return out;
    }

    function pack(items) {
        return { results: items.slice(0), page: 1, total_pages: 1, total_results: items.length };
    }

    function loadFallback(done, fail) {
        var items = [];
        var index = 0;

        function next() {
            if (index >= FALLBACK_IDS.length) {
                if (items.length) {
                    cache = prepare(items);
                    done(pack(cache));
                } else if (fail) fail();

                return;
            }

            tmdbGet('movie/' + FALLBACK_IDS[index++], function (json) {
                if (json && json.id) items.push(json);
                next();
            }, next);
        }

        next();
    }

    function loadCollection(done, fail) {
        if (cache) return done(pack(cache));

        tmdbGet('collection/' + COLLECTION_ID, function (json) {
            var parts = prepare((json && json.parts) || []);

            if (parts.length) {
                cache = parts;
                done(pack(cache));
            } else loadFallback(done, fail);
        }, function () {
            loadFallback(done, fail);
        });
    }

    function delegate(name) {
        return function () {
            var tmdb = Lampa.Api.sources.tmdb;

            return tmdb[name].apply(tmdb, arguments);
        };
    }

    function addSource() {
        var tmdb   = Lampa.Api.sources.tmdb;
        var source = {};

        for (var name in tmdb) {
            if (typeof tmdb[name] === 'function' && name !== 'discovery') source[name] = delegate(name);
        }

        source.list = function (params, oncomplite, onerror) {
            loadCollection(oncomplite, onerror);
        };

        source.clear = function () {};

        Lampa.Api.sources[SOURCE] = source;
    }

    /* ---------- 4K в плеере ---------- */

    function applyQuality(on) {
        var current = String(Lampa.Storage.field('video_quality_default') || '1080');

        if (on) {
            if (current !== '2160') {
                Lampa.Storage.set('kupulampa_prev_quality', current);
                Lampa.Storage.set('video_quality_default', '2160');
            }
        } else if (current === '2160') {
            var prev = String(Lampa.Storage.get('kupulampa_prev_quality', '1080') || '1080');

            Lampa.Storage.set('video_quality_default', prev === '2160' ? '1080' : prev);
        }
    }

    /* ---------- Интерфейс ---------- */

    function open() {
        Lampa.Activity.push({
            url: '',
            title: tr('kupulampa_menu'),
            component: 'category_full',
            source: SOURCE,
            page: 1
        });
    }

    function addMenu() {
        if ($('.menu [data-action="kupulampa"]').length) return;

        var item;

        if (Lampa.Menu && typeof Lampa.Menu.addButton === 'function') {
            item = Lampa.Menu.addButton(ICON, tr('kupulampa_menu'), open);
        } else {
            item = $('<li class="menu__item selector"><div class="menu__ico">' + ICON + '</div>' +
                '<div class="menu__text">' + tr('kupulampa_menu') + '</div></li>');
            item.on('hover:enter', open);
            $('.menu .menu__list').eq(0).append(item);
        }

        if (item && item.attr) item.attr('data-action', 'kupulampa');
    }

    function addSettings() {
        if (!Lampa.SettingsApi) return;

        Lampa.SettingsApi.addComponent({
            component: 'kupulampa',
            name: 'KupuLampa',
            icon: ICON
        });

        Lampa.SettingsApi.addParam({
            component: 'kupulampa',
            param: { name: 'kupulampa_force4k', type: 'trigger', default: true },
            field: { name: tr('kupulampa_force4k'), description: tr('kupulampa_force4k_descr') },
            onChange: function (value) {
                applyQuality(String(value) === 'true');
            }
        });
    }

    function normalize(url) {
        return String(url || '').replace(/^https?:\/\//i, '').split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
    }

    // Подписывает плагин в «Расширениях»: KupuLampa вместо «Без названия»
    function setPluginInfo() {
        if (!Lampa.Plugins || typeof Lampa.Plugins.get !== 'function') return;

        var self    = normalize(SCRIPT_SRC);
        var changed = false;

        Lampa.Plugins.get().forEach(function (plugin) {
            if (!plugin || typeof plugin !== 'object') return;

            var url = String(plugin.url || '');

            if ((SELF_URL.test(url) || (self && normalize(url) === self)) && plugin.name !== 'KupuLampa') {
                plugin.name   = 'KupuLampa';
                plugin.author = '@Kirillka645';
                plugin.descr  = tr('kupulampa_descr');
                changed       = true;
            }
        });

        if (changed && typeof Lampa.Plugins.save === 'function') Lampa.Plugins.save();
    }

    /* ---------- Прямой API Alloha ---------- */
    function webPlayer(object) {
        var root = $('<div class="kupulampa-web" style="position:fixed;top:0;right:0;bottom:0;left:0;z-index:10000;background:#000;display:flex;flex-direction:column">' +
            '<div style="display:flex;gap:16px;padding:12px;background:#171717;color:#fff;align-items:center">' +
            '<div class="selector kupu-web-back" style="padding:10px 16px;background:#333;border-radius:6px">Назад</div>' +
            '<div class="selector kupu-web-focus" style="padding:10px 16px;background:#333;border-radius:6px">Управление плеером</div>' +
            '<span>Alloha</span></div>' +
            '<iframe class="kupu-web-frame" style="width:100%;flex:1;border:0;background:#000" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen tabindex="0" title="Alloha"></iframe></div>');
        var frame = root.find('.kupu-web-frame');
        var last = false;
        frame.attr('src', object.embedUrl);
        root.find('.kupu-web-back').on('hover:enter click', function () { Lampa.Activity.backward(); });
        root.find('.kupu-web-focus').on('hover:enter click', function () {
            if (frame[0]) frame[0].focus();
        });
        root.find('.selector').on('hover:focus', function () { last = this; });
        this.create = function () { return root; };
        this.render = function () { return root; };
        this.start = function () {
            Lampa.Controller.add('kupu_alloha', {
                toggle: function () {
                    Lampa.Controller.collectionSet(root);
                    Lampa.Controller.collectionFocus(last || false, root);
                },
                left: function () { Lampa.Navigator.move('left'); },
                right: function () { Lampa.Navigator.move('right'); },
                up: function () { Lampa.Navigator.move('up'); },
                down: function () { Lampa.Navigator.move('down'); },
                back: function () { Lampa.Activity.backward(); }
            });
            Lampa.Controller.toggle('kupu_alloha');
        };
        this.stop = function () {};
        this.destroy = function () { frame.attr('src', 'about:blank'); root.remove(); };
    }

    function openAlloha(movie) {
        var id = Number(movie && movie.id);
        if (!id || FALLBACK_IDS.indexOf(id) < 0) return;
        // Public default token from anime-dl-core; not an account secret.
        var publicToken = "04941a9a3ca3ac16e2b4327347bbc1";
        if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('KupuLampa: подключаем Alloha…');
        $.ajax({ url: 'https://api.alloha.tv/', type: 'GET', dataType: 'json', timeout: 15000,
            data: { token: publicToken, tmdb: id } }).done(function (data) {
            var link = data && data.status === 'success' && data.data && data.data.iframe || '';
            if (!/^https:\/\//i.test(link)) {
                if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('Alloha не найдена для этого фильма');
                return;
            }
            Lampa.Activity.push({ url: '', title: 'Alloha', component: 'kupu_alloha', embedUrl: link });
        }).fail(function () {
            if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show('KupuLampa: не удалось связаться с API Alloha');
        });
    }

    function addAllohaButton(e) {
        try {
            if (!e || e.type !== 'complite' || !e.data || !e.data.movie ||
                FALLBACK_IDS.indexOf(Number(e.data.movie.id)) < 0) return;
            var view = e.object.activity.render();
            if (view.find('.kupu-alloha-button').length) return;
            var button = $('<div class="full-start__button selector kupu-alloha-button" data-subtitle="Прямой API Alloha"><span>KupuLampa</span></div>');
            button.on('hover:enter click', function () { openAlloha(e.data.movie); });
            var anchor = view.find('.view--torrent');
            if (anchor.length) anchor.after(button);
            else view.find('.full-start__buttons').append(button);
        } catch (err) { log('Alloha button error', err && err.message ? err.message : err); }
    }

    function addAlloha() {
        Lampa.Component.add('kupu_alloha', webPlayer);
        Lampa.Listener.follow('full', addAllohaButton);
    }

    /* ---------- Запуск ---------- */

    function init() {
        try {
            addLang();
            addSource();
            addSettings();
            addMenu();
            addAlloha();

            if (Lampa.Storage.field('kupulampa_force4k')) applyQuality(true);

            setPluginInfo();

            log('ready', VERSION);
        } catch (e) {
            log('init error', e && e.message ? e.message : e);
        }
    }

    if (window.appready) init();
    else Lampa.Listener.follow('app', function (e) {
        if (e.type === 'ready') init();
    });
})();
