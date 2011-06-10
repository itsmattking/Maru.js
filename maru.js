/**
 * @preserve Maru.js micro web framework.
 * This file includes all functionality to allow users
 * to configure and run an http server.
 *
 * @author mking@mking.me (Matt King)
 */

/**
 * Node.js imports.
 */
var http = require('http'),
  sys = require('sys'),
  util = require('util'),
  querystring = require('querystring'),
  urlParser = require('url');

/**
 * Set up the template rendering engine.
 * Defaulting now to Mu.js.
 */
var TemplateEngine = require('./mu/lib/mu');

/**
 * @constant
 * List of month abbreviations used in logging.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
              'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * @constant
 * Constants for request methods we will support.
 */
const REQUEST_METHODS = {
  "GET": 'GET',
  "POST": 'POST',
  "PUT": 'PUT',
  "DELETE": 'DELETE'
};

/**
 * Utility function to pad a number with zeroes.
 * @param {Number} num
 * @param {Number} places
 */
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

/**
 * Simple log function printing to stdout.
 * @param {*} what
 */
function log(what) {
  sys.puts(what);
};

/**
 * @constructor Router
 * Holds instances of routes and provides functionality to match requested
 * routes.
 */
function Router() {
  this.routes = {};
  for (k in REQUEST_METHODS) {
    this.routes[k] = [];
  }
};

/**
 * Adds a route to the internal routes list.
 * @param {Route} route instance of a Route object.
 */
Router.prototype.addRoute = function(route) {
  this.routes[(route.type || REQUEST_METHODS.GET).toUpperCase()].push(route);
};

/**
 * Finds a route in the routes list based on type and a RegExp pattern.
 * The first match found in the list will be returned.
 * @param {String} type one of the request methods from REQUEST_METHODS.
 * @param {RegExp} pattern used to match against each route in the list.
 * @returns {Route}
 */
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

/**
 * Class Route
 * @constructor
 * An individual route holding configuration options.
 * @param {Object} opts
 * @param {Function|String} opts.url the url to respond to.
 * @param {String} opts.type the request method type from REQUEST_METHODS.
 * @param {Function} opts.body the body of content to return on match.
 * @param {String} [opts.contentType="text/html"] the content type header
 *   to set on final dispatch.
 */
function Route(opts) {
  this.url = opts.url;
  var re, keys = [];
  /**
   * Support URLs like '/path/to/resource'.
   */
  if (typeof this.url === 'string') {
    /**
     * Support inline variable placeholders like '/path/to/:variable'.
     */
    if (this.url.indexOf(':') != -1) {
      /**
       * Generate a matching RegExp, replacing ':variable' with a real regular
       * expression.
       */
      re = new RegExp('^' + this.url.replace(
          /(:[a-zA-Z]+)/g, '([^?/#&]+)'
      ) + '$');
      /**
       * Save any variable place holder names  in the url to the
       * keys object.
       */
      var m = this.url.match(/(:[a-zA-Z]+)/g);
      for (var i = 0, len = m.length; i < len; i++) {
        keys.push(m[i].substr(1));
      }
    } else {
      /**
       * Generate a generic RegExp without variables.
       */
      re = new RegExp('^' + this.url + '$');
    }
  } else {
    /**
     * Otherwise assume the url is already a RegExp.
     */
    re = this.url;
  }
  /**
   * Save the RegExp and list of found variable keys to
   * save values into. Used in getParams to generate a list
   * of captured variable values for use in responses.
   */
  this.pattern = {
    re: re,
    keys: keys
  };
  this.type = opts.type;
  this.body = opts.body;
  this.contentType = opts.contentType || 'text/html';
};

/**
 * Given a request object, take the url and match it against
 * against the current pattern to pull out any defined variables
 * in the url.
 * @param {http.HttpRequest} req
 */
Route.prototype.getParams = function(req) {
  /**
   * Parse the path name and see if our internal pattern matches.
   */
  var parsedURL = urlParser.parse(req.url, true);
  var values = parsedURL.pathname.match(this.pattern.re).splice(1);
  /**
   * Start with any query string parameters.
   */
  var out = parsedURL.query, captures = [];
  /**
   * Add any matches from the url to the out params object.
   */
  for (var i = 0, len = values.length; i < len; i++) {
    /**
     * If we have a pre-defined key, assign the value to it.
     */
    if (this.pattern.keys[i]) {
      out[this.pattern.keys[i]] = values[i];
    } else {
      /**
       * Otherwise, push it onto a generic 'captures' array. This means
       * a RegExp can be defined to capture without named variables and
       * the user can access the value inside the body function.
       */
      captures.push(values[i]);
    }
  }
  if (captures.length > 0) {
    out.captures = captures;
  }
  return out;
};


/**
 * @constructor App
 * Defines and manages a HTTP server, with a Router to dispatch
 * requests.
 * @param {Object} opts
 */
