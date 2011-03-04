var http = require('http'),
    sys = require('sys'),
    util = require('util'),
    querystring = require('querystring'),
    urlParser = require('url');

var Mu = require('./mu/lib/mu');

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function padNum(num, places) {
    if (typeof num == 'undefined') {
        return num;
    }
    num = num.toString();
    var pref = '';
    if (num.indexOf('-') != -1) {
        pref = '-';
        num = num.substr(1);
    }
    for (var i = num.length; i < places; i++) {
        num = '0' + num;
    }
    return pref + num;
};

function Router() {
    this.routes = {"GET": [], "POST": [],
                   "PUT": [], "DELETE": []};
};

Router.prototype.addRoute = function(config) {
    this.routes[(config.type || 'get').toUpperCase()].push(config);
};

Router.prototype.find = function(type, pattern) {
    var found;
    for (var i = 0, len = this.routes[type].length; i < len; i++) {
        if (this.routes[type][i].pattern.re.test(pattern)) {
            found = this.routes[type][i];
            break;
        }
    };
    return found;
};

function Route(opts) {
    this.url = opts.url;
    var re, keys = [];
    if (typeof this.url === 'string') {
        if (this.url.indexOf(':') != -1) {
            re = new RegExp('^' + this.url.replace(
                    /(:[a-zA-Z]+)/g, '([^?/#&]+)'
            ) + '$');
            var m = this.url.match(/(:[a-zA-Z]+)/g);
            for (var i = 0, len = m.length; i < len; i++) {
                keys.push(m[i].substr(1));
            }
        } else {
            re = new RegExp('^' + this.url + '$');
        }
    } else {
        re = this.url;
    }
    this.pattern = {
        re: re,
        keys: keys
    };
    this.type = opts.type;
    this.body = opts.body;
    this.contentType = opts.contentType || 'text/html';
};

Route.prototype.getParams = function(req) {
    var parsedURL = urlParser.parse(req.url, true);
    var values = parsedURL.pathname.match(this.pattern.re).splice(1);
    var out = parsedURL.query, captures = [];
    for (var i = 0, len = values.length; i < len; i++) {
        if (this.pattern.keys[i]) {
            out[this.pattern.keys[i]] = values[i];
        } else {
            captures.push(values[i]);
        }
    }
    if (captures.length > 0) {
        out.captures = captures;
    }
    return out;
};

function App(opts) {
    this.router = new Router();
    if (opts) {
        if (opts.routes) {
            this.setRoutes(opts.routes);
        }
        Mu.templateRoot = opts.templateRoot || './templates';
    } else {
        Mu.templateRoot = './templates';
    }
};

App.prototype.setRoutes = function(routeset) {
    for (var i = 0, len = routeset.length; i < len; i++) {
        this.router.addRoute(new Route(routeset[i]));
    }
};

App.prototype.dispatch = function(req, res) {
    var url = urlParser.parse(req.url).pathname;
    var route = this.router.find(req.method, url);
    if (route) {
        var params = route.getParams(req);
        ((req.body === undefined &&
            (req.method == 'POST' || req.method == 'PUT')) ?
            this.dispatchWithData :
            this.dispatchNoData).call(this, route, req, res, params);
    } else {
        this.notFound(res);
    }
};

App.prototype.dispatchWithData = function(route, req, res, params) {
    var instance = this,
        data = [];
    req.on('data', function(chunk) {
        data.push(chunk);
    });
    req.on('end', function() {
        var parsedData = querystring.parse(data.join(''));
        for (k in parsedData) {
            params[k] = parsedData[k];
        }
        instance.finish(route, req, res, params);
    });
};

App.prototype.dispatchNoData = function(route, req, res, params) {
    this.finish(route, req, res, params);
};

App.prototype.finish = function(route, req, res, params) {
    var instance = this;
    var fin = function(out) {
        if (!res.statusCode) {
            res.statusCode = 200;
        }
        if (!res.getHeader('content-type')) {
            res.setHeader('Content-Type', (route.contentType ||
                                           'text/html'));
        }
        instance.logRequest(req, res, out.length);
        res.end(out);
    };
    try {
        var out = route.body.apply(this, [req, res, params]);
        typeof out === 'function' ? out(fin) : fin(out);
    } catch (e) {
        this.log(e);
        this.serverError(res);
    }
};

App.prototype.notFound = function(res) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('Sorry, route not found');
};

App.prototype.serverError = function(res) {
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('Internal Server Error');
};

App.prototype.redirect = function(res, url, statusCode) {
    if (!statusCode) {
        statusCode = 301;
    }
    res.statusCode = statusCode;
    res.setHeader('location', url);
};

App.prototype.log = function(what) {
    sys.puts(what);
};

App.prototype.logRequest = function(req, res, len) {
    var now = new Date();
    var dateString = [
        [padNum(now.getDate(), 2), months[now.getMonth()],
         now.getFullYear()].join('/'),
        [padNum(now.getHours(),2), padNum(now.getMinutes(),2),
         padNum(now.getSeconds(),2)].join(':')
    ].join(':') + ' ' + padNum((now.getTimezoneOffset()/60)*-100, 4);
    this.log(req.connection.remoteAddress + ' - [' + dateString + '] "' +
             req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '" '
             + res.statusCode + ' ' + len);
};

App.prototype.render = function(template, ctx) {
    return function(callback) {
        Mu.render(template, ctx, {chunkSize: 10}, function (err, output) {
            if (err) { throw err; }
            var buffer = '';
            output.addListener('data', function (c) {
                buffer += c;
            }).addListener('end', function() {
                callback(buffer);
            });
        });
    };
};

App.prototype.run = function(opts) {

    if (!opts) {
        opts = {
            port: 8124,
            host: "127.0.0.1"
        };
    }
    var instance = this;
    http.createServer(function(req, res) {
        instance.dispatch(req, res);
    }).listen((opts.port || 8124),
              (opts.host || "127.0.0.1"));

};

exports.App = App;