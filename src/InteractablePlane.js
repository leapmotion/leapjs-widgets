(function() {
  'use strict';

window.InteractablePlane = function(planeMesh, controller, options){
  this.options = options || {};
  this.options.cornerInteractionRadius || (this.options.cornerInteractionRadius = 20);
  this.options.resize !== undefined    || (this.options.resize  = false);
  this.options.moveX  !== undefined    || (this.options.moveX   = true );
  this.options.moveY  !== undefined    || (this.options.moveY   = true );
  this.options.moveZ  !== undefined    || (this.options.moveZ   = false );
  this.options.highlight  !== undefined|| (this.options.highlight = true); // this can be configured through this.highlightMesh
  this.options.damping !== undefined   || (this.options.damping = 0.12); // this can be configured through this.highlightMesh
  this.options.hoverBounds !== undefined  || (this.options.hoverBounds = [0, 0.32]);  // react to hover within 3cm.

  this.mesh = planeMesh;

  if (!(controller instanceof Leap.Controller)) {
    throw "No Controller Given"
  }

  if (!controller.plugins.proximity){
    controller.use('proximity');
  }

  this.controller = controller;
  this.lastPosition = null;

  // set this to false to disable inertia and any hand interactions.
  this.interactable = true;

  // holds the difference (offset) between the intersection point in world space and the local position,
  // at the time of intersection.
  this.intersections = {}; //keyed by the string: hand.id + handPointIndex

  this.touched = false;

  // Usage: pass in an options hash of function(s) keyed x,y,and/or z
  // Functions will be called on every frame when the plane touched, with the new target coordinate in that dimension
  // The return value of the function will replace the coordinate passed in
  // e.g. plane.constrainMovement({y: function(y){ if (y > 0.04) return 0.04; return y; } });
  // Todo - it would be great to have a "bouncy constraint" option, which would act like the scroll limits on OSX
  this.movementConstraints = {};

  // If this is ever increased above one, that initial finger can not be counted when averaging position
  // otherwise, it causes jumpyness.
  this.fingersRequiredForMove = 1;

  this.tempVec3 = new THREE.Vector3;

  this.density = 1;
  this.mass = this.mesh.geometry.area() * this.density;
  this.k = this.mass;

  this.isHovered = null;

  // Spring constant of a restoring force
  this.returnSpringK = null;
  this.force = new THREE.Vector3; // instantaneous force on a object.
  this.springs = [];

  this.lastPosition = new THREE.Vector3;
  this.originalPosition = new THREE.Vector3;
  this.resetPosition();

  // keyed by handId-fingerIndex
  this.previousOverlap = {};

  if (this.options.resize){
    this.bindResize();
  }

  if (this.options.moveX || this.options.moveY){
    this.watchXYIntersection();
  }

  this.controller.on('frame', this.updatePosition.bind(this));

  if (this.options.highlight) this.bindHighlight();

  this.controller.on('handLost', this.cleanupHandData.bind(this));

};

window.InteractablePlane.prototype = {

  resetPosition: function(){

    this.lastPosition.copy(this.mesh.position);
    this.originalPosition.copy(this.mesh.position);

  },

  // This is analagous to your typical scroll event.
  travel: function(callback){
    this.on('travel', callback);
    return this;
  },

  // Toggles highlight on and off
  highlight: function(highlight) {
    if ( highlight !== undefined ) {
      this.highlightMesh.visible = highlight;
    }
    else {
      return this.highlightMesh.visible;
    }
  },

  bindHighlight: function(){

    this.highlightMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.mesh.geometry.parameters.width+0.005, this.mesh.geometry.parameters.height+0.005),
      new THREE.MeshBasicMaterial({
        color: 0x81d41d
      })
    );
    this.mesh.add(this.highlightMesh);
    // todo - this should subtract the normal
    this.highlightMesh.position.set(0,0,-0.0001);
    this.highlightMesh.visible = false;

    this.touch(function(){
      if (!this.interactable) return;

      this.highlight(true);
    }.bind(this));

    this.release(function(){
      this.highlight(false);
    }.bind(this));

  },

  touch: function(callback){
    this.on('touch', callback);
    return this
  },

  release: function(callback){
    this.on('release', callback);
    return this
  },

  clearMovementConstraints: function(){
    this.movementConstraints = {};
  },

  // todo - handle rotations as well
  changeParent: function(newParent){
    var key;

    // Clean up so no jump
    for (key in this.intersections){
      delete this.intersections[key];
    }

    this.mesh.position.add( this.mesh.parent.position ); // should be the diff between the old and new parent world positions
    this.lastPosition.copy(this.mesh.position);  // reset velocity (!)
    this.originalPosition.copy(this.mesh.position);

    this.mesh.parent.remove(this.mesh);
    newParent.add(this.mesh);

    console.assert(this.mesh.position); // would fail if this is called with no intersections.
  },

  // Returns the position of the mesh intersected
  // If position is passed in, sets it.
  getPosition: function(position){
    var newPosition = position || new THREE.Vector3, intersectionCount = 0;

    for ( var intersectionKey in this.intersections ){
      if( this.intersections.hasOwnProperty(intersectionKey) ){

        intersectionCount++;

        newPosition.add(
          this.moveProximity.intersectionPoints[intersectionKey].clone().sub(
            this.intersections[intersectionKey]
          )
        )

      }
    }

    // todo - experiment with spring physics
    if ( intersectionCount < this.fingersRequiredForMove) {

      newPosition.copy(this.mesh.position);

    } else {

      newPosition.divideScalar(intersectionCount);

    }


    return newPosition;
  },

  // Adds a spring
  addSpring: function(relativePosition, springConstant){

    var spring = {
      position: relativePosition,
      k: springConstant
    };

    this.springs.push(spring);

    return spring;
  },

  removeSpring: function(spring) {

    for (var i = 0; i < this.springs.length; i++){

      if (this.springs[i] = spring){

        this.springs.splice(i,1);

      }

    }

  },

  cleanupHandData: function (hand) {
    var key;

    var points = this.interactiveJoints(hand);
    for (var i = 0; i < points.length; i++) {
      key = hand.id + "-" + i;
      delete this.intersections[key];
      delete this.previousOverlap[key];
    }

  },

  testZForce: function(){

    var pushThrough = -0.01;

    this.mesh.pointOverlap = function(){
      return new THREE.Vector3(0,0,pushThrough)
    };

    this.interactiveJoints = function(){
      return [[0,0,0]]
    };

    this.previousOverlap["undefined-0"] = pushThrough * -1; // opposite sign

    var z = ( ( this.returnSpringK * this.originalPosition.z ) + ( pushThrough * this.k ) ) / ( this.returnSpringK + this.k );

    var out = new THREE.Vector3;

    this.getZPosition( [{}], out );

    console.assert(out.z === z);

  },

  getPushthrough: function(hands, offset){

    var hand, key, overlap, overlapPoint, sumPushthrough = 0, countPushthrough = 0, min = Infinity;

    // todo, make sure there's no frame lag in matrixWorld
    // (corners may be updated matrix world, causing this to coincidentally work)
    var inverseMatrix = (new THREE.Matrix4).getInverse(this.mesh.matrixWorld); // memoize

    for (var i = 0; i < hands.length; i++) {
      hand = hands[i];

      var points = this.interactiveJoints(hand);
      for (var j = 0; j < points.length; j++) {
        key = hand.id + "-" + j;

        overlapPoint = this.mesh.pointOverlap(
          (new THREE.Vector3).fromArray(points[j]),
          inverseMatrix
        );

        overlap = (overlapPoint && overlapPoint.z);

        if (offset){
          overlap += offset;
        }


        if (overlap && this.previousOverlap[key] &&
           overlap * this.previousOverlap[key] < 0 // not same sign, therefore pushthrough
        ){

          if (overlap < min) min = overlap;

          sumPushthrough += overlap;
          countPushthrough++;

        }

        // Don't allow changing sign, only allow setting sign/value, or unsetting/nulling it
        if ( !overlap || !this.previousOverlap[key] ||
             (overlap * this.previousOverlap[key] > 0) // We have previousOverlap set to the most recent same-sign value.
             // This is used for hover, but conveniently prevents de-hover on what would be negative values.
        ) this.previousOverlap[key] = overlap;

      }

    }

    return {
      sum: sumPushthrough,
      count: countPushthrough,
      min: min
    }

  },

  // uses analytic spring equations, rather than force-based physics.
  getZPosition: function(hands, newPosition){

    var pushthrough = this.getPushthrough(
      hands,
      this.mesh.position.z - this.originalPosition.z
    );

    // this spring equation works, but isin't really that great here
    //newPosition.z = (this.returnSpringK * this.originalPosition.z + pushthrough.sum * this.k ) / (this.returnSpringK + pushthrough.count * this.k);


    // Todo/note: currently, it would be better if any back-step (positive z direction) was ecluded from this update,
    // Handing it over to force-based instead.  However, the force-based simulator currently would pull it too far,
    // back in to the fingertips, causing a 60FPS flicker. :-(
    if ( pushthrough.count > 0 ){
      newPosition.z = pushthrough.min + this.originalPosition.z;
    }

  },

  // Takes each of five finger tips
  // stores which side they are on, if any
  // If a finger tip moves through the mesh, moves the mesh accordingly
  // If two fingers fight.. rotate the mesh?
  // Rotation could be interesting, as it would mean that the x/y/z translation functions should
  // be updated, to compensate for the mesh's rotation
  // This would probably work pretty well for flat planes. Not sure about other stuff. (e.g., 3d models which may
  // need a base rotation. Perhaps they could be childs of a plane).
  calcZForce: function(hands){

    var pushthrough = this.getPushthrough( hands );

    this.force.z += this.k * pushthrough.sum;

    // note that there can still be significant high-frequency oscillation for large values of returnSpringK.
    // This probably mean that we just shouldn't support high-k (as a real-world material may fracture).
    if ( this.returnSpringK ){

      var springDisplacement = this.mesh.position.clone().sub(this.originalPosition);

      this.force.add(
        springDisplacement.multiplyScalar( - this.returnSpringK )
      )

    }

    // balance forces
    // spring foce = finger force
    // kx = kx
    //springDisplacement * returnSpringK = getPushthrough * this.k

    var spring, springDisplacement;
    for (var i = 0; i < this.springs.length; i++){
      spring = this.springs[i];
      springDisplacement = this.mesh.position.clone().sub(spring.position);

      this.force.add(
        springDisplacement.multiplyScalar( - spring.k )
      );

    }

  },

  // On a frame where there's no interaction, run the physics engine
  // does spring return and velocity
  stepPhysics: function(newPosition){
    // inertia
    // simple verlet integration
    newPosition.subVectors(this.mesh.position, this.lastPosition);

    newPosition.add( this.force.divideScalar(this.mass) );
    this.force.set(0,0,0);

    newPosition.multiplyScalar( 1 - this.options.damping );

    newPosition.add(this.mesh.position);

  },

  watchXYIntersection: function(){

    // for every 2 index, we want to add (4 - 2).  That will equal the boneMesh index.
    // not sure if there is a clever formula for the following array:
    var indexToBoneMeshIndex = [0,1,2,3, 0,1,2,3, 0,1,2,3, 0,1,2,3, 0,1,2,3];

    var setBoneMeshColor = function(hand, index, color){

      // In `index / 2`, `2` is the number of joints per hand we're looking at.
      var meshes = hand.fingers[ Math.floor(index / 4) ].data('boneMeshes');

      if (!meshes) return;

      meshes[
        indexToBoneMeshIndex[index]
      ].material.color.setHex(color)

    };

    // we use proximity for x and y, raycasting for z
    // determine if line and place intersect
    // todo - rename to something that's not a mozilla method
    var proximity = this.moveProximity = this.controller.watch(
      this.mesh,
      this.interactiveEndBones
    );

    // this ties InteractablePlane to boneHand plugin - probably should have callbacks pushed out to scene.
    // happens on every frame before the 'frame' event handler below
    proximity.in( function(hand, intersectionPoint, key, index){
      //console.log('in', key);

      // Let's try out a one-way state machine
      // This doesn't allow intersections to count if I'm already pinching
      // So if they want to move after a pinch, they have to take hand out of picture and re-place.
      if (hand.data('resizing')) return;
      setBoneMeshColor(hand, index, 0xffffff);

      this.intersections[key] = intersectionPoint.clone().sub(this.mesh.position);

      if (!this.touched) {
        this.touched = true;
//        console.log('touch', this.mesh.name);
        this.emit('touch', this);
      }

    }.bind(this) );

    proximity.out( function(hand, intersectionPoint, key, index){
      //console.log('out', key);

//      setBoneMeshColor(hand, index, 0x222222);
      setBoneMeshColor(hand, index, 0xffffff);

      for ( var intersectionKey in this.intersections ){

        if (intersectionKey === key){
          delete this.intersections[intersectionKey];
          break;
        }

      }

      // not sure why, but sometimes getting multiple 0 proximity release events
      if (proximity.intersectionCount() == 0 && this.touched) {
        this.touched = false;
//        console.log('release', this.mesh.name, proximity.intersectionCount());
        this.emit('release', this);
      }

    }.bind(this) );

  },

  // 1: count fingertips past zplace
  // 2: when more than 4, scroll
  // 3: when more than 5, move
  // 4: test/optimize with HMD.
  // note: this is begging for its own class (see all the local methods defined in the constructor??)
  updatePosition: function(frame){
    if (!this.interactable) return false;

    this.tempVec3.set(0,0,0);
    var moveX = false, moveY = false, moveZ = false, newPosition = this.tempVec3;
    this.force.set(0,0,0);

    if (this.options.moveX || this.options.moveY){

      this.getPosition( newPosition );

    } else {

      newPosition.copy(this.mesh.position)

    }

    if (this.options.moveZ && this.returnSpringK){

      this.getZPosition( frame.hands, newPosition );

    }

    // there's been no change, give it up to inertia, forces, and springs
    if ( newPosition.equals( this.mesh.position ) ) {

      if (this.options.moveZ){

        // add force to instantaneous velocity (position delta) divided by mass
        // eventually, x and y should be converted to this as well.
        this.calcZForce(frame.hands);

      }

      // Todo - intera/physics stepping should probably take place on frame end, not on frame.
      this.stepPhysics(newPosition);

    }

    this.lastPosition.copy(this.mesh.position);

    // constrain movement to...
    // for now, let's discard z.
    // better:
    // Always move perpendicular to image normal
    // Then set normal equal to average of intersecting line normals
    // (Note: this will require some thought with grab.  Perhaps get carpal intersection, stop re-adjusting angle.)
    // (Note: can't pick just any face normal, so that we can distort the mesh later on.
    // This will allow (but hopefully not require?) expertise to use.

    if (this.options.moveX ){

      if (this.movementConstraints.x){
        newPosition.x = this.movementConstraints.x(newPosition.x);
      }

      if (newPosition.x != this.mesh.position.x){
        this.mesh.position.x = newPosition.x;
        moveX = true;
      }

    }

    if (this.options.moveY ){

      if (this.movementConstraints.y){
        newPosition.y = this.movementConstraints.y(newPosition.y);
      }

      if (newPosition.y != this.mesh.position.y){
        this.mesh.position.y = newPosition.y;
        moveY = true;
      }

    }

    if (this.options.moveZ ){

      if (this.movementConstraints.z){
        newPosition.z = this.movementConstraints.z(newPosition.z);
      }

      if (newPosition.z != this.mesh.position.z){
        this.mesh.position.z = newPosition.z;
        moveZ = true;
      }

    }

    // note - include moveZ here when implemented.
    if ( moveX || moveY || moveZ ) this.emit( 'travel', this, this.mesh );

    if (this.options.hoverBounds) this.emitHoverEvents();
  },

  // Takes the previousOverlap calculated earlier in this frame.
  // If any within range, emits an event.
  // note - could also emit an event on that fingertip?
  emitHoverEvents: function(){

    var overlap, isHovered;

    for (var key in this.previousOverlap){

      overlap = this.previousOverlap[key];

      if ( overlap > this.options.hoverBounds[0] && overlap < this.options.hoverBounds[1] ) {

        isHovered = true;
        break;

      }

    }

    if ( isHovered && !this.isHovered ){
      this.isHovered = isHovered;
      this.emit('hover', this.mesh)
    }

    if ( !isHovered && this.isHovered ){
      this.isHovered = isHovered;
      this.emit('hoverOut', this.mesh)
    }

  },

  hover: function(handlerIn, handlerOut){

    this.on('hover', handlerIn);

    if (handlerOut){
      this.on('hoverOut', handlerOut);
    }

  },

  bindResize: function(){

    var corners = this.mesh.geometry.corners();
    this.cornerMeshes = [];
    this.cornerProximities = [];
    var mesh, proximity;

    for (var i = 0; i < corners.length; i++) {

      this.cornerMeshes[i] = mesh = new THREE.Mesh(
        new THREE.SphereGeometry(this.options.cornerInteractionRadius, 32, 32),
        new THREE.MeshPhongMaterial({color: 0xffffff})
      );

      mesh.visible = false;
      mesh.name = "corner-" + i; // convenience

      var cornerXY = corners[i];
      mesh.position.set(cornerXY.x, cornerXY.y, 0); // hard coded for PlaneGeometry.. :-/

      this.mesh.add(mesh);

      this.cornerProximities[i] = proximity = this.controller.watch(
        mesh,
        this.cursorPoints
      ).in(
        function(hand, displacement, key, index){
          // test - this could be the context of the proximity.
          this.mesh.material.color.setHex(0x33ee22);
        }
      ).out(
        function(){
          this.mesh.material.color.setHex(0xffffff);
        }
      );

    }

    this.controller.on('hand',
      this.checkResizeProximity.bind(this)
    );

    // todo - make sure pinching on multiple corners is well-defined.  Should always take the closest one.
    // Right now it will always prefer the first-added Plane.
    this.controller.on('pinch', function(hand){

      var activeProximity, key = hand.id + '-0';

      for (var i = 0; i < this.cornerProximities.length; i++) {

        if (this.cornerProximities[i].states[key] === 'in') {
          activeProximity = this.cornerProximities[i];
          break;
        }

      }

      if (!activeProximity) return;

      if ( hand.data('resizing') ) return;

      hand.data('resizing', activeProximity);

    }.bind(this));

    this.controller.on('unpinch', function(hand){
      if (!hand.data('resizing')) return;

      hand.data('resizing', false);
    }.bind(this));
  },

  // Returns coordinates for the last two bones of every finger, for XY intersection
  // Format: An array of tuples of ends
  // Order matters for our own use in this class
  // returns a collection of lines to be tested against
  // could be optimized to reuse vectors between frames
  interactiveEndBones: function(hand){
    var out = [], finger;

    for (var i = 0; i < 5; i++){
      finger = hand.fingers[i];

      if (i > 0){ // no thumb proximal
        out.push(
          [
            (new THREE.Vector3).fromArray(finger.proximal.nextJoint),
            (new THREE.Vector3).fromArray(finger.proximal.prevJoint)
          ]
        );
      }

      out.push(
        [
          (new THREE.Vector3).fromArray(finger.medial.nextJoint),
          (new THREE.Vector3).fromArray(finger.medial.prevJoint)
        ],
        [
          (new THREE.Vector3).fromArray(finger.distal.nextJoint),
          (new THREE.Vector3).fromArray(finger.distal.prevJoint)
        ]
      );

    }

    return out;
  },

  // Returns the position in world space of every joint which should be able to move a plane in Z.
  interactiveJoints: function(hand){
    var finger, out = [];

    for (var i = 0; i < 5; i++) {
      finger = hand.fingers[i];

      if (i > 0) { // no thumb proximal
        out.push(
          finger.mcpPosition
        );
      }

      var endPos = finger.distal.nextJoint;
      var offset = [0,0,0.02];
      Leap.vec3.transformMat3(offset, offset, finger.distal.matrix() );
      Leap.vec3.add(offset, endPos, offset);

      out.push(
        finger.pipPosition,
        finger.dipPosition,
        offset
      );

    }

    return out;
  },

  intersectionCount: function(){
    var i = 0;
    for (var key in this.intersections){
      i++
    }
    return i;
  },

  // This checks for intersection points before making self interactable
  // If there are any, it will wait for the plane to be untouched before becoming live again.
  // Note that this may need a little more tuning.  As it is right now, a touch/release may flicker, causing this to be
  // not safe enough. Thus leaving in console.logs for now.
  safeSetInteractable: function(interactable){

    if (!interactable) { this.interactable = false; return }

    if ( this.touched ){

      var callback = function(){

        this.interactable = true;
        this.removeListener('release', callback);

      }.bind(this);

      this.release(callback);

    } else {

      this.interactable = true;

    }

  },

  // could be optimized to reuse vectors between frames
  // used for resizing
  cursorPoints: function(hand){
    return [
      (new THREE.Vector3).fromArray(hand.palmPosition)
    ]
  },

  checkResizeProximity: function(hand){
    var targetProximity = hand.data('resizing'), inverseScale;

    if (!targetProximity) return;

    var cursorPosition = this.cursorPoints( hand )[0];

    for (var i = 0; i < this.cornerProximities.length; i++) {

      if ( targetProximity === this.cornerProximities[i] ){

        if (hand.data('pinchEvent.pinching')) {

          this.mesh.setCorner(i, cursorPosition);

          inverseScale = (new THREE.Vector3(1,1,1)).divide(this.mesh.scale);

          for (var j = 0; j < this.cornerProximities.length; j++){
            this.cornerMeshes[j].scale.copy(inverseScale);
          }


        } else {

          hand.data('resizing', false);

        }

      }

    }

  }

}

Leap._.extend(InteractablePlane.prototype, Leap.EventEmitter.prototype);

}).call(this);