function App(opts) {
  this.router = new Router();
  if (opts) {
    if (opts.routes) {
      this.setRoutes(opts.routes);
    }
    TemplateEngine.templateRoot = opts.templateRoot || './templates';
  } else {
    TemplateEngine.templateRoot = './templates';
  }
};

/**
 * Add a Route to the Router.
 * @param {Object} routeConfig
 * @param {String} routeConfig.type
 * @param {RegExp|String} routeConfig.url
 * @param {Function} routeConfig.body
 */
App.prototype.addRoute = function(routeConfig) {
  this.router.addRoute(new Route(routeConfig));
};

/**
 * Batch add Routes to the Router.
 * @param {Array[Object]} routeset
 */
App.prototype.setRoutes = function(routeset) {
  for (var i = 0, len = routeset.length; i < len; i++) {
    this.addRoute(routeset[i]);
  }
};

/**
 * Given a request and response object, ask the Router to find
 * a Route that matches. Depending on the type of
 * request, will call dispatchWithData or dispatchNoData.
 * @param {http.HttpRequest} req
 * @param {http.HttpResponse} res
 */
App.prototype.dispatch = function(req, res) {
  var url = urlParser.parse(req.url).pathname;
  var route = this.router.find(req.method, url);
  if (route) {
    var params = route.getParams(req);
    ((req.body === undefined &&
      (req.method == REQUEST_METHODS.POST || req.method == REQUEST_METHODS.PUT)) ?
     this.dispatchWithData :
     this.dispatchNoData).call(this, route, req, res, params);
  } else {
    this.notFound(res);
  }
};

/**
 * Takes a matched route and sets up callbacks on the response in order
 * to send back to the client. Processes incoming post data in chunks
 * and once complete, calls the finish function.
 * @param {Route} route The matching route object.
 * @param {http.HttpRequest} req
 * @param {http.HttpResponse} res
 * @param {Object} params An object to populate with POST parameter values.
 */
