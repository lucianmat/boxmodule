
var app;

var boxModule = {
    name: 'box-module',
    static: {
        ui: {
            scrollPageTo: function (scrollTo, container, tout) {
                if (typeof container === 'number') {
                    tout = container;
                    container = false;
                }
                tout = tout || 600;
                container = container || app.$('.page-current .page-content');
                if (typeof scrollTo.offset !== 'function') {
                    scrollTo = container.find(scrollTo);
                }

                container.scrollTop(scrollTo.offset().top - container.offset().top + container.scrollTop(), tout);
            }
        },
        localStorage: {
            getItem: function (ck) {
                var vp = localStorage.getItem(ck);
                return Promise.resolve(vp);
            },
            setItem: function (ck, vl) {
                localStorage.setItem(ck, vl);
                return Promise.resolve();
            },
            removeItem: function (ck) {
                localStorage.removeItem(ck);
                return Promise.resolve();
            }
        },
        log: function () {
            if (console && typeof console.log === 'function') {
                var args = Array.prototype.slice.call(arguments).map(function (il) {
                    return JSON.stringify(il);
                });

                _lg = _lg + 1;
                args.unshift('cntr::' + _lg);
                console.log.apply(console, args);
            }
        }

    },
    on: {
        init: function () {
            if ((this.params && !this.params.keepSplashScreen) &&
                navigator.splashscreen && (typeof navigator.splashscreen.hide === 'function')) {
                navigator.splashscreen.hide();
            }
        }
    }
};


function _safeToLocation(url) {
    boxModule.static.log('move from : ' + window.location.href + ' to : ' + url);
    return new Promise(function (resolve, reject) {
        if (typeof window.resolveLocalFileSystemURL === 'function') {
            window.resolveLocalFileSystemURL(url, function (ef) {
                if (ef && ef.isFile) {
                    if (typeof window.location.assing === 'function') {
                        window.location.assing(url);
                    } else {
                        window.location.href = url;
                    }
                } else {
                    boxModule.static.log('resolved, not file... fallback');
                    reject(ef);
                }
            }, reject);
        } else {
            document.addEventListener('deviceready', function () {
                try {
                    window.resolveLocalFileSystemURL(url, function (ef) {
                        if (ef && ef.isFile) {
                            if (typeof window.location.assing === 'function') {
                                window.location.assing(url);
                            } else {
                                window.location.href = url;
                            }
                        } else {
                            boxModule.static.log('resolved, not file... fallback');
                            reject(ef);
                        }
                    }, reject);
                } catch (err) {
                    reject(err);
                }
            }, false);
        }
    });
}

function _runApp() {

    Framework7.request({
        url: 'config.json', method: 'GET', dataType: 'json', cache: false,
        success: function (resp) {
            var pInst = {
                id: resp.appId,
                name: resp.appName,
                root: '#boxApp',
                version: resp.version
            };

            pInst[boxModule.name] = resp;
            pInst[resp.appId] = resp;

            Framework7.use(boxModule, resp);

            Parse._initialize(resp.appId, resp.javascriptKey);
            Parse.serverURL = resp.serverURL ? resp.serverURL :
                (window.location && window.location.hostname === 'localhost' ?
                    'http://businessbox.omg/api/' :
                    'https://businessbox.pro/api/');



            var startParams = {};
            if (typeof __app_start_parame === 'function') {
                startParams = __app_start_parame(pInst);
                pInst = Framework7.utils.extend(pInst, startParams);
            }
            Promise.resolve()
                .then(function () {
                    if (!pInst.localDataStore) {
                        return;
                    }
                    return Parse.Database.configure(pInst.localDataStore);
                })
                .then(function () {
                    app = new Framework7(pInst);
                });

        },
        error: function (err) {
            console.error(err);
        }
    });
}

boxModule.static.localStorage.getItem('currentApp')
    .then(function (cr) {
        if (cr) {
            try {
                cr = JSON.parse(cr);
                if (typeof cr.expire === 'number' && cr.expire < new Date().getTime()) {
                    return boxModule.static.localStorage.removeItem('currentApp')
                        .then(function () {
                            return _runApp();
                        });
                }
                if (cr && cr.url && (window.location.href !== "file://" + cr.url)) {
                    _safeToLocation("file://" + cr.url)
                        .catch(function () {
                            return boxModule.static.localStorage.removeItem('currentApp')
                                .then(function () {
                                    return _runApp();
                                });
                        });
                }

                return;
            } catch (ex) {
                //TODO: report error
                Framework7.log(ex);
            }
        }
        _runApp();
    });