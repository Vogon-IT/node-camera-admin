var fs = require('fs'),
  util = require('util'),
  Hapi = require('hapi'),
  moment = require('moment'),
  im = require('imagemagick'),
  mongoose = require('mongoose'),
  sqlite3 = require('sqlite3').verbose();

// mongodb
var Schema = mongoose.Schema;

var configSchema = new Schema({
  Config: String,
  ConfigVersion: {
    type: Date,
    default: Date.now
  },
  KeepRAW: Number,
  FilenameConvention: String,
  ImageFolder: String,
  ImageFolderRAW: String,
  Active: Number,
  Interval: Number,
  ImgFocalLength: Number,
  ImgApertureValue: Number,
  ImgCopyright: String,
  CameraNodeMap: String
});

var Config = mongoose.model('Config', configSchema);
mongoose.connect('mongodb://localhost/vogon');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'mongodb connection error:'));
db.once('open', function callback() {});

// default config
var config = new Config({
  Config: "default",
  ConfigVersion: new Date(),
  KeepRAW: 0,
  FilenameConvention: "%Y-%m-%d_%H:%M:%S",
  ImageFolder: "/vogon/images",
  ImageFolderRAW: "/vogon/imagesRAW",
  Active: 1,
  Interval: 60,
  ImgFocalLength: 1,
  ImgApertureValue: 1,
  ImgCopyright: "Mikko",
  CameraNodeMap: "/vogon/nodejs/node-camera-admin/NodeMap.pfs"
});

// get config data from mongo or create collection if first run
Config.findOne({
  Config: 'default'
}, function(err, data) {
  console.log(data);
  if (err) console.log(err);
  if (data !== null) {
    config = data;
  } else {
    config.save(function(err, data) {
      if (err) console.log(err);
      config = data;
    });
  }
});

// Paths
var backupPath = 'backup',
  latestImageFolder = 'latest';

var configPath = config.configPath,
  imageFolder = config.imageFolder;

setTimeout(function() { // wait until db values are loaded. refactor with promises

  configPath = 'NodeMap.pfs';
  imageFolder = 'camera_pictures/';

  fs.exists(configPath, function(exists) {
    if (!exists) return console.log('ERROR! Config file not found.');
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
        interval: config.Interval
      });

    });
  }

  function adminIndex(request) {
    // Get config file data
    var configData = fs.readFileSync(configPath).toString();

    Config.findOne({
      Config: 'default'
    }, function(err, data) {
      config = data;
    });

    var array = [];
    for (var i in config._doc) {
      array.push({
        property: i,
        value: config._doc[i]
      });
    }

    array.forEach(function(row) {
      if (row['property'].match(/^__v|_id|Active|ConfigVersion|Config$/)) row['hidden'] = 'hidden';
      if (row['property'].match(/^Active$/)) row['switch'] = 'switch';
      if (row['property'].match(/^KeepRAW$/)) {
        row['checkbox'] = 'checkbox';
        row['checked'] = row.value === '1' ? 'checked' : '';
      }
    });

    // Render the view
    request.reply.view('admin.html', {
      configData: configData,
      dbData: array
    });
  }

  function formHandler(request) {
    var payload = request.payload;

    var reply = {
      status: 1,
      message: ''
    };

    if (parseInt(payload.interval, 10) > 0) photoInterval = parseInt(payload.interval, 10);
    payload['ConfigVersion'] = new Date();

    delete payload['_id'];

    Config.findOneAndUpdate({
      Config: 'default'
    }, payload, function(err, data) {
      if (err) reply = {
        status: 0,
        message: err.message
      };
    });

    // ConfigData
    var configData = payload.configData;
    // Make backup file from old config file
    fs.readFile(configPath, function(err, data) {
      // Check if any changes
      if (configData !== data.toString()) {
        fs.writeFile(backupPath + '/Backup ' + new Date(), data, function(err) {
          // Save new configuration after backup is done
          fs.writeFile(configPath, configData, function(err) {
            if (err) reply = {
              status: 0,
              message: err.message
            };
          });
        });
      }
    });

    request.reply(reply);
  }

}, 1000);