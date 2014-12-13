# LeapJS Widgets

This library aids manipulation of 2d surfaces in a 3D world. It depends on [THREE.js](http://threejs.org/) and
[LeapJS](https://github.com/leapmotion/leapjs).  This is accomplished with a minimal API, no physics engine dependencies

With `leap-widgets.js`, two classes are added to the window namespace: `InteractablePlane`, and `PushButton`.  Also a plugin named `proximity` is made available, which allows detection between either line segments and plane segments, or points and spheres.

This library expects Leap Motion and your THREE.js scene to be both in the same uniting system: meters.  This effects things like collision detection (requiring same units) and some sane defaults (such as how far a button depresses).

See the demos below for how to set this up in a couple of lines.

![vrcollage2s](https://cloud.githubusercontent.com/assets/407497/5421708/b2f6a38c-821d-11e4-947e-82f18b3c17b2.gif)


Get it from the CDN at [js.leapmotion.com](http://js.leapmotion.com).

## XY Movement - Slide & Scroll

InteractablePlane will take an existing THREE.js plane mesh and a LeapJS Controller, and allow any hands  in-frame to manipulate the plane.  Planes will carry a little bit of momentum after being released.

```javascript
var planeMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.1, 0.2),
  new THREE.MeshPhongMaterial()
);
scene.add(planeMesh);

var plane = new InteractablePlane(planeMesh, Leap.loopController);
```

Movement here will be constrained to X and Y in the plane's local space, according to THREE.js convention.  If the mesh itself has it's `.rotation` or `.quaternion` set, the visuals of the mesh will be effected, but not plane of movement. To move along a different plane, use a dolly: add the interactable plane's mesh a rotated parent object which is a child of the scene.

Any finger can move the plane, multiple fingers can intersect at once, and will move the plane in average. Fingers can, of course, move multiple planes, if they overlap.

#### [Live Demo](http://leapmotion.github.io/leapjs-widgets/examples/interactablePlaneXY.html)


## Z Movement (Push and Pull)

```javascript
var planeMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.1, 0.2),
  new THREE.MeshPhongMaterial()
);
scene.add(planeMesh);

var plane = new InteractablePlane(planeMesh, Leap.loopController, {moveX: false, moveY: false, moveZ: true});
```

####  [Live Demo](http://leapmotion.github.io/leapjs-widgets/examples/interactablePlaneZ.html)

## Buttons

```javascript
var button = new PushButton(

  new InteractablePlane(buttonMesh, Leap.loopController)

).on('press', function(mesh){

  mesh.material.color.setHex(0xccccff);

}).on('release', function(mesh){

  mesh.material.color.setHex(0xeeeeee);

});
```

#### [Live Demo](http://leapmotion.github.io/leapjs-widgets/examples/button.html)

## InteractablePlane API:

**Options**:


| Option              | Description                                                                                                                                                                                  | Default                                                                                                                                                                                                                                              |
|--------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|---------|
| moveX        | Allow movement in X                                                                                                                                    |  true   |
| moveY        | Allow movement in Y                                                                                                                                    | true    |
| moveZ        | Allow movement in Z                                                                                                                                    | false   |
| highlight    | Adds a child mesh to the plane, which is set to visible when a finger intersects to move the plane.  This is customizable through `plane.highlightMesh`| true    |
| damping      | How much speed gets lost on every animationFrame.  Should be between 0 and 1.                                                                          | 0.12    |
| hoverBounds  | Z-depth range for which to emit hover events                                                                                                         | [0, 0.32] |

**Properties**:

| Property | Description | Default
|---|----|---|
| interactable | Whether interactivity is enabled. If false, the plane's position will never be mutated. | true |
| touched      | Whether the plane is currently touched | false |
| density      | Effects calculated mass                | 1     |
| mass         | Effects calculated momentum            | geometry.area() * this.density |
| k            | Spring constant for fingers pushing through the mesh in z. Effects unsprung z-movement: non-buttons | this.mass |
| isHovered    |                               | false |



**Events**:

 - `travel(callback)` - Bind to the `.on('travel')` event, which fires whenever a plane moves (either through interaction or momentum)
 - `touch(callback)` - Bind to the `.on('touch')` event, which fires when a finger intersects a plane which is not touched by any other finger.
 - `release(callback)` - Bind to the `.on('release')` event, which fires whenever a finger no longer intersects a plane, an no other fingers intersect either.
 - `hover(handlerIn, handlerOut)` - Bind to the `.on('hover')` and `.on('hoverOut')` events, which fire when a finger first enters a rectangle bounded by the x and y of the plane, and the z of the `hoverBounds` option.


**Constraints**:

A plane can have movement constraint callbacks in z,y, or z.  These methods receive the target position, and should return a number. This number should be either the original value unchanged, or its allowed substitute.

```javascript
plane.movementConstraints.x = function(x){
  if (x > 0.02) return 0.02;

  return x;
};
```

 - `plane.movementConstraints` An object with x,y, and z properties.  Each should be a function or null.
 - `plane.clearMovementConstraints()` Resets x, y, and z constraints to null.


**Public Methods**:

 - `highlight(boolean)` - Make visible or invisible the highlight mesh.
 - `changeParent(newParent)` - Moves the mesh from one parent to another.  This cleans up tracked internal state, which depends on relative positioning data.
 - `intersectionCount()` - The number of current line segments intersecting a the plane.
 - `safeSetInteractable()` - Makes the plane interactable once it is not intersecting and hands.  Use this after completing
 an automated movement with interactable set to false, to prevent people from interacting accidentally with content moved under their hands.

**Overridable Methods**:

 - `interactiveEndBones(hand)` - The method receives a hand and returns an array of line segments (as pairs of `THREE.Vector3` points). These are what will be used to detect intersections between the hand and the plane *for XY movement**. By default, the proximal, medial, and distal bones of the fingers, along with just the medial and distal of the thumb, are returned.

 - `interactiveJoints(hand)` - The method receives a hand and returns an array of `THREE.Vector3` points. These are what will be used to detect collisions between the hand and the plane *for Z movement**. By default, the first four joints of the fingers, along with just three from the thumb, are returned. (Counting from the tip inwards)


## Button API


| Option       | Description                                                                                                                                                                                  | Default                                                                                                                                                                                                                                              |
|--------------|------------------------------------------------|---------|
| locking      | Stay pressed in when after being pressed.      | true    |
| longThrow    | The button Z travel limit when pushing         | -0.05   |
| shortThrow   | The button Z travel limit when returning while locked/engaged    | -0.03  |



## Proximity Plugin

Adds the `controller.watch` method.  This returns a `proximity` object, which emits `in` and `out` events when a line segment intersects the supplied plane segment.  This is used heavily by InteractablePlane XY movement.

```javascript

var proximity = Leap.loopController.watch(
  plane,
  function(){
    return [
      lineGeometry.vertices
    ]
  }
);

proximity.in(function(hand, intersectionPoint, key, index){
  console.log('in');
  sphere.material.color.setHex(0x00cc04);
});

proximity.out(function(hand, intersectionPoint, key, index){
  console.log('out');
  sphere.material.color.setHex(0x003304);
});

```

The key is a string combination of the hand id and the index: "#{hand.id}-index".  The index is the array index of the line segment returned by the second argument to `watch`, which is, for InteractablePlane, `interactiveEndBones`.

Alternatively, `.watch` can be passed a sphere as its first argument, and and a function which returns a 1-d array of points as its second.

#### [Live Demo](http://leapmotion.github.io/leapjs-widgets/examples/proximity.html)

### THREEjs Extensions

A number of methods are added to THREE.js core, and available to you to use, although they are subject to change.

 - `THREE.PlaneGeometry.prototype.area = function()...`
 - `THREE.CircleGeometry.prototype.area = function()...`
 - `THREE.Mesh.prototype.getWorldCorners = function()...` - Gets the corners in world space of an object.  Uses CSS ordering convention: clockwise from top left. Only supports geometries which respond to `corners()`
 - `THREE.PlaneGeometry.prototype.corners = function()...`
 - `THREE.BoxGeometry.prototype.corners = function()...`
 - `THREE.Mesh.prototype.border = function(lineMaterial)...` - Creates line meshes around all edges of a cube, using the provided material. See [Live Demo](http://leapmotion.github.io/leapjs-widgets/examples/border.html).
 - `THREE.Mesh.prototype.intersectedByLine = function(lineStart, lineEnd, worldPosition){` Adds a property `intersectionPoint` to the plane mesh, and returns it if that point is within the bounds of the plane segment.
 - `THREE.Mesh.prototype.pointOverlap = function(point, inverseMatrix){`  Returns the coordinates in local space of the point relative to the mesh.
 - `THREE.PlaneGeometry.prototype.pointOverlap`
 - `THREE.CircleGeometry.prototype.pointOverlap`