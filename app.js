var fs = require('fs'),
  Hapi = require('hapi'),
  moment = require('moment'),
  sqlite3 = require('sqlite3').verbose();

// File paths
var configPath = 'toka.pfs',
  dbPath = 'ConfigDB',
  backupPath = 'backup',
  latestImagePath = 'public/latest/image.jpg',
  publicImagePath = 'latest/image.jpg';

fs.exists(configPath, function(exists) {
  if (!exists) return console.log('ERROR! Config file not found.');
});

fs.exists(dbPath, function(exists) {
  if (!exists) return console.log('ERROR! SQLite database not found.');
});

fs.exists(backupPath, function(exists) {
  if (!exists) fs.mkdirSync(backupPath);
});

var options = {
  views: {
    path: 'templates',
    engines: {
      html: 'handlebars'
    }
  }
};

// Create a server with a host, port, and options
var server = Hapi.createServer('localhost', 8080, options);

server.route({
  method: 'GET',
  path: '/{path*}',
  handler: {
    directory: {
      path: './public',
      listing: false,
      index: true
    }
  }
});

server.route({
  method: 'GET',
  path: '/',
  handler: imageIndex
});

server.route({
  method: 'GET',
  path: '/admin',
  handler: adminIndex
});

server.route({
  method: 'POST',
  path: '/admin',
  handler: formHandler
});

// Start the server
server.start(function() {
  console.log('\n >> Server started at ' + server.info.uri + '\n');
});

function imageIndex(request) {
  fs.stat(latestImagePath, function(err, stats) {
    var modified = moment(stats.mtime).fromNow();

    // Render the view
    request.reply.view('index.html', {
      image: publicImagePath,
      modified: modified
    });

  });
}

function adminIndex(request) {
  // Get config file data
  var configData = fs.readFileSync(configPath).toString();

  // https://github.com/mapbox/node-sqlite3/wiki/API
  var db = new sqlite3.Database(dbPath);

  db.serialize(function() {
    db.all("SELECT * FROM CONFIG", function(err, rows) {
      // Render the view
      request.reply.view('admin.html', {
        configData: configData,
        dbData: rows
      });
    });
  });
  db.close();

}

function formHandler(request) {
  var payload = request.payload;

  // DbData
  var db = new sqlite3.Database(dbPath);

  db.parallelize(function() {
    var stmt = db.prepare("UPDATE CONFIG SET value = ? WHERE property = ?");

    for (var property in payload) {
      if (property !== 'configData') {
        stmt.run(payload[property], property);
      }
    }

    stmt.finalize();
  });

  db.close();

  // ConfigData
  var configData = payload.configData;
  // Make backup file from old config file
  fs.readFile(configPath, function(err, data) {
    fs.writeFile(backupPath + '/Backup ' + new Date(), data, function(err) {
      // Save new configuration after backup is done
      fs.writeFile(configPath, configData, function(err) {
        if (err) return request.reply({
          status: 0,
          message: err.message
        });
      });
    });
  });

  request.reply({
    status: 1,
    message: ''
  });
}