// Accepts a point in 3d space and a radius length

Leap.plugin('proximity', function(scope){
  'use strict';

  var proximities = [];

  var makeVector3 = function(p){
    if (p instanceof THREE.Vector3){
      return p;
    } else {
      return (new THREE.Vector3).fromArray(p)
    }
  };

  // Takes four vec3 points in global space
  // Returns a point or false.
  // http://stackoverflow.com/questions/563198/how-do-you-detect-where-two-line-segments-intersect
  var intersectionPointBetweenLines = function(l1a, l1b, l2a, l2b){

    // at this point, r and s are on the same plane. Might make sense to do the 2d solution here.
    var r = (new THREE.Vector3).subVectors(l1b, l1a);

    var s = (new THREE.Vector3).subVectors(l2b, l2a);

//    var rxs = r.cross(s);
    var rxs = ( r.x * s.y ) - ( r.y * s.x );


    console.assert(!isNaN(r.x));
    console.assert(!isNaN(r.y));
    console.assert(!isNaN(r.z));

    console.assert(!isNaN(s.x));
    console.assert(!isNaN(s.y));
    console.assert(!isNaN(s.z));

//    console.assert(!isNaN(rxs.x));
//    console.assert(!isNaN(rxs.y));
//    console.assert(!isNaN(rxs.z));

    // t = (q − p) × s / (r × s)
    var diff = l2a.clone().sub(l1a);

    var diffxs = ( diff.x * s.y ) - ( diff.y * s.x );
    var diffxr = ( diff.x * r.y ) - ( diff.y * r.x );

    var t = diffxs / rxs;
    var u = diffxr / rxs;

    if (isNaN(t)) return false;
    if (isNaN(u)) return false;

    if ( t < 0 || t > 1 ) return false;
    if ( u < 0 || u > 1 ) return false;

    return l1a.clone().add(
      r.multiplyScalar(t)
    );

  };

  // todo - not sure what happens with dynamic z.
  var testIntersectionPointBetweenLines = function(){

    var point;
    point = intersectionPointBetweenLines(
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(1,0,0),
      new THREE.Vector3(0.5,-1,0),
      new THREE.Vector3(0.5,1,0)
    );

    console.assert(point);
    console.assert(point.equals(new THREE.Vector3(0.5,0,0)));

    // nonintersecting
    point = intersectionPointBetweenLines(
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(1,0,0),
      new THREE.Vector3(0,0.2,0),
      new THREE.Vector3(1,0.4,0)
    );

    console.assert(point === false);

    // nonintersecting with z
    point = intersectionPointBetweenLines(
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(1,0,0),
      new THREE.Vector3(0,0.2,0),
      new THREE.Vector3(1,0.4,0.4)
    );

    console.assert(point === false);

    // past end of line a
    point = intersectionPointBetweenLines(
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(1,0,0),
      new THREE.Vector3(1.5,-1,0),
      new THREE.Vector3(1.5,1,0)
    );

    console.assert(point === false);


    // past end of line b
    point = intersectionPointBetweenLines(
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(1,0,0),
      new THREE.Vector3(0.5,-2,0),
      new THREE.Vector3(0.5,-1,0)
    );

    console.assert(point === false);

  };

  // accepts one option: mode
  // mode: 'points', the default, will be "in" when any of the points are within the mesh.
  //   Expects points to be vec3s from the origin.
  // mode:

  var Proximity = function(mesh, handPoints, options){
    setTimeout( // pop out of angular scope.
      function(){
        testIntersectionPointBetweenLines()
      },
      0
    );

    options || (options = {});
    this.options = options;

    this.mesh = mesh;
    this.handPoints = handPoints;

    // These are both keyed by the string: hand.id + handPointIndex
    this.states = {};
    this.intersectionPoints = {}; // checkLines: one for each handPoint.  Position in world space.

    // Similar to above, but also includes point on the plane, but not on the plane segment.
    // This is used for responding to between-frame motion
    this.possibleIntersectionPoints = {};

    this.distances = {}; // checkPoints: one for each handPoint
    this.lengths = {}; // checkPoints: one for each handPoint
  };

  Proximity.prototype = {

    intersectionCount: function() {
      var intersectionCount = 0, key;

      for ( key in this.intersectionPoints ){
        if( this.intersectionPoints.hasOwnProperty(key) ){
          intersectionCount++;
        }
      }

      return intersectionCount;
    },

    // unlike "over" events, we emit when "in" an object.
    in: function(callback){
      this.on('in', callback);
      return this
    },

    out: function(callback){
      this.on('out', callback);
      return this
    },

    check: function(hand){

      // Handles Spheres. Planes. Boxes? other shapes? custom shapes?

      var handPoints = this.handPoints(hand);

      // this class is designed to either checkLines or checkPoints, but not both
      // This should perhaps be split in to two classes, LineProximity and PointProximity.
      if (handPoints[0] instanceof Array){

        this.checkLines(hand, handPoints);

      }else {

        this.checkPoints(hand, handPoints);

      }

    },

    // Todo - this loop could be split in to smaller methods for JIT compiler optimization.
    checkLines: function(hand, lines){
      var mesh = this.mesh, state, intersectionPoint, key;

      var worldPosition = (new THREE.Vector3).setFromMatrixPosition( this.mesh.matrixWorld );

      // j because this is inside a loop for every hand
      for (var j = 0; j < lines.length; j++){

        key = hand.id + '-' + j;

        intersectionPoint = mesh.intersectedByLine(lines[j][0], lines[j][1], worldPosition);

        var lastIntersectionPoint = this.possibleIntersectionPoints[key];

        // 1: store lastIntersectionPoint at all times
        // 2: only return values for good intersectionpoints from mesh.intersectedByLine
        // 3:  use it to tune intersectionpoint.
        // This works for both when the hand has entered the plane, and when it has passed through entirely.
        // TODO: there is currently an issue where multiple lines hit this condition in the same frame,
        // and they have disparate offset lengths
        // In that case, the foremost line should push the image, but what happens here and in InteractablePlane#getPosition
        // is the lines are averaged and then move the image
        // InteractablePlane should be aware of this adjustment (perhaps doing so itself)
        if ( this.states[key] === 'out' && intersectionPoint && lastIntersectionPoint ){

          // check all four edges,
          // take the one that actually has a cross
          // if two have a cross (e.g., the intersection travels completely through the place), get the minimum distance one

          // calc corners
          var corners = mesh.getWorldCorners();

          var minLenSq = Infinity;
          var closestEdgeIntersectionPoint = null;

          for (var i = 0; i < 4; i++){

            var point = intersectionPointBetweenLines(
              corners[i],
              corners[(i+1) % 4],
              lastIntersectionPoint,
              intersectionPoint
            );

            if (!point) continue;


            //console.assert(!isNaN(point.x));
            //console.assert(!isNaN(point.y));
            //console.assert(!isNaN(point.z));

            var lengthSq = (new THREE.Vector3).subVectors(point, lastIntersectionPoint).lengthSq();

//            console.log('edge #:', i, 'line #:', j, "distance:", Math.sqrt(lengthSq) );

            if (lengthSq < minLenSq){
              minLenSq = lengthSq;
              closestEdgeIntersectionPoint = point;
            }

          }

          if (closestEdgeIntersectionPoint) {

            //console.log('edge intersection', closestEdgeIntersectionPoint, "between", intersectionPoint, "and", lastIntersectionPoint);

            intersectionPoint = closestEdgeIntersectionPoint;

          }

        }

        // if there already was a valid intersection point,
        // And the new one is valid in z but off in x and y,
        // don't emit an out event.
        // This allows high-speed motions out.
        if ( !intersectionPoint && this.intersectionPoints[key] && mesh.intersectionPoint ) {

          //console.log('found newly lost intersection point');
          intersectionPoint = mesh.intersectionPoint

        }

        if (intersectionPoint){

          this.intersectionPoints[key] = intersectionPoint;

        } else if (this.intersectionPoints[key]) {

          delete this.intersectionPoints[key];

        }

        if (mesh.intersectionPoint){

          this.possibleIntersectionPoints[key] = mesh.intersectionPoint; // mesh.intersectionPoint may be on plane, but not segment.

        } else {

          delete this.possibleIntersectionPoints[key];

        }

        state = intersectionPoint ? 'in' : 'out';

        if ( (state == 'in' && this.states[key] !== 'in') || (state == 'out' && this.states[key] === 'in')){ // this logic prevents initial `out` events.
          this.emit(state, hand, intersectionPoint, key, j); // todo - could include intersection displacement vector here (!)
          this.states[key] = state;
        }

      }

    },

    checkPoints: function(hand, handPoints){
      var mesh = this.mesh, length, state,
        handPoint, meshWorldPosition = new THREE.Vector3,
        distance = new THREE.Vector3, key;

      if (! ( mesh.geometry instanceof THREE.SphereGeometry  ) ){
        console.error("Unsupported geometry", this.mesh.geometry);
        return
      }

      meshWorldPosition.setFromMatrixPosition( mesh.matrixWorld ); // note - this is last frame's position. Should be no problem.
//      console.assert(!isNaN(meshWorldPosition.x));
//      console.assert(!isNaN(meshWorldPosition.y));
//      console.assert(!isNaN(meshWorldPosition.z));

      for (var j = 0; j < handPoints.length; j++){

        key = hand.id + '-' + j;

        handPoint = makeVector3( handPoints[j] );
//        console.assert(!isNaN(handPoint.x));
//        console.assert(!isNaN(handPoint.y));
//        console.assert(!isNaN(handPoint.z));

        // subtract position from handpoint, compare to radius
        // optimization - could square lengths here.
        distance.subVectors(handPoint, meshWorldPosition);
        length = distance.length();
        this.distances[key] = distance;
        this.lengths[key]   = length;

        state = (length < mesh.geometry.parameters.radius) ? 'in' : 'out';

        if (state !== this.states[key]){
          this.emit(state, hand, distance, key, j);
          this.states[key] = state;
        }

      }

    },

    // loop through existing "in" states and emit "out" events.
    clear: function(hand){

      for ( var key in this.states ){
        if( this.states.hasOwnProperty(key) ){

          delete  this.states[key];
          delete  this.intersectionPoints[key];
          delete  this.lengths[key];
          delete  this.distances[key];
          this.emit('out', hand, null, key, parseInt(key.split('-')[1],10) );

        }
      }

    }

  };

  Leap._.extend(Proximity.prototype, Leap.EventEmitter.prototype);

  // can be a sphere or a plane.  Here we'll use an invisible sphere first
  // ideally, we would then emit events off of the object
  // Expects a THREE.js mesh
  // and a function which receives a hand and returns an array of points to check against
  // Returns an object which will emit events.
  // the in event is emitted for a handpoint entering the region
  // the out event is emitted for a handpoint exiting the region
  // note: this architecture is brittle to changing numbers of handPoints.
  this.watch = function(mesh, handPoints){
    console.assert(mesh);
    console.assert(handPoints);
    console.assert(typeof handPoints === 'function');

    var proximity = new Proximity(mesh, handPoints);

    proximities.push(proximity);

    return proximity;
  };

  this.on('handLost', function(hand){

    for (var i = 0; i < proximities.length; i++){
      proximities[i].clear(hand);
    }

  });

  // After setting up a proximity to watch, you can watch for events like so:
  // controller
  //   .watch(myMesh, myPointGetterFunction)
  //   .in(function(index, displacement, fraction){
  //
  //   });
  // Where
  //  - index is the index of the point returned by myPointGetterFunction for which we are responding
  //  - displacement is the THREE.Vector3 from hand point to the mesh.  (Testing a new convention - always send arrows out of the hand, as that expresses intention.)
  //  - fraction is distanceToMeshCenter / meshRadius.


  return {

    // we call this on frame explicitly, rather than hand, so that calculations are done before 'frame' and 'hand' events
    // bound to elsewhere in the app.
    frame: function(frame){

      for (var i = 0; i < frame.hands.length; i++){

        for (var j = 0; j < proximities.length; j++){

          proximities[j].check(frame.hands[i]);

        }

      }

    }

  }
});