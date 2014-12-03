module.exports = function(grunt){
  var filename = "leap-widgets-<%= pkg.version %>";
  var banner = "/*!                                                              \
\n * LeapJS Widgets v<%= pkg.version %>                                          \
\n * http://github.com/leapmotion/leapjs-widgets/                                \
\n *                                                                             \
\n * Copyright 2013 LeapMotion, Inc. and other contributors                      \
\n * Released under the Apache-2.0 license                                       \
\n * http://github.com/leapmotion/leapjs-widgets/blob/master/LICENSE             \
\n */";

  var concatOpts = {};
  concatOpts['./build/' + filename + '.js'] = './src/*.js';

  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    // This updates the version.js to match pkg.version
    'string-replace': {
      build: {
        files: {
          'examples/': 'examples/*.html'
        },
        options:{
          replacements: [
            {
              pattern: /leap-widgets-.*\.js/,
              replacement: filename + '.js'
            }
          ]
        }
      }
    },
    clean: {
      build: {
        src: ['./build/*']
      }
    },
    concat: concatOpts,
    uglify: {
      build: {
        src:  './build/' + filename  + '.js',
        dest: './build/' + filename  + '.min.js'
      }
    },
    usebanner: {
      build: {
        options: {
          banner: banner
        },
        src: ['./build/' + filename + '.js', './build/' + filename + '.min.js']
      }
    },
    // run with `grunt watch` or `grunt test watch`
    watch: {
      options: {
        atBegin: true
      },
      files: 'src/*',
      tasks: ['default']
    }
  });

  require('load-grunt-tasks')(grunt);

  grunt.registerTask('default', [
    'string-replace',
    'clean',
    'concat',
    'uglify',
    'usebanner'
  ]);

};