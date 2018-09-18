var app,
    appSession,
    _lg = 0,
    traceUrl,
    __promisesPromises = {};

if (typeof sessionStorage !== 'undefined' &&
    typeof sessionStorage.getItem === 'function') {
    appSession = sessionStorage.getItem('box:sessionId');
}

if (!appSession) {
    appSession = (new Date()).toString();
    if (sessionStorage && sessionStorage.setItem) {
        sessionStorage.setItem('box:sessionId', appSession);
    }
}

var appDb = {
    getItem: function (key) {
        return Parse.CoreManager.getStorageController().async ?
            Parse.Storage.getItemAsync(key) :
            Promise.resolve(Parse.Storage.getItem(key));
    },
    setItem: function (key, val) {
        if (Parse.CoreManager.getStorageController().async) {
            return Parse.Storage.setItemAsync(key, val);
        }
        Parse.Storage.setItem(key, val);
        return Promise.resolve();
    }
};


function reportImage(url) {
    return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
            resolve(url);
        };
        img.onerror = function () {
            reject(url);
        };
        img.src = url;
    });
}

/**
* 
* 
* @param {any} stackInfo
*/
function _reportTrace(stackInfo) {


    /**
     * 
     * 
     * @param {any} key
     * @param {any} value
     * @returns
     */
    var snddata = {
        trace: stackInfo,
        recorded: new Date(),
        url: window.location.href
    },
        cache = [],
        jserr = JSON.stringify(snddata, function (key, value) {
            if (typeof value === 'object' && value !== null) {
                if (cache.indexOf(value) !== -1) {
                    return;
                }
                cache.push(value);
            }
            return value;
        });

    if (console && typeof console.log === 'function') {
        console.log(stackInfo);
    }

    return appDb.getItem('errors')
        .then(function (errs) {
            var dbers = errs ? errs.errors : [],
                toKeep = [],
                pmr;

            dbers.push(jserr);
            if (!app || !app.onLine) {
                return appDb.setItem('errors', { errors: dbers });
            }

            if (traceUrl) {
                pmr = Promise.resolve(traceUrl);
            } else {
                pmr = Parse.CoreManager.getInstallationController()
                    .currentInstallationId()
                    .then(function (instId) {
                        var tb = document.createElement('a');
                        tb.href = Parse.serverURL;
                        traceUrl = tb.origin + '/box/error/trace/' + Parse.applicationId + '?installId=' + encodeURIComponent(instId) + '&report=';
                        return traceUrl;
                    });
            }

            return pmr
                .then(function () {
                    return reportImage(traceUrl + 'ping');
                })
                .then(function () {
                    return Promise.all(dbers.map(function (di) {
                        var url = traceUrl + encodeURIComponent(di);
                        Framework7.log(JSON.parse(di));
                        return reportImage(url).catch(function () {
                            var vdc = JSON.parse(di);
                            if (vdc && vdc.trace && vdc.trace.stack) {
                                for (var i = 0; i < vdc.trace.stack.length; i++) {
                                    if (vdc.trace.stack[i].context && vdc.trace.stack[i].context.length) {
                                        for (var j = 0; j < vdc.trace.stack[i].context.length; j++) {
                                            vdc.trace.stack[i].context[j] = vdc.trace.stack[i].context[j].trim();
                                        }
                                    }
                                }
                                di = JSON.stringify(vdc);
                            }
                            toKeep.push(di);
                        });
                    }))
                        .then(function () {
                            return appDb.setItem('errors', { errors: toKeep });
                        });
                }, function () {
                    // dont't track error for reporting
                });
        });
}


