// Never set the rotation of a button
// All units, such as throw, are designed to go in the negative Z
// Add it to a parent/pivot, and rotate that.
// alternatively, we could have it so that constraints themselves are transformed by mesh.matrix
// are there any potential cases where such a thing would be bad?
// - if the base shape had to be rotated to appear correct
// it would be nice to not have to wrap a button, just to rotate it.

var PushButton = function(interactablePlane){
  this.plane = interactablePlane;
  this.plane.returnSpringK = this.plane.mass / 25;
  this.plane.options.moveX = false;
  this.plane.options.moveY = false;
  this.plane.options.moveZ = true;

  this.longThrow  = -0.05;
  this.shortThrow = -0.03;

  this.pressed = false;
  this.canChangeState = true;
  this.plane.movementConstraints.z = this.releasedConstraint.bind(this);

  this.on('press', function(){
    this.pressed = true;

    this.plane.movementConstraints.z = this.pressedConstraint.bind(this);
    this.plane.mesh.material.color.setHex(0xccccff);

  }.bind(this));

  this.on('release', function(){
    this.pressed = false;

    this.plane.movementConstraints.z = this.releasedConstraint.bind(this);
    this.plane.mesh.material.color.setHex(0xeeeeee);

  }.bind(this));

};


// todo - make these oriented in the direction plane normal
// returns the correct position
PushButton.prototype.releasedConstraint = function(z){
  var origZ = this.plane.originalPosition.z;

  if (z > origZ) {
    this.canChangeState = true;
    return origZ;
  }

  if (z < origZ + this.longThrow){
    if (!this.pressed && this.canChangeState){
      this.canChangeState = false;
      this.emit('press');
    }
    return origZ + this.longThrow;
  }

  return z;

};

PushButton.prototype.pressedConstraint = function(z){
  var origZ = this.plane.originalPosition.z;

  if (z > origZ + this.shortThrow) {
    this.canRelease = true;
    return origZ + this.shortThrow;
  }

  if (z < origZ + this.longThrow){
    if (this.pressed && this.canRelease) {
      this.canRelease = false;
      this.emit('release');
    }
    return origZ + this.longThrow;
  }

  return z;

};


Leap._.extend(PushButton.prototype, Leap.EventEmitter.prototype);
