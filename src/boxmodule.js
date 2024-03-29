var app,
    appSession,
    _lg = 0,
    traceUrl,
    __currentTouches = {},
    __eventTouchNames = { touchstart: 'touchstart', touchend: 'touchend' },
    __promisesPromises = {};

if (window.navigator.msPointerEnabled) {
    __eventTouchNames = { touchstart: 'MSPointerDown', touchend: 'MSPointerUp' };
}

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
        return (Parse.CoreManager.getStorageController().async ?
            Parse.Storage.getItemAsync(key) :
            Promise.resolve(Parse.Storage.getItem(key)))
                .then(function (ri) {
                    return ri ? JSON.parse(ri) : ri;
                });
    },
    setItem: function (key, val) {
        if (Parse.CoreManager.getStorageController().async) {
            return Parse.Storage.setItemAsync(key, JSON.stringify(val));
        }
        Parse.Storage.setItem(key, JSON.stringify(val));
        return Promise.resolve();
    },
    removeItem : function (key) {
        if (Parse.CoreManager.getStorageController().async) {
            return Parse.Storage.removeItemAsync(key);
        }
        Parse.Storage.removeItem(key);
        return Promise.resolve();
    },
    _clear : function () {
        if (Parse.CoreManager.getStorageController().async) {
            return Parse.Storage._clear();
        }
        Parse.Storage._clear();
        return Promise.resolve();
    }
};

function hasFirebasePlugin(name, fct) {
    return (typeof cordova.plugins != 'undefined') &&
    (typeof cordova.plugins.firebase != 'undefined') &&
    (typeof cordova.plugins.firebase[name] != 'undefined') &&
    (!fct || (typeof cordova.plugins.firebase[name][fct] == 'function'))
}

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


function _reportTrace(stackInfo, stack) {
    if (hasFirebasePlugin('crashlytics', 'logError')) {
        console.log('logged:');
        console.log(stackInfo);
        console.log(stack);
        return cordova.plugins.firebase.crashlytics.logError(stackInfo);
    }
    if (window.FirebasePlugin && (typeof window.FirebasePlugin.logError === 'function')) {
        window.FirebasePlugin.logError(stackInfo, stack, function(){
            console.log('logged:');
            console.log(stackInfo);
            console.log(stack);
        },function(error){
            console.log('failed logging:', error);
            console.log(stackInfo);
            console.log(stack);
        });
        return;
    }

    return Framework7.isTraceEnabled()
        .then(function (rd) {
            if (rd) {
                _reportTrace_int(stackInfo, stack);
            }
        });
}

