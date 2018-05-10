var loopback = require('loopback');
var boot = require('loopback-boot');
var bodyParser = require('body-parser');
var app = module.exports = loopback();

app.use(bodyParser.json());

app.start = function ()
{
    app.listen(function ()
    {
        app.emit('started');
    });
};

// Bootstrap the application, configure models, datasources and middleware.
// Sub-apps like REST API are mounted via boot scripts.
boot(app, __dirname, function (err)
{
    if (err) throw err;

    // start the server if `$ node server.js`
    if (require.main === module) app.start();
});
