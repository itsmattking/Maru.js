Maru.js - Micro Web Framework for Node.js
=======

Maru.js makes it easy to define and run a web service.

    var maru = require('maru')

A simple endpoint:

    maru.get('/hello/world', function(req, res) {
      return 'Hello World!';
    });

Add variables to your URL:

    maru.get('/hello/:name', function(req, res, params) {
      // params will contain key/values from defined variables
      return "Hello " + params.name;
    });

Define endpoints with Regular Expressions:

    maru.get(/\/hello\/([a-zA-Z]+)$/, function(req, res, params) {
      // params will contain any captures from Regular Expressions
      return "Hello " + params.captures[0];
    });

Handle POST data:

    maru.post('/save-data', function(req, res, params) {
      // params contains POST data
      return sys.inspect(params);
    });

Mix and Match!

    maru.post('/save-data/:id', function(req, res, params) {
      // params.id will be available, as well as POST data
      return sys.inspect(params);
    });

Render a template (Mu.js built in):

    maru.get('/hello/world', function(req, res, params) {
      return res.render({template: 'index.html'});
    });

If you have any async functions in your route, you have to call
res.render once you're finished.

    maru.get('/show-data/:id', function(req, res, params) {
      // imaginary ORM getting data from a db...
      db.fetch({id: params.id}, function(result) {
        res.render({template: 'data.html', ctx: {result: result}});
      });
    });

Redirect when you're done saving data.

    maru.post('/save-data/:id', function(req, res, params) {
      // imaginary ORM saving data to a db...
      db.fetch({id: params.id}, function(result) {
        result.update(params, function(ok) {
          if (ok) {
            res.redirect('/success/');
          } else {
            res.render({template: 'error.html'});
          }
        });
      });
    });