App.prototype.dispatchWithData = function(route, req, res, params) {
  var instance = this, data = [];
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

/**
 * Simple dispatch with no data processing.
 * @param {Route} route The matching route object.
 * @param {http.HttpRequest} req
 * @param {http.HttpResponse} res
 * @param {Object} params An object with GET parameter values.
 */
App.prototype.dispatchNoData = function(route, req, res, params) {
  this.finish(route, req, res, params);
};

/**
 * Called once the route processing is done. Sets the content type,
 * logs the request and calls the route's body function to get the final
 * parsed response to send to the client.
 * @param {Route} route The matching route object.
 * @param {http.HttpRequest} req
 * @param {http.HttpResponse} res
 * @param {Object} params An object with all parsed parameter values.
 */
App.prototype.finish = function(route, req, res, params) {
  var instance = this;
  /**
   * Define a callback to be used in the final response.
   * We do this in case the body function returns another function
   * that needs to run first. We'll pass this in to the body function
   * so it can call it when it's ready. Otherwise we'll call this
   * right away.
   */
  var next = function(out) {
    if (!res.statusCode) {
      res.statusCode = 200;
    }
    if (!res.getHeader('content-type')) {
      res.setHeader('Content-Type', route.contentType);
    }
    instance.logRequest(req, res, out.length);
    res.end(out);
    /**
     * Remove the next function just in case it was defined.
     */
    delete(this.next);
  };

  try {
    /**
     * Call the body function, getting it's result.
     * If it returns another function, call it passing in our 'next' function
     * so it can call it when it needs to.
     */
    var out = route.body.apply(this, [req, res, params]);
    /**
     * If no return, assume there that it will
     * call render when it's finished. Save the next function, which the
     * render function will check for and call when it's done.
     */
    if (typeof out === 'undefined') {
      this.next = next;
    } else {
      typeof out === 'function' ? out.call(this, next) : next.call(this, out);
    }
  } catch (e) {
    this.log(e);
    this.serverError(res);
  }
};

/**
 * Convenience function to set the response to 404 not found.
 * @param {http.HttpResponse} res
 */
App.prototype.notFound = function(res) {
  res.writeHead(404, {'Content-Type': 'text/plain'});
  res.end('Sorry, route not found');
};

/**
 * Convenience function to set the response to 500 server error.
 * @param {http.HttpResponse} res
 */
App.prototype.serverError = function(res) {
  res.writeHead(500, {'Content-Type': 'text/plain'});
  res.end('Internal Server Error');
};

/**
 * Convenience function to set the redirect location.
 * @param {http.HttpResponse} res
 * @param {String} url location to redirect to.
 * @param {Number} [statusCode="301"] status code to set.
 */
App.prototype.redirect = function(res, url, statusCode) {
  if (!statusCode) {
    statusCode = 301;
  }
  res.statusCode = statusCode;
  res.setHeader('location', url);
  res.end();
};

/**
 * Log output to STDOUT using sys.puts.
 * @param {String} what
 */
App.prototype.log = function(what) {
  log(what);
};

/**
 * Log details about the request to STDOUT.
 * @param {http.HttpRequest} req
 * @param {http.HttpResponse} res
 * @param {Number} len length of the response body.
 */
App.prototype.logRequest = function(req, res, len) {
  var now = new Date();
  var dateString = [
    [padNum(now.getDate(), 2), MONTHS[now.getMonth()],
     now.getFullYear()].join('/'),
    [padNum(now.getHours(),2), padNum(now.getMinutes(),2),
     padNum(now.getSeconds(),2)].join(':')
  ].join(':') + ' ' + padNum((now.getTimezoneOffset()/60)*-100, 4);
  this.log(req.connection.remoteAddress + ' - [' + dateString + '] "' +
           req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '" '
           + res.statusCode + ' ' + len);
};

/**
 * Generate a render callback for the template engine.
 * @param {Function} callback the function to call after reading the file.
 */
App.prototype.renderCallback = function(callback) {
  var self = this;
  return function (err, output) {
    if (err) { throw err; }
    var buffer = '';
    output.addListener('data', function (c) {
      buffer += c;
    }).addListener('end', function() {
      callback.call(self, buffer);
    });
  };
};

/**
 * Render a template.
 * @param {String} template filename of the template to render.
 * @param {Object} ctx context object holding local variables available to
 *   the template.
 * @returns {Function} function that can be passed a callback once the rendering
 *   is complete.
 */
App.prototype.render = function(template, ctx) {
  if (this.next) {
    TemplateEngine.render(template, ctx, {chunkSize: 10},
                          this.renderCallback(this.next));
  } else {
    var self = this;
    return function(callback) {
      TemplateEngine.render(template, ctx, {chunkSize: 10},
                            self.renderCallback(callback));
    };
  }
};

/**
 * Start an instance of an HTTP server, setting the callback to the
 * internal dispatch function.
 * @param {Object} opts configuration options.
 * @param {Number} [opts.port=8124] Port number to listen on.
 * @param {String} [opts.host="127.0.0.1"] Hostname to listen on.
 */
App.prototype.run = function(opts) {

  this.runOpts = {
    port: 8124,
    host: '127.0.0.1'
  };

  if (opts) {
    for (k in this.runOpts) {
      if (opts[k]) {
        this.runOpts[k] = opts[k];
      }
    }
  }

  var instance = this;
  this.server = http.createServer(function(req, res) {
    instance.dispatch(req, res);
  }).listen(this.runOpts.port, this.runOpts.host);

};

/**
 * Variable that will act as an app.
 * Will ony be instantiated if a user defines an endpoint using
 * any of the methods below.
 */
var magicApp;

/**
 * Convenience function to initialize an app if none exists,
 * then add a route configuration to it.
 * @param {String} type request method from REQUEST_METHODS.
 * @param {String|RegExp} url url to match against.
 * @param {Function} body response to return on match.
 */
function generateMagicApp(type, url, body) {
  if (!magicApp) {
    magicApp = new App();
  }
  magicApp.addRoute({type: type, url: url, body: body});
}

/**
 * Allow users to define a GET request with a url and body.
 * @param {String|RegExp} url url to match against.
 * @param {Function} body response to return on match.
 */
function get(url, body) {
  generateMagicApp(REQUEST_METHODS.GET, url, body);
}

/**
 * Allow users to define a POST request with a url and body.
 * @param {String|RegExp} url url to match against.
 * @param {Function} body response to return on match.
 */
function post(url, body) {
  generateMagicApp(REQUEST_METHODS.POST, url, body);
}

/**
 * Allow users to define a PUT request with a url and body.
 * @param {String|RegExp} url url to match against.
 * @param {Function} body response to return on match.
 */
function put(url, body) {
  generateMagicApp(REQUEST_METHODS.PUT, url, body);
}

/**
 * Allow users to define a DELETE request with a url and body.
 * @param {String|RegExp} url url to match against.
 * @param {Function} body response to return on match.
 */
function del(url, body) {
  generateMagicApp(REQUEST_METHODS.DELETE, url, body);
}

/**
 * Fire up the app at the user's request. Must be called by the user
 * to run. Calls the app instance's run function.
 * @param {Object} opts
 */
function runMagicApp(opts) {
  if (magicApp) {
    magicApp.run(opts);
  } else {
    sys.puts("You didn't define any endpoints! Exiting now...");
  }
}

/**
 * Expose the App, and app creation functions.
 */
exports.App = App;
exports.log = log;
exports.get = get;
exports.post = post;
exports.put = put;
exports.delete = del;
exports.run = runMagicApp;