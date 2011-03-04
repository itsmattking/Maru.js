var maru = require('./maru.js');

var m = new maru.App();
m.setRoutes([
    {
        type: 'GET',
        url: "/hello/:and/:junk",
        body: function(req, res, params) {
            var ctx = {
                msg: 'one',
                twat: function() {
                    return 'chunky';
                }
            };
            return this.render('testes.html', ctx);
        }
    },
    {
        type: 'POST',
        url: "/hello/:and/:junk",
        body: function(req, res, params) {
            return "hey there";
        }
    },
    {
        type: 'GET',
        url: new RegExp("/kaka/(.*?)/junk"),
        body: function(req, res, params) {
            this.redirect(res, '/hello/what/what');
            return "hey there";
        }
    }

]);

m.run({port: 8083});
