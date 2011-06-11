var maru = require('./maru.js');

/**
 * Simple endpoint that returns a string to be displayed.
 */
maru.get('/hello-world/simple', function(req, res, params) {
  return 'Hello World!';
});

/**
 * Render a template using res.render. If called, do not
 * return anything from the function.
 */
maru.get('/hello-world/template', function(req, res, params) {
  res.render({template: 'hello.html'});
});

maru.run();
