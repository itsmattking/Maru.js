var maru = require('./maru.js');

maru.get('/hello/world', function(req, res, params) {
  return this.render('hello.html');
});

maru.run();