/**
* 
* 
* @param {any} stackInfo
*/
function _reportTrace_int(stackInfo) {

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

function _debounceFunction(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};

function _throttleFunction(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    if (!options) options = {};
    var later = function() {
      previous = options.leading === false ? 0 : Date.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    };
    return function() {
      var now = Date.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

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
    return (typeof device !== 'undefined') && (device.isVirtual || device.platform === 'browser');
}

var _hasi18n = false;

if (typeof i18next !== 'undefined') {
    _hasi18n = true; 
    Framework7.Template7.registerHelper('i18n', function (key, options) {
        return i18next.t(key) || key;
    });
    Framework7.Template7.registerHelper('i18np', function (key, count, options) {
        return i18next.t(key, { count: count || 1 }) || key;
    });
    Framework7.Template7.registerHelper('i18nc', function (key, context, options) {
        return i18next.t(key, { context: context || 'male' }) || key;
    });
    Framework7.Template7.registerHelper('i18ncp', function (key, context, count, options) {
        return i18next.t(key, { context: context || 'male', count: count || 1 }) || key;
    });
}

var imgLoadH = {},
    boxModule = {
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
        imageToCacheSrc : function(srctxt, key) {
            return (srctxt|| '').replace(/<img([^>]*)\ssrc=(['"])(https:\/\/)([^\2]+)\2/gi, "<img$1 data-img-key=\""+ (key || 'idk' + Framework7.utils.id()) + "\" onerror=\"app.imageError(this)\" onload=\"app.cacheImage(this)\" src=$2https://$4$2");
        },
        fetchImageLocal : function (isrc, localPath) {
            var self = this;
            return Promise.resolve(isrc); // disabled
            if (device && device.platform === 'browser') {
                return Promise.resolve(isrc);
            }

            imgLoadH[isrc] = true;
            console.log('trying to cache local image:' + isrc);
            return fetch(Parse.serverURL + 'proxy/' + isrc, {method : 'GET'})
                .then(function (resp) {
                    return resp.blob();
                })
                .then(function (rd) {
                    var fn = localPath || isrc.split('/').slice(-4).join('_');

                    if (!rd || !rd.size) {
                        return;
                    }
                    return Framework7.file.writeFile(fn, rd)
                        .then(function (agff) {
                            ///var lcn = agff.toInternalURL();
                            var lcn =  Framework7.device.ios && (typeof window.webkit != 'undefined') ? agff.toURL().replace('file://','/_app_file_') : 
                                    agff.toInternalURL();
                            console.log('cached image to:' + lcn);
                            delete imgLoadH[isrc];
                            self.emit('imageFetched', isrc, lcn);
                            return lcn;
                        });
                })
                .catch(function () {
                    delete imgLoadH[isrc];
                    // just ignore ?
                });
        },
        cacheImage : function (img) {
            var self = this,
                $del =  Dom7(img),
                vs = $del.attr('src'),
                ds = $del.dataset();
            
            if ((vs||'').toLowerCase().indexOf('http')!==0) {
                return;
            }
            self.emit('imageLoaded', img, ds);
            if (!imgLoadH[vs]) {
                imgLoadH[vs] = true;
                ds.src = vs;
                this.fetchImageLocal(vs, ds.filename? ds.imgKey +'_' + ds.filename : null)
                .then(function(localPath) {
                    if (!localPath || (localPath === ds.src)) {
                        return;
                    }
                    ds.path = localPath;
                    self.emit('imageCached', img, ds);
                })
            }
        },
        pageToLocalImages :function (src, pageId) {
            var sel = this;
            if(!src || !src.length) {return;}

            return Promise.all(src.map(function(fi) {
                    return sel.fetchImageLocal(fi)
                            .then(function(rz) {
                                return {ls :fi , path : rz};
                            })
                }))
                .then(function(rz) {
                    return Parse.Database.local.get(pageId)
                            .then(function(rr) {
                                rz.forEach(function(vv) {
                                    if(vv.path && (vv.path!== vv.ls)) {
                                        rr.page = rr.page.replace(new RegExp(vv.ls, 'gi'),vv.path);
                                    }
                                });
                                return Parse.Database.local.save(pageId, rr)
                                    .then(function () {
                                        sel.clearPageData(pageId);
                                    });
                            });
                });
        },
        imageError : function (img) {
            Dom7(img).hide();
            this.emit('imageError', img);
        },
        registerPushNotifications() {
            if (!hasFirebasePlugin('messaging', 'requestPermission')) {
                return this.registerPushNotificationsFbPlugin();
            }
            var _pushRequested;
            return Parse.Storage.getItemAsync('box.pushnotifications')
               .then(function (pushRequested) {
                   _pushRequested = pushRequested;
                   return new Promise(function (resolve, reject) {
                       
                        cordova.plugins.firebase.messaging.requestPermission({forceShow: true})
                        .then(function(){
                            if (!hasFirebasePlugin('messaging', 'requestPermission')) {
                                return resolve(true);
                            }
                            return cordova.plugins.firebase.messaging.getToken()
                                .then(function (fcmToken) {
                                    return self.syncInstallation({ deviceToken: fcmToken })
                                        .then(function () {
                                            resolve(true);
                                        })
                                }, function () {
                                        return resolve(true);
                                });
                            }, function () {
                                return resolve(false);
                            }); 
                       
                   });
               })
               .then(function (enbl) {
                   if (!enbl) {
                       return enbl;
                   }
                   if (hasFirebasePlugin('messaging', 'onTokenRefresh')) {
                        cordova.plugins.firebase.messaging.onTokenRefresh(function() {
                            return cordova.plugins.firebase.messaging.getToken()
                                .then(function (fcmToken) {
                                    return self.syncInstallation({ deviceToken: fcmToken })
                                        .then(function () {
                                            resolve(true);
                                        })
                                }, function () {
                                        return resolve(true);
                                });
                        });
                   }
                  
                   if (hasFirebasePlugin('messaging','onMessage')) {
                    cordova.plugins.firebase.messaging.onMessage(function(payload) {
                        self.receivedPushNotification(payload);
                    });
                   }
                   if (hasFirebasePlugin('messaging','onBackgroundMessage')) {
                    cordova.plugins.firebase.messaging.onBackgroundMessage(function(payload) {
                        self.receivedPushNotification(payload);
                    });
                   }
                   return true;
               })
               .then(function (rt) {
                   if (!_pushRequested) {
                       Parse.Storage.setItemAsync('box.pushnotifications', (new Date()).toString());
                   }
                   return rt;
               });
        },
        registerPushNotificationsFbPlugin: function () {
            var self = this;

            if (typeof PushNotification === 'undefined') {
                if (typeof window.FirebasePlugin=== 'undefined' ) {
                    return Promise.resolve(false)
                 }
                 var _pushRequested;
                 return Parse.Storage.getItemAsync('box.pushnotifications')
                    .then(function (pushRequested) {
                        _pushRequested = pushRequested;
                        return new Promise(function (resolve, reject) {
                            window.FirebasePlugin.hasPermission(function(hasPerm) {
                                if (hasPerm) {
                                    return resolve(true);
                                 }
                                window.FirebasePlugin.grantPermission(function(hasPermission){
                                    if (!hasPermission) {
                                        return resolve(false);
                                    }
                                    window.FirebasePlugin.getToken(function (fcmToken) {
                                        self.syncInstallation({ deviceToken: fcmToken })
                                            .then(function () {
                                                resolve(true);
                                            })
                                    });
                                }); 
                            });
                        });
                    })
                    .then(function (enbl) {
                        if (!enbl) {
                            return enbl;
                        }
                        window.FirebasePlugin.setAutoInitEnabled(true);
                        window.FirebasePlugin.onTokenRefresh(function (fcmToken) {
                            self.pushNotificationRegistered({registrationId : fcmToken});
                        });
                        
                        if (typeof window.FirebasePlugin.onMessageReceived === 'function') {
                            window.FirebasePlugin.onMessageReceived(self.receivedPushNotification.bind(self));
                        }
                        return true;
                    })
                    .then(function (rt) {
                        if (!_pushRequested) {
                            Parse.Storage.setItemAsync('box.pushnotifications', (new Date()).toString());
                        }
                        return rt;
                    });
            }

            if (this.pushController) {
                return Promise.resolve(true);
            }
           
            return Parse.Storage.getItemAsync('box.pushnotifications')
                .then(function (pushRequested) {
                    return new Promise(function (resolve, reject) {
                        PushNotification.hasPermission(function (data) {
                            if (!pushRequested || data.isEnabled) {
                                self.pushController = PushNotification.init({
                                    android: {},
                                    ios: {
                                        alert: true,
                                        badge: true
                                    },
                                    browser: {}
                                });


                                self.pushController.on('registration', self.pushNotificationRegistered.bind(self));
                                self.pushController.on('notification', self.receivedPushNotification.bind(self));
                                self.pushController.on('error', function (err) {
                                    if (app) {
                                        app.report(err);
                                    }
                                });
                                if (!pushRequested) {
                                    Parse.Storage.setItemAsync('box.pushnotifications', (new Date()).toString());
                                }
                                //   self._pushNotificationSync();
                                app.emit('push.inited', data.isEnabled);
                                return resolve(data.isEnabled);
                            }
                            return resolve(false);
                        });
                    });
                });

        },
        pushNotificationRegistered: function (data) {
            var self = this;
            return appDb.getItem('box.pushRegId')
                .then(function (lastRegId) {
                    Framework7.log('push reg', data);
                    if (data &&
                        data.registrationId &&
                        lastRegId !== data.registrationId) {

                        return self.syncInstallation({ deviceToken: data.registrationId })
                            .then(function () {
                                // TODO: on error fail to register push, retry ?
                                self.emit('push.registered', data);
                                return appDb.setItem('box.pushRegId', data.registrationId);
                            });
                    }
                    self.emit('push.registered', data);
                    return data;
                });

        },
        unregisterPushNotification : function () {
            if (hasFirebasePlugin('messaging', 'deleteToken')) {
                cordova.plugins.firebase.messaging.deleteToken();
                return;
            }
            if (window.FirebasePlugin && (typeof window.FirebasePlugin.setAutoInitEnabled ==='function')) {
                window.FirebasePlugin.setAutoInitEnabled(false, function(){
                    app.syncInstallation({ deviceToken: null })
                    .then(function () {
                        window.FirebasePlugin.unregister();
                        app.emit('push.unregistered');
                        appDb.removeItem('box.pushRegId');
                    });
                   
                });
                return Promise.resolve();
            }
            if (app && app.pushController) {
                app.pushController.unregister(function () {
                    appDb.removeItem('box.pushRegId')
                        .then(function () {
                            delete app.pushController;
                            app.syncInstallation({ deviceToken: null });
                            app.emit('push.unregistered');
                        })
                }, function () {});
            }
        },
        setBadgeNumber : function (nr) {
            var self = this;
            console.log('setting badge number to:' + nr);
            if (hasFirebasePlugin('messaging','setBadge')) {
                return cordova.plugins.firebase.messaging.setBadge(nr);
            }

            if (self.pushController && self.pushController.setApplicationIconBadgeNumber) {
                self.pushController.setApplicationIconBadgeNumber(_closeNotification, _closeNotification, nr);
            } else if (!!window.FirebasePlugin && typeof window.FirebasePlugin.setBadgeNumber === 'function') {

                if (window.FirebasePlugin.hasPermission) {
                    window.FirebasePlugin.hasPermission(function (hasPermission ) {
                        if (!hasPermission) {
                            window.FirebasePlugin.grantPermission(function (hasPermission) {
                                if (!hasPermission) {
                                    return;
                                }
                                window.FirebasePlugin.setBadgeNumber(nr);
                            })

                        } else {
                            window.FirebasePlugin.setBadgeNumber(nr);
                        }
                    }); 
                } else {
                    window.FirebasePlugin.setBadgeNumber(nr);
                }
            }
            return Promise.resolve();
        },
        getBadgeNumber : function () {
            var self = this;
            if (hasFirebasePlugin('messaging','getBadge')) {
               return  cordova.plugins.firebase.messaging.getBadge(nr);
            }
            return new Promise(function (resolve, reject) {
                if (self.pushController && self.pushController.getApplicationIconBadgeNumber) {
                    self.pushController.getApplicationIconBadgeNumber(function (cnt) {
                        resolve(cnt||0);
                    });
                } else if (!!window.FirebasePlugin && typeof window.FirebasePlugin.getBadgeNumber === 'function') {
                    window.FirebasePlugin.getBadgeNumber(function (cnt) {
                        resolve(cnt||0);
                    });
                }
            });
        },
        receivedPushNotification: function (data) {
            var self = this,
                title, body;

            data = data || {};
            console.log('received push notification' + JSON.stringify(data));
            Framework7.log('push received', data);
            if(data.title){
                title = data.title;
            }else if(data.notification && data.notification.title){
                title = data.notification.title;
            }else if(data.aps && data.aps.alert && data.aps.alert.title){
                title = data.aps.alert.title;
            } else if (data.data && data.data.notification_title) {
                title = data.data.notification_title;
            }

            if(data.body){
                body = data.body;
            } else if(data.notification && data.notification.body){
                body = data.notification.body;
            } else if(data.aps && data.aps.alert && data.aps.alert.body){
                body = data.aps.alert.body;
            } else if (data.data && data.data.notification_body) {
                body = data.data.notification_body;
            }

            if ((title || body) && !(data.show_notification==='false' || data.show_notification === false)) {
                self.notification.create({
                    icon: '<i class="fa fa-bell"></i>',
                    title: self.name,
                    titleRightText: Framework7.i18n.t('now'),
                    subtitle: title || '',
                    text: body,
                    closeTimeout: 15000,
                }).open();
            }

            if (data.apns && data.apns.payload && data.apns.payload.aps) {
                data.count = data.count || (data.apns.payload.aps.badge || 0);
            }
            if (data.data && data.data.notification_ios_badge) {
                data.count =  data.count || data.data.notification_ios_badge;
            }

            data.count = parseInt(data.count) || 0;
            self.emit('push.received', data);
            return self.setBadgeNumber(data.count)
                .then(function () {
                    return app.syncInstallation({badge : count});
                })
                .then(function () {
                    if (data.additionalData &&
                        data.additionalData.openUrl) {
                        tsp = data.additionalData.openUrl.split(':');
                        toOpen.url = tsp[1];
        
                        toOpen.route = {};
                        toOpen.route[tsp[0]] = tsp[1];
        
                        app.view.current.router.navigate(toOpen, { hash: "top", context: data.additionalData });
                        data.additionalData.processed = true;
                    }
                });
            

        },
        setPushNotificationBadge : function (count) {
            return appDb.getItem('box.pushRegId').then(function (tz) {
                return !tz?  false : app.setBadgeNumber(count)
                    .then(function () {
                        return app.syncInstallation({badge : count});
                    });
            });
        },
        isPushRegistered : function () {
            return appDb.getItem('box.pushRegId').then(function (tz) {
                return !!tz;
            })
        },
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
                                            if (typeof data[i] === 'undefined') { 
                                                instData.unset(i);
                                            } else {
                                                instData.set(i, data[i]);
                                            }
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

                                    } else {
                                        appId = cfg.package;
                                        if (cfg.buildVersion) {
                                            instData.set('buildVersion', cfg.buildVersion);
                                        }
                                    }

                                    appId = appId ||  cfg.appId || cfg.appIdentifier || 'pro.businessbox.boxShell';

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
        _inDebug : _inDebug,
        ui: {
            scrollPageTo: function (scrollTo, container, tout) {
                if (typeof container === 'number') {
                    tout = container;
                    container = false;
                }
                tout = tout || 600;
                container = container || app.$('.page-current .page-content');
                if (!scrollTo) {
                    container.scrollTop(0, tout);
                    return;
                }

                if (typeof scrollTo.offset !== 'function') {
                    scrollTo = container.find(scrollTo);
                }

                container.scrollTop(scrollTo.offset().top - container.offset().top + container.scrollTop(), tout);
            }
        },
        i18n: {
            t : function (key, options) {
                return _hasi18n ? i18next.t(key, options) : key;
            },
            changeLanguage : function (lng) {
                return _hasi18n ? i18next.changeLanguage(lng) : Promise.resolve();
            },
            language : function () {
                return _hasi18n ? i18next.language : undefined;
            }
        },
        localStorage: {
            getItem: function (ck) {
                var vp = localStorage.getItem(ck);
                return Promise.resolve(vp ? JSON.parse(vp): vp);
            },
            setItem: function (ck, vl) {
                localStorage.setItem(ck, JSON.stringify(vl));
                return Promise.resolve();
            },
            removeItem: function (ck) {
                localStorage.removeItem(ck);
                return Promise.resolve();
            }
        },
        file: {
            upload : function (imageUri, options, onProgresscb ) {
                return new Promise(function (resolve, reject) {
                    window.resolveLocalFileSystemURL(imageUri, function (file) {
                        var ctp = 'application/octet-stream',
                         oupl = {
                            role: 'attachment',
                            name: file.name
                        };
                        options = options || {};
                       Framework7.utils.extend(oupl, options.data || {});

                       if (!oupl.contentType) {
                            var ext =   file.name.split('.').pop().toLowerCase();
                            if (['jpg','png','jpeg'].indexOf(ext) !== -1) {
                                ctp = 'image/' + ext;
                            }
                            oupl.contentType = ctp;
                       }
                       return Parse.Cloud.run('createPresignedPost', oupl)
                        .then(function (sgData) {
                            var po;
                            if (sgData.file) {
                                sgData.file.className = sgData.file.className || 'Files';
                                po = Parse.Object.fromJSON(sgData.file);
                            }
                            
                            return Framework7.file._upload(file, 
                                    {data : sgData.fields, 
                                    url : sgData.url,
                                    mimeType : oupl.contentType}, onProgresscb)
                                .then(function (ri) {
                                    return new Promise(function (resolve, reject) {
                                        file.getMetadata(function (meta) {
                                            if (meta.lastModifiedDate) {
                                                po.set('lastModifiedDate', meta.lastModifiedDate);
                                            }
                                            if (meta.modificationTime) {
                                                po.set('lastModifiedDate', meta.modificationTime);
                                            }
                                            if (meta.size) {
                                                po.set('size', meta.size);
                                            }
                                            if (sgData.fields.ACL === 'public-read') {
                                                po.set('url', sgData.url + '/' + sgData.fields.key);
                                            }
                                            if (options.extra) {
                                                for(var vkk in options.extra) {
                                                    po.set(vkk, options.extra[vkk]);
                                                }
                                            }
                                            return po.save().then(resolve,reject);
                                        }, reject);
                                    });
                                  
                                })
                                .then(resolve, reject);
                        })
                        .catch(reject);
                    }, reject);
                });
                
            },
            _upload: function (fileEntry, options, onProgresscb) {
                if (!fileEntry || typeof fileEntry.file !== 'function') {
                    return Promise.reject({ message: 'FileEntry parameter missing' });
                }
                options = options || {};
                options.mimeType = options.mimeType || 'application/octet-stream';
                options.headers = options.headers || {};
                options.data = options.data || {};
             
                options.url = options.url || (Parse.serverURL + 'storage/upload');
    
                return new Promise(function (resolve, reject) {
                    fileEntry.file(function (file) {
                            var reader = new FileReader();
    
                            reader.onloadend = function () {
                                 var blob = new Blob([new Uint8Array(this.result)], { type: options.mimeType }),
                                    formData = new FormData();
                              
                                for (var hdr in options.data) {
                                    formData.append(hdr, options.data[hdr]);
                                }
                                formData.append('file', blob, fileEntry.name);

                                var vq = new app.modules.request.proto.request({url : options.url, 
                                    method : 'POST',
                                    data : formData,
                                    processData  : true,
                                    crossDomain : true,
                                    contentType : options.contentType  || 'multipart/form-data',
                                    success : function (fr) {
                                        resolve(fr);
                                    },
                                    error : function (err) {
                                        reject(err);
                                    }
                                    });

                                if (vq.upload && onProgresscb) {
                                    if (typeof vq.upload.onprogress !== 'undefined') {
                                        vq.upload.onprogress = function (evt) {
                                            if (evt.lengthComputable) {
                                                onProgresscb(evt.loaded, evt.total, Math.floor((evt.loaded / evt.total) * 100));
                                            }
                                        };
                                    } else {
                                        vq.upload.addEventListener('progress', function (evt) {
                                            if (evt.lengthComputable) {
                                                onProgresscb(evt.loaded, evt.total, Math.floor((evt.loaded / evt.total) * 100));
                                            }
                                        }, false);
                                    }
                                }
                                if (!vq.upload && onProgresscb) {
                                    onProgresscb(-1);
                                }
                            };
                            reader.readAsArrayBuffer(file);
                       
                    }, reject);
                });
            },
            useFs: false,
            // https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFlags 
            writeFile: function (path, data, options) {
                var prq = Framework7.utils.extend({
                    rootFs: cordova.file.dataDirectory,
                    create: true, exclusive: false, append: false
                }, options || {});

                return new Promise(function (resolve, reject) {
                    window.resolveLocalFileSystemURL(prq.rootFs, function (dentry) {
                        Promise.resolve()
                            .then(function () {
                                if (path.indexOf('/') === -1) {
                                    return dentry;
                                }
                                return Framework7.file.createDir(prq.rootFs, path.slice(0, path.lastIndexOf('/')));
                            })
                            .then(function (dirEntry) {
                                dirEntry.getFile(path.slice(path.lastIndexOf('/') + 1),
                                    { create: prq.create, exclusive: prq.exclusive },
                                    function (fileEntry) {
                                        fileEntry.createWriter(function (fileWriter) {
                                            fileWriter.onwriteend = function () {
                                                return resolve(fileEntry);
                                            };
                                            fileWriter.onerror = reject;
                                            if (prq.append) {
                                                try {
                                                    fileWriter.seek(fileWriter.length);
                                                }
                                                catch (e) {

                                                }
                                            }
                                            if (typeof data === 'string' || data instanceof String) {
                                                data = new Blob([data], { type: 'text/plain' });
                                            }
                                            fileWriter.write(data);
                                        }, reject);
                                    }, reject);
                            });
                    });
                });
            },
            getContent: function (path, options) {
                return new Promise(function (resolve, reject) {
                    var prq;
                    if (Framework7.file.useFs && 
                        ((typeof device === 'undefined') || (device && device.platform !== 'browser')) ) {
                        
                            prq = Framework7.utils.extend({ rootFs: cordova.file.dataDirectory, readAs: 'text' }, options || {});

                            window.resolveLocalFileSystemURL(prq.rootFs, function (dentry) {
                                Promise.resolve()
                                    .then(function () {
                                        if (prq.rootFs === cordova.file.applicationDirectory) {
                                            path = 'www/' + path;
                                        }
                                        if (path.indexOf('/') === -1) {
                                            return dentry;
                                        }
                                        return new Promise(function (pir, prj) {
                                            dentry.getDirectory(path.slice(0, path.lastIndexOf('/')), { exclusive: false }, pir, prj);
                                        });
                                    })
                                    .then(function (den) {
                                        den.getFile(path.slice(path.lastIndexOf('/') + 1),
                                            { exclusive: false },
                                            function (fen) {
                                                fen.file(function (file) {
                                                    var reader = new FileReader();
                                                    reader.onloadend = function () {
                                                        var result = this.result;
                                                        if (prq.readAs === 'json') {
                                                            if (window.TextDecoder) {
                                                                const enc = new TextDecoder('utf-8');
                                                                result = JSON.parse(enc.decode(new Uint8Array(result)));
                                                              } else if(String.fromCharCode) {
                                                                result = JSON.parse(String.fromCharCode.apply(null, new Uint8Array(result)));
                                                              } else {
                                                                result = JSON.parse(result);
                                                              }
                                                            
                                                        }
                                                        return resolve(result);
                                                    };
                                                    reader.onerror = reject;
                                                    if ((prq.readAs === 'text') 
                                                    // || (prq.readAs === 'json')
                                                    ) {
                                                        reader.readAsText(file);
                                                    } else if ((prq.readAs === 'array') || (prq.readAs === 'json')) {
                                                        reader.readAsArrayBuffer(file);
                                                    } else if (prq.readAs === 'url') {
                                                        reader.readAsDataURL(file);
                                                    } else {
                                                        reader.readAsBinaryString(file);
                                                    }
                                                });
                                            }, reject);
                                    });
                            }, reject);
                       
                    } else {
                        prq = Framework7.utils.extend({
                            url: path,
                            method: 'GET', dataType: 'json', cache: false,
                            success: resolve,
                            error: reject
                        }, options || {});

                        Framework7.request(prq);
                    }
                });
            },
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
                    window.resolveLocalFileSystemURL(path, function (dirEntry) {
                        var dirs = name.split("/").reverse(),
                            root = dirEntry;

                        var cDir = function (dir) {
                            root.getDirectory(dir, {
                                create: true,
                                exclusive: false
                            }, successCB, reject);
                        };
                        var successCB = function (entry) {
                            root = entry;
                            if (dirs.length > 0) {
                                cDir(dirs.pop());
                            } else {
                                resolve(entry);
                            }
                        };

                        cDir(dirs.pop());
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
                    return JSON.stringify(il && il.reason ? {message : il.reason.message,stack : il.reason.stack } : il);
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
                    text: Framework7.i18n.t('errors.connectiondown'),
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return options.keepError ? Promise.reject(err) : Promise.resolve(true);
            }
            if (err.code === 1 || err.code === 101 || err.code === 107) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bug text-color-red"></i>',
                    text: Framework7.i18n.t('errors.servicedown'),
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return options.keepError ? Promise.reject(err) : Promise.resolve(true);
            }
            if (err.code === 124) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bug color-red"></i>',
                    text: Framework7.i18n.t('errors.servicebusy'),
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return Promise.resolve(true);
            }
            if (err.code === 119) {
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bun color-red"></i>',
                    text: Framework7.i18n.t('errors.opperationForbiden'),
                    closeOnClick: true,
                    closeTimeout: 5000
                }).open();
                return options.keepError ? Promise.reject(err) : Promise.resolve(true);
            }
            if (err.code === 209) {
                //TODO : reloghin !! 
                app.notification.create({
                    title: app.name,
                    icon: '<i class="fa fa-bun color-red"></i>',
                    text: Framework7.i18n.t('errors.sessionExpired'),
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
            if ((ex instanceof Error) && (typeof TraceKit !== 'undefined')) {
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
        isTraceEnabled : function() {
            return Framework7.localStorage.getItem('traceEnabled');
        },
        setTraceEnabled : function (vl) {
            return Framework7.localStorage.setItem('traceEnabled', !!vl)
                .then(function () {
                    if (hasFirebasePlugin('analytics', 'setEnabled')) {
                       return cordova.plugins.firebase.analytics.setEnabled(!!vl);
                    }

                    if ((typeof window.FirebasePlugin !== 'undefined') && 
                    (typeof window.FirebasePlugin.setAnalyticsCollectionEnabled === 'function')) {
                        window.FirebasePlugin.setAnalyticsCollectionEnabled(!!vl);
                    }

                })
        },
        analitycs: function (name, dimensions, localStore) {
            if (name === 'AppOpened') { 
                return Promise.resolve(); // no need
            }

            if (hasFirebasePlugin('analytics', 'logEvent')) {
                return Framework7.isTraceEnabled()
                    .then(function (y) {
                        if (!y) {
                            return;
                        }
                        return Parse.User.currentAsync()
                            .then(function (usr) {

                                if (usr &&  usr.id && (hasFirebasePlugin('analytics', 'setUserId'))) {
                                    cordova.plugins.firebase.analytics.setUserId(usr.id);
                                }
                                if (hasFirebasePlugin('analytics','setCurrentScreen') && dimensions && (dimensions.title || dimensions.name)) {
                                    cordova.plugins.firebase.analytics.setCurrentScreen(dimensions.title  || dimensions.name);
                                }

                                cordova.plugins.firebase.analytics.logEvent(name, dimensions);
                            });
                      
                    });
            }

            if ((typeof window.FirebasePlugin !=='undefined') && 
               (typeof window.FirebasePlugin.logEvent === 'function')) {

               
                return Framework7.isTraceEnabled()
                    .then(function (y) {
                        if (!y) {
                            return;
                        }
                        return Parse.User.currentAsync()
                            .then(function (usr) {

                                if (usr &&  usr.id && (typeof window.FirebasePlugin.setUserId === 'function')) {
                                    window.FirebasePlugin.setUserId(usr.id);
                                }

                                if ((typeof window.FirebasePlugin.setScreenName === 'function') && dimensions && (dimensions.title || dimensions.name)) {
                                    window.FirebasePlugin.setScreenName(dimensions.title  || dimensions.name)
                                }
        
                                if (name === 'navigate') {
                                    window.FirebasePlugin.logEvent('screen_view', { screen_name :  dimensions.title  || dimensions.name});
                                    return;
                                }
                                
                                window.FirebasePlugin.logEvent(name, dimensions);
                            });
                      
                    });
            }


            return Promise.resolve(false);
           
        },
        getFeature : function (name) {
            var fvl = app.params[app.id].features;
            return name  && fvl ? fvl[name] : fvl;
        }

    },
    clicks : {
        '.externalclick' : function ($clickedEl, data) {
            const $clickedLinkEl = $clickedEl.closest('a');
            const isLink = $clickedLinkEl.length > 0;
            const url = isLink && $clickedLinkEl.attr('href');
            if (isLink && url) {
                const target = $clickedLinkEl.attr('target');
                if (url  && window.cordova && window.cordova.InAppBrowser && (target === '_system' || target === '_blank')
                ) {
                  window.cordova.InAppBrowser.open(url, target, 'usewkwebview=yes');
                }
            }
        }
    },
    on: {
        init: function () {
            var self = this;
            if ((typeof StatusBar !== 'undefined') &&
                (typeof StatusBar.hide === 'function')) {
                StatusBar.hide();
            }
            document.addEventListener(__eventTouchNames.touchstart, function (evt) {
                var touches = evt.touches || [evt],
                    touch;
                for (var i = 0, l = touches.length; i < l; i++) {
                    touch = touches[i];
                    __currentTouches[touch.identifier || touch.pointerId] = touch;
                }
            }, false);

            document.addEventListener(__eventTouchNames.touchend, function (evt) {
                var touchCount = Object.keys(__currentTouches).length;
                __currentTouches = {};
                if (touchCount === 3 || (device && device.isVirtual && touchCount === 2)) {
                    evt.preventDefault();
                    self.emit('multitouch');
                }
            }, false);

            Promise.resolve()
                .then(function () {
                    if (self.params && self.params[boxModule.name] && self.params[boxModule.name].database) {
                        return typeof self.initDatabase === 'function' ?
                            self.initDatabase(self.params[boxModule.name].database)
                            : Parse.Database._initCollections(self.params[boxModule.name].database);
                    }
                })
                .then(function () {
                    return appDb.getItem('box.pushRegId')
                        .then(function (prg) {
                            if (prg) {
                                self.registerPushNotifications();
                            }
                        });
                })
               .then(function () {

                    Parse.User._registerAuthenticationProvider({
                        getAuthType: function () { return 'anonymous'; },
                        restoreAuthentication: function () { return true; }
                    });

                    if ((self.params && !self.params.keepSplashScreen) &&
                        navigator.splashscreen && 
                        (typeof navigator.splashscreen.hide === 'function')) {
                        navigator.splashscreen.hide();
                    }
                    self.emit('ignited');
                    Framework7.analitycs(boxModule.params.analitycs.appOpened);
                });

        },
        pageAfterIn: function (page) {
            var lr = sessionStorage.getItem('box.referrer'),
                toR = {},
                ref = page && page.route && (page.route.url || page.route.path) ? page.route.url || page.route.path : '';

            if (ref) {
                toR.url = ref;
                sessionStorage.setItem('box.referrer', ref);
            } else {
                sessionStorage.removeItem('box.referrer');
            }

            if (lr) {
                toR.referrer = lr;
            }
            if (page) {
                if(page.$navbarEl && page.$navbarEl.length) {
                    toR.title = page.$navbarEl.text();
                } else if (page.$el.find('.navbar .title').length) {
                    toR.title = page.$el.find('.navbar .title').text();
                }
                
                if(page.name) {
                    toR.name = page.name;
                }
                if (page.direction) {
                    toR.direction = page.direction;
                }
                if (page.route && !!Object.keys(page.route.params || {}).length) {
                    toR.params = page.route.params;
                }
            }

            Framework7.analitycs('navigate', toR);
        },
        searchbarSearch : _debounceFunction(function (sbar,query, previousQuery) {
            Framework7.log(query, previousQuery);
            Framework7.analitycs('search', { search_term : query});
        }, 1000)
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
    if (typeof window.addEventListener == 'function') {
        window.addEventListener('unhandledrejection', function (event) {
            var logMessage = errorMsg;
            var stackTrace = null;
            Framework7.log('unhandled error', errorMsg);
            _reportTrace(logMessage, stackTrace);
            if (typeof event.preventDefault == 'function') {
                event.preventDefault();
            }
        }); 
        window.addEventListener('error', function(errorMsg, url, line, col, error) {
                var logMessage = errorMsg;
                var stackTrace = null;
            
                Framework7.log('unhandled error', errorMsg);
                
                logMessage += ': url='+url+'; line='+line+'; col='+col;
        
                if ((typeof error === 'object') && (typeof StackTrace !== 'undefined') ){
                    StackTrace.fromError(error).then(function(trace){
                        stackTrace = trace;
                        _reportTrace(logMessage, stackTrace);
                    });
                }else{
                    _reportTrace(logMessage, stackTrace);
                }
            });
    } else {
        window.onerror = function(errorMsg, url, line, col, error) {
            var logMessage = errorMsg;
            var stackTrace = null;
          
            Framework7.log('unhandled error', errorMsg);
            
            logMessage += ': url='+url+'; line='+line+'; col='+col;
    
            if ((typeof error === 'object') && (typeof StackTrace !== 'undefined') ){
                StackTrace.fromError(error).then(function(trace){
                    stackTrace = trace;
                    _reportTrace(logMessage, stackTrace);
                });
            }else{
                _reportTrace(logMessage, stackTrace);
            }
        };
    }
   
    

    if (typeof TraceKit !== 'undefined') {
        TraceKit.report.subscribe(_reportTrace);
    }
    if (typeof Framework7.__useFs !== 'undefined') {
        Framework7.file.useFs = Framework7.__useFs;
    } else {
        Framework7.file.useFs = true;
    }

    document.addEventListener("deviceready", function () {
        if (((typeof device === 'undefined') || (device && device.platform === 'browser'))) {
            Framework7.file.useFs = false;
        }
        Framework7.file.getContent('config.json', {rootFs : cordova.file.applicationDirectory})
        .then(function (resp) {
            if (Framework7.file.useFs) {
                resp = JSON.parse(resp);
            }
            var pInst = {
                id: resp.appId,
                name: resp.appName,
                root: '#boxApp',
                version: resp.version
                // ,lazyModulesPath : '/vendor/Framework7/lazy-components/'
            };

            pInst[boxModule.name] = resp;
            pInst[resp.appId] = resp;

            if (resp.lazyModulesPath) {
                pInst.lazyModulesPath = resp.lazyModulesPath;
                delete resp.lazyModulesPath;
            }

            Framework7.use(boxModule, resp);

            if (Framework7.prototype.modules[resp.appId] && Framework7.prototype.modules[resp.appId].routes) {
                pInst.routes = Framework7.prototype.modules[resp.appId].routes;
                delete Framework7.prototype.modules[resp.appId].routes;
            }

            Parse._initialize(resp.appId, resp.javascriptKey);

            Parse.serverURL = resp.serverURL ? resp.serverURL :
            (window.location && window.location.hostname === 'localhost' ?
               (resp.server && resp.server.developmentURL ?  resp.server.developmentURL :  'http://businessbox.omg/api/') :
                ( resp.server && resp.server.productionURL? resp.server.productionURL : 'https://businessbox.pro/api/'));


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
                    if ((pInst[resp.appId].lng || pInst.lng) && _hasi18n) {
                        return new Promise(function (resolve, reject) {
                            var vln = pInst[resp.appId].i18n || pInst.i18n;
                            if (vln) {
                                vln.lng = pInst[resp.appId].lng || pInst.lng || irdata.lng || document.documentElement.lang;
                                i18next.init(vln, function (err, t) {
                                    if ((typeof moment !== 'undefined') && (typeof moment.locale === 'function')) {
                                        moment.locale(vln.lng);
                                    }
                                    resolve();
                                });
                                return;
                            }
                            Framework7.file.getContent('i18n.json',  {rootFs : cordova.file.applicationDirectory})
                                .then(function (irdata) {
                                    if (Framework7.file.useFs) {
                                        irdata = JSON.parse(irdata);
                                    }
                                    irdata.lng = pInst[resp.appId].lng || pInst.lng || irdata.lng || document.documentElement.lang;

                                    i18next.init(irdata, function (err, t) {
                                        if ((typeof moment !== 'undefined') && (typeof moment.locale === 'function')) {
                                            moment.locale(irdata.lng);
                                        }
                                        resolve();
                                    });
                                })
                                .catch(function () {
                                    resolve();
                                });
                        });
                    }
                })
                .then(function () {
                    app = new Framework7(pInst);
                });
        }, function (cferr) {
            console.log(cferr);
        });
    }, false);
   
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