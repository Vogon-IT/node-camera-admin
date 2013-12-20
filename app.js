var fs = require('fs'),
  util = require('util'),
  Hapi = require('hapi'),
  moment = require('moment'),
  im = require('imagemagick'),
  sqlite3 = require('sqlite3').verbose();

// File paths
var dbPath = 'ConfigDB',
  backupPath = 'backup',
  latestImageFolder = 'latest';

// local overwrites
var configPath = 'NodeMap.pfs',
  imageFolder = 'camera_pictures/',
  photoInterval = 20;

// Config values from database
var db = new sqlite3.Database(dbPath);
db.serialize(function() {
  db.each("SELECT * FROM CONFIG", function(err, row) {
    if (row.property.match(/Interval/)) photoInterval = parseInt(row.value, 10);
    if (row.property.match(/ImageFolder/)) imageFolder = row.value;
    if (row.property.match(/CameraNodeMap/)) configPath = row.value;
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

fs.watch(imageFolder, function(event, filename) {
  var imagePath = imageFolder + filename;

  if (filename.match(/(jpg|jpeg)$/)) {
    fs.exists(imagePath, function(exists) {
      if (exists) {
        fs.readFile(imagePath, function(err, data) {
          if (!err) {

            // https://github.com/rsms/node-imagemagick
            im.resize({
              srcPath: imageFolder + filename,
              dstPath: 'public/' + latestImageFolder + '/image.jpg',
              width: 860
            }, function(err, stdout, stderr) {
              if (err) util.puts(err);
            });

            //  fs.createReadStream(imageFolder + filename)
            //    .pipe(fs.createWriteStream('public/' + latestImageFolder + '/image.jpg'));

          } else util.puts(err);
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
var server = Hapi.createServer('87.94.74.47', 8080, options);

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
  util.puts('> Server started at ' + server.info.uri);
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