function _throttlePromise(cnm, tinterval, fn) {
    var args,
        vtm = new Date().getTime(),
        lnh = _throttlePromise.length,
        options = (tinterval === parseInt(tinterval) ? { interval: tinterval, scope: null } : tinterval);

    options.timeout = options.timeout || 10000;
    if (__promisesPromises[cnm]) {
        if (__promisesPromises[cnm].started + options.interval > vtm) {
            Framework7.log('throttle promise for ' + cnm);
            return new Promise(function (resolve, reject) {
                __promisesPromises[cnm].promise.then(resolve, reject);
            });
        }

        if (!__promisesPromises[cnm]._resolved && !__promisesPromises[cnm]._rejected) {
            Framework7.log('throttle pending promise for ' + cnm);
            if (__promisesPromises[cnm].started + options.timeout > vtm) {
                return new Promise(function (resolve, reject) {
                    __promisesPromises[cnm].promise.then(resolve, reject);
                }); // pending promise 
            } else {
                __promisesPromises[cnm].promise = Promise.reject(new Parse.Error(Parse.Error.timeout, cnm + ' operation timeout'));
                return __promisesPromises[cnm].promise;
            }
        }
        //else if (options.memoize && (__promisesPromises[cnm].started + options.memoize > vtm)) {
        //    return __promisesPromises[cnm].promise;
        // }
    }
    Framework7.log('calling to throttle promise for ' + cnm);

    args = Array.prototype.slice.call(arguments, lnh);
    __promisesPromises[cnm] = {
        started: vtm,
        promise: new Promise(function (resolve, reject) {
            fn.apply(options.scope, args).then(function (vl) {
                __promisesPromises[cnm]._resolved = true;
                return resolve(vl);
            }, function (err) {
                __promisesPromises[cnm]._rejected = true;
                return reject(err);
            });
        })
    };
    return __promisesPromises[cnm].promise;
}

function _closeNotification() {
    if (app && !Framework7.device.android && app.pushController) {
        app.pushController.finish();
    }
}


function _inDebug() {
    return (typeof device !== 'undefined') && (!device.isVirtual || device.platform === 'browser');
}


