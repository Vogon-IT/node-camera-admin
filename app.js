var fs = require('fs'),
  Hapi = require('hapi'),
  moment = require('moment'),
  sqlite3 = require('sqlite3').verbose();

// File paths
var configPath = 'toka.pfs',
  dbPath = 'ConfigDB',
  backupPath = 'backup',
  latestImageFolder = 'latest',
  imagesFolder = 'camera_pictures';

// photo interval
var photoInterval = 60; // seconds (default)
var db = new sqlite3.Database(dbPath);
db.serialize(function() {
  db.each("SELECT * FROM CONFIG", function(err, row) {
    if (row.property.match(/interval/)) photoInterval = parseInt(row.value, 10);
  });
});
db.close();

fs.exists(configPath, function(exists) {
  if (!exists) return console.log('ERROR! Config file not found.');
});

fs.exists(dbPath, function(exists) {
  if (!exists) return console.log('ERROR! SQLite database not found.');
});

fs.exists(backupPath, function(exists) {
  if (!exists) fs.mkdirSync(backupPath);
});

fs.watch(imagesFolder, function(event, filename) {
  var imagePath = imagesFolder + '/' + filename;

  if (filename.match(/(jpg|jpeg)$/)) {
    fs.exists(imagePath, function(exists) {
      if (exists) {
        fs.readFile(imagePath, function(err, data) {
          if (!err) {
            fs.createReadStream(imagesFolder + '/' + filename)
              .pipe(fs.createWriteStream('public/' + latestImageFolder + '/image.jpg'));
          } else console.log(err);
        });
      }
    });
  }
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
  fs.stat('public/' + latestImageFolder + '/image.jpg', function(err, stats) {
    var modified = moment(stats.mtime).fromNow();

    // Render the view
    request.reply.view('index.html', {
      image: latestImageFolder + '/image.jpg',
      modified: modified,
      interval: photoInterval
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
  var db = new sqlite3.Database(dbPath);

  if (parseInt(payload.interval, 10) > 0) photoInterval = parseInt(payload.interval, 10);

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