var fs = require('fs');
var https = require('https');
var express = require('express');
var path = require('path');
var forceSSL = require('express-force-ssl');
var app = express();

app.use(forceSSL);
app.use('/', express.static('../www/'));
app.use(function (req,res,next) {
  res.status(404).sendFile(path.resolve('../www_res/404/index.html'));
});

var prkey = fs.readFileSync('key.pem');
var certi = fs.readFileSync('cert.pem');

https.createServer({
  key: prkey,
  cert: certi
}, app).listen(443, function() {
  console.log('Now accepting HTTPS connections on port 443.');
});

app.listen(80, function () {
  console.log('Now accepting HTTP connections on port 80.');
});