var boxModule = {
    name: 'box-module',
    params: {
        analitycs: {
            appOpened: 'AppOpened',
            network: 'networks'
        }
    },
    helpers: {
        throttlePromise: _throttlePromise
    },
    proto: {
        connectionState: function (force) {
            return _throttlePromise('connectionState', 1000, function () {
                return new Promise(function (resolve, reject) {
                    if (navigator.connection && typeof navigator.connection.getInfo === 'function') {
                        navigator.connection.getInfo(function (cnt) {

                            if (app && app.connection !== cnt) {
                                if (cnt === Connection.NONE ||
                                    (cnt === Connection.UNKNOWN && device.platform !== 'browser')) {
                                    app.root.addClass('offline');
                                    app.onLine = false;
                                } else {
                                    app.root.removeClass('offline');
                                    app.onLine = true;
                                }

                                Framework7.analitycs(boxModule.params.analitycs.network, { connection: cnt });
                                app.emit('connection', cnt);
                                app.connection = cnt;
                            }

                            resolve(cnt);
                        });
                    } else {
                        if (app) {
                            app.onLine = true;
                        }
                        resolve();
                    }
                });
            }, force);

        },
        getUser: function (force) {
            var self = this;

            if (this.user) {
                return Promise.resolve(this.user);
            }
            return (Parse.CoreManager.getStorageController().async ?
                Parse.User.currentAsync() :
                Promise.resolve(Parse.User.current()))
                .then(function (user) {
                    if (user) {
                        return self.connectionState()
                            .then(function () {
                                if (!self.onLine && !force) {
                                    return user;
                                }
                                return Parse.User.become()
                                    .then(function () {
                                        self.user = user;
                                        return Promise.resolve(self.user);
                                    }, function (err) {
                                        _reportTrace(err);
                                        return Promise.resolve((err && err.code !== 100) || force ? undefined : user);
                                    });
                            });

                    }
                    return Promise.resolve();
                });
        },
        syncInstallation: function (data) {
            var self = this;
            Framework7.log('sincing installation ');
            return Framework7.localStorage.getItem('installed')
                .then(function (idt) {
                    var instData = new Parse.Object('_Installation');

                    if (idt && !data) {
                        return Parse.CoreManager.getInstallationController()
                            .currentInstallationId();
                    }
                    return self.connectionState()
                        .then(function () {
                            if (!self.onLine) {
                                Framework7.log('no connection to save installation data');
                                return Parse.CoreManager.getInstallationController()
                                    .currentInstallationId();
                            }

                            return Parse.CoreManager.getInstallationController()
                                .currentInstallationId()
                                .then(function (instid) {
                                    var i,
                                        cfg = self.params[boxModule.name];

                                    if (data) {
                                        for (i in data) {
                                            instData.set(i, data[i]);
                                        }
                                    }
                                    instData.set('installationId', instid);
                                    var appId;
                                    if (typeof BuildInfo !== 'undefined') {
                                        appId = BuildInfo.packageName || BuildInfo.basePackageName;
                                        if (BuildInfo.installDate) {
                                            instData.set('installDate', BuildInfo.installDate);
                                        }
                                        if (BuildInfo.version) {
                                            instData.set('buildVersion', BuildInfo.version);
                                        }

                                    }

                                    appId = appId || cfg.appId || cfg.appIdentifier || 'pro.businessbox.boxShell';

                                    instData.set('appIdentifier', appId);
                                    if (typeof device !== 'undefined') {
                                        instData.set('deviceType', device.platform.toLowerCase());
                                        instData.set('version', device.version);
                                        instData.set('manufacturer', device.manufacturer);
                                        instData.set('model', device.model);
                                    }

                                    instData.set('appBuild', cfg.build);

                                    return Parse.User.currentAsync()
                                        .then(function (user) {
                                            if (user) {
                                                instData.set('user', user);
                                            }
                                            return instData.save()
                                                .then(function () {
                                                    return Framework7.localStorage.setItem('updated', (new Date()).toString());
                                                }, function (err) {
                                                    // save error ?
                                                    Framework7.log(err);
                                                })
                                                .then(function () {
                                                    if (!idt) {
                                                        return Framework7.localStorage.setItem('installed', (new Date()).toString());
                                                    }
                                                })
                                                .then(function () {
                                                    return instid;
                                                });
                                        });

                                });
                        });

                });
        }
    },
    static: {
        sessionId: appSession,
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
        file: {
            removeDirectory: function (path) {
                return new Promise(function (resolve, reject) {
                    var rpt = path.indexOf(cordova.file.dataDirectory) === 0 ? path : cordova.file.dataDirectory + path;
                    window.resolveLocalFileSystemURL(rpt,
                        function (fileEntry) {
                            if (fileEntry && typeof fileEntry.removeRecursively === 'function') {
                                Framework7.log('starting purge dir:' + path);
                                fileEntry.removeRecursively(resolve, resolve);
                            } else {
                                resolve(false);
                            }

                        }, function (err) {
                            Framework7.log('failing purge dir:' + path, err);
                            return resolve(false);
                        });
                });
            },
            listDirectory: function (path) {
                return new Promise(function (resolve, reject) {
                    window.resolveLocalFileSystemURL(path,
                        function (fileSystem) {
                            if (fileSystem && (typeof fileSystem.createReader === 'function')) {
                                fileSystem.createReader().readEntries(resolve, reject);
                            } else {
                                reject();
                            }
                        }, reject
                    );
                });
            },
            createDir: function (path, name, replace) {
                return new Promise(function (resolve, reject) {
                    window.resolveLocalFileSystemURL(path, function (fileSystem) {
                        fileSystem.getDirectory(name, { create: true, exclusive: !!replace }, resolve, reject);
                    }, reject);
                });
            },
            copyDir: function (path, newPath, newDirName) {
                newDirName = newDirName || dirName;
                return new Promise(function (resolve, reject) {
                    window.resolveLocalFileSystemURL(path, function (dirEntry) {
                        if (!dirEntry || !dirEntry.isDirectory) {
                            return reject('invalid source directory');
                        }
                        window.resolveLocalFileSystemURL(newPath, function (newDirEntry) {
                            dirEntry.copyTo(newDirEntry, newDirName, resolve, reject);
                        }, reject);

                    }, reject);
                });
            },
            resolveLocalFileSystemURL: function (path) {
                return new Promise(function (resolve, reject) {
                    window.resolveLocalFileSystemURL(path, resolve, reject);
                });
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
        },
        _error_code_processed: [101, 100, 1, 107, 124, 119, 209],
        error: function (err, options) {
            if (!err) {
                return Promise.resolve(false);
            }
            options = options || {};

            if (err.code === 101) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bug color-red"></i>',
                    text: err.message,
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return options.keepError ? Promise.reject(err) : Promise.resolve(true);
            }

            if (err.code === 100) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bug color-red"></i>',
                    text: 'Connection may be temporarily down, please try again later',
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return options.keepError ? Promise.reject(err) : Promise.resolve(true);
            }
            if (err.code === 1 || err.code === 101 || err.code === 107) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bug color-red"></i>',
                    text: 'Service may be temporarily unavailable, please try again later',
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return options.keepError ? Promise.reject(err) : Promise.resolve(true);
            }
            if (err.code === 124) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bug color-red"></i>',
                    text: 'Service is busy, please try again later',
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return Promise.resolve(true);
            }
            if (err.code === 119) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bun color-red"></i>',
                    text: 'Operation is forbidden',
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return options.keepError ? Promise.reject(err) : Promise.resolve(true);
            }
            if (err.code === 209) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bun color-red"></i>',
                    text: 'Session expired, please re-login',
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return Promise.resolve(true);
            }
            return options.keepError ? Promise.reject(err) : Promise.resolve(false);
        },
        report: function (ex, showToUser) {
            if (typeof ex === 'undefined' || ex === null) {
                return;
            }
            if (showToUser && (ex.message || ex.err) && app && app.toast) {
                app.toast.create({
                    timeout: 30000,
                    icon: '<i class="fa fa-bug"></i>',
                    message: ex.message || ex.err
                })
                    .open();
            }
            if (ex instanceof Error) {
                try {
                    TraceKit.report(ex);
                } catch (ex1) {
                    if (ex !== ex1) {
                        throw ex1;
                    }
                }
            } else {
                if (typeof ex === 'string' || ex instanceof String) {
                    ex = { message: ex };
                }
                _reportTrace(ex);
            }
        },
        analitycs: function (name, dimensions, localStore) {

            return Parse.User.currentAsync()
                .then(function (usr) {
                    var key = "analitycs",
                        user = usr ? usr.id : false;

                    dimensions = dimensions || {};
                    dimensions.sessionId = boxModule.static.sessionId;
                    dimensions.registered = (new Date()).toString();
                    if (user) {
                        dimensions.user = user;
                    }

                    return Framework7.localStorage.getItem(key)
                        .then(function (lri) {
                            var tst = lri || {};
                            tst[name] = tst[name] || [];

                            tst[name].push(dimensions);
                            if (localStore || !app || !app.initialized) {
                                return Framework7.localStorage.setItem(key, tst);
                            }
                            return appDb.getItem(key)
                                .then(function (rzs) {
                                    var postData = {},
                                        cntr = 0,
                                        i,
                                        ri = rzs || {};

                                    for (i in lri) {
                                        ri[i] = ri[i] || [];
                                        ri[i] = ri[i].concat(lri[i]);
                                        postData[i] = JSON.stringify(ri[i]);
                                        cntr = cntr + postData[i].length;
                                    }

                                    if (!app.onLine || (cntr < 1024)) {
                                        return appDb.setItem(key, ri);
                                    }
                                    return app.syncInstallation()
                                        .then(function () {
                                            return Parse.Analytics.track('bulk', postData);
                                        })
                                        .then(function () {
                                            return Promise.all([Framework7.localStorage.removeItem(key),
                                            appDb.removeItem(key)]);
                                        })
                                        .catch(function () {
                                            return Promise.all([Framework7.localStorage.removeItem(key),
                                            appDb.setItem(key, ri)]);
                                        });
                                });
                        });
                });
        }

    },
    on: {
        init: function () {
            var self = this;
            if ((typeof StatusBar !== 'undefined') &&
                (typeof StatusBar.hide === 'function')) {
                StatusBar.hide();
            }

            Promise.resolve()
                .then(function () {
                    if (self.params && self.params[boxModule.name] && self.params[boxModule.name].database) {
                        return Parse.Database._initCollections(self.params[boxModule.name].database);
                    }
                })
                .then(function () {
                    if ((self.params && !self.params.keepSplashScreen) &&
                        navigator.splashscreen && (typeof navigator.splashscreen.hide === 'function')) {
                        navigator.splashscreen.hide();
                    }
                    self.emit('ignited');
                });

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

    window.onunhandledrejection = function (e) {
        if (_inDebug()) {
            debugger;
        }
        Framework7.log('unhandled rejection', e);
        _reportTrace(e);
    };

    TraceKit.report.subscribe(_reportTrace);

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

            if (Framework7.prototype.modules[resp.appId] && Framework7.prototype.modules[resp.appId].routes) {
                pInst.routes = Framework7.prototype.modules[resp.appId].routes;
                delete Framework7.prototype.modules[resp.appId].routes;
            }

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
                    if (resp.database) {
                        return Parse.Database.configure(resp.database);
                    }
                })
                .then(function () {
                    if (resp.noConfig) {
                        return Promise.resolve();
                    }
                    return Parse.Config.get()
                        .then(function (cf) {
                            return cf;
                        },
                            function (er) {
                                return Parse.Config.current();
                            })
                        .then(function (cc) {
                            Framework7.utils.extend(pInst, cc.attributes);
                        });
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

Framework7.use(boxModule);

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