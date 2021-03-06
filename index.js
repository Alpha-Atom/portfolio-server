var fs = require('fs');
var compression = require('compression')
var https = require('https');
var express = require('express');
var path = require('path');
var forceSSL = require('express-force-ssl');
var bodyParser = require('body-parser');
var serveIndex = require('serve-index');
var basic_auth = require('basic-auth');
var FileStreamRotator = require('file-stream-rotator');
var morgan = require('morgan');
var hsts = require('hsts');
var route_manager = require("../ip-project-server/utils/route-manager.js");
var scheduler = require("../ip-project-server/presenters/schedule-controller.js");
var app = express();
var logDirectory = 'log'
var nicklist = {};

/*

  Basic administration stuff

*/

// Set up authentication and existing events.
var log_passwd = fs.readFileSync('../ip-project-server/logpasswd', 'utf-8');
var auth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  };
  var user = basic_auth(req);
  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };
  if (user.name === 'logs' && user.pass === log_passwd.trim()) {
    return next();
  } else {
    return unauthorized(res);
  };
};


fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory)
var accessLogStream = FileStreamRotator.getStream({
  date_format: 'YYYYMMDD',
  filename: logDirectory + '/access-%DATE%.log',
  frequency: 'daily',
  verbose: false
})

scheduler.register_existing_events();

/*

  Set up middleware, included logging and headers.

*/

// Always use SSL, comes first.
app.use(compression());
app.use(forceSSL);
app.use(hsts({
  maxAge: 31536000000,
  includeSubDomains: true, // Must be enabled to be approved by Google 
  preload: true
}))

app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// Send CORS headers on api route.
app.use('/soc-api/*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// Logging comes next
app.use(morgan('short', {stream: accessLogStream}))
app.use(morgan('short'));

/*

  Set up the individual routes for each part of my portfolio

*/

// Check the /soc-api/ routes.
app.use('/soc-api/v1', route_manager);

// Serve the log files
app.use('/log', auth, express.static('log'));
app.use('/log', auth, serveIndex('log', {'icons': true}));

// Static site fallback
app.use('/', express.static('../www/'));

// 404 Anything Else
app.use(function (req,res,next) {
  res.status(404).sendFile(path.resolve('../www_res/404/index.html'));
});

/*

  Below here we set up the servers and choose which ports they will listen on.

*/

var prkey = fs.readFileSync('key.pem');
var certi = fs.readFileSync('cert.pem');
var capem = fs.readFileSync('ca.pem');

var s = https.createServer({
  key: prkey,
  cert: certi,
  ca: capem
}, app).listen(443, function() {
  console.log('Now accepting HTTPS connections on port 443.');
});

app.listen(80, function () {
  console.log('Now accepting HTTP connections on port 80.');
});

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

var io = require('socket.io')(s);

io.on('connection', function(socket){
  console.log('a user connected');
  nicklist[socket.id] = getRandomInt(0,99999);
  socket.on('chat message', function(msg){
    console.log(msg.nick + '#' + nicklist[socket.id] + ': ' + msg.msg);
    msg.nick = msg.nick + '#' + nicklist[socket.id];
    io.emit('chat message', msg);
  });
  socket.on('disconnect', function(){
    console.log('user disconnected');
    delete nicklist[socket.id];
  });
});

