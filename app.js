var fs = require('fs'),
  util = require('util'),
  Hapi = require('hapi'),
  moment = require('moment'),
  im = require('imagemagick'),
  mongoose = require('mongoose'),
  RSVP = require('rsvp'); // promise

// mongodb
var Schema = mongoose.Schema;
var Config = mongoose.model('Config', {
  property: String,
  value: Schema.Types.Mixed
});
mongoose.connect('mongodb://localhost/vogon');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'mongodb connection error:'));
db.once('open', function callback() {});

// default configs
var configValues = [{
  property: 'ConfigVersion',
  value: new Date().toString()
}, {
  property: 'KeepRAW',
  value: 0
}, {
  property: 'FilenameConvention',
  value: '%Y-%m-%d_%H:%M:%S'
}, {
  property: 'ImageFolder',
  value: '/vogon/images'
}, {
  property: 'ImageFolderRAW',
  value: '/vogon/imagesRAW'
}, {
  property: 'Active',
  value: 1
}, {
  property: 'Interval',
  value: 60
}, {
  property: 'ImgFocalLength',
  value: 1
}, {
  property: 'ImgApertureValue',
  value: 1
}, {
  property: 'ImgCopyright',
  value: 'Mikko'
}, {
  property: 'CameraNodeMap',
  value: '/vogon/nodejs/node-camera-admin/NodeMap.pfs'
}];

var promise = new RSVP.Promise(function(resolve, reject) {
  var configs = [];

  Config.find({}, function(err, data) {
    if (err) reject(err);

    if (data.length) {
      resolve(data);
    } else {
      configValues.forEach(function(obj) {
        var config = new Config(obj);
        config.save();
        configs.push(config);
      });
      resolve(configs);
    }
  });
});

promise.then(function(configs) {
  // Paths
  var backupPath = 'backup',
    latestImageFolder = 'latest';

  var configPath = configs.filter(function(config) {
    return config['property'] === 'CameraNodeMap';
  });
  configPath = configPath[0].value;
  var imageFolder = configs.filter(function(config) {
    return config['property'] === 'ImageFolder';
  });
  imageFolder = imageFolder[0].value;

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
  var server = Hapi.createServer('87.94.74.47', 8080, options); //

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
      var interval = configs.filter(function(config) {
        return config['property'] === 'Interval';
      });

      // Render the view
      request.reply.view('index.html', {
        image: latestImageFolder + '/image.jpg',
        modified: modified,
        interval: interval[0].value
      });
    });
  }

  function adminIndex(request) {
    // Get config file data
    var configData = fs.readFileSync(configPath).toString();

    configs.forEach(function(row) {
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
      dbData: configs
    });
  }

  function formHandler(request) {
    var payload = request.payload;

    var reply = {
      status: 1,
      message: ''
    };

    if (parseInt(payload.interval, 10) > 0) photoInterval = parseInt(payload.interval, 10);
    payload['ConfigVersion'] = new Date().toString();

    delete payload['_id'];

    configs.forEach(function(obj) {
      if (obj.property !== 'configData') {
        var value = payload[obj.property];
        var property = obj.property;
        Config.findOneAndUpdate({
          property: property
        }, {
          value: value
        }, function(err, data) {
          if (err) reply = {
            status: 0,
            message: err.message
          };
          obj.value = value;
        });
      }
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
}, function(value) { // promise failure
  console.log(err);
});