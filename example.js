var maru = require('./maru.js');

maru.get('/hello/world', function(req, res, params) {
  res.render({template: 'hello.html'});
});

maru.run();
