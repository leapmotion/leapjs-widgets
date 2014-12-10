// Some custom extensions for THREE.js


(function() {
  'use strict';

// Returns the positions of all the corners of the box
// Uses CSS ordering conventions: CW from TL.  First front face corners, then back.
// http://stackoverflow.com/questions/15302603/three-js-get-the-4-corner-coordinates-of-a-cube
// returns the relative corner positions, unaffected by scale of the box.
THREE.BoxGeometry.prototype.corners = function(){
  this._corners || (this._corners = [
    new THREE.Vector3,
    new THREE.Vector3,
    new THREE.Vector3,
    new THREE.Vector3,
    new THREE.Vector3,
    new THREE.Vector3,
    new THREE.Vector3,
    new THREE.Vector3
  ]);

  var halfWidth  = this.parameters.width  / 2,
      halfHeight = this.parameters.height / 2,
      halfDepth  = this.parameters.depth  / 2;

  this._corners[0].set( - halfWidth, + halfHeight, + halfDepth);
  this._corners[1].set( + halfWidth, + halfHeight, + halfDepth);
  this._corners[2].set( + halfWidth, - halfHeight, + halfDepth);
  this._corners[3].set( - halfWidth, - halfHeight, + halfDepth);
  this._corners[4].set( - halfWidth, + halfHeight, - halfDepth);
  this._corners[5].set( + halfWidth, + halfHeight, - halfDepth);
  this._corners[6].set( + halfWidth, - halfHeight, - halfDepth);
  this._corners[7].set( - halfWidth, - halfHeight, - halfDepth);

  return this._corners

};

THREE.PlaneGeometry.prototype.corners = function(num){

  this._corners || (this._corners = [
    new THREE.Vector2,
    new THREE.Vector2,
    new THREE.Vector2,
    new THREE.Vector2
  ]);

  var halfWidth  = this.parameters.width  / 2,
      halfHeight = this.parameters.height / 2;

  this._corners[0].set( - halfWidth, + halfHeight);
  this._corners[1].set( + halfWidth, + halfHeight);
  this._corners[2].set( + halfWidth, - halfHeight);
  this._corners[3].set( - halfWidth, - halfHeight);

  if (!isNaN(num)){
    return this._corners[num]
  }else {
    return this._corners
  }

};

// Doesn't change any other corner positions
// scale is a factor of change in corner position, from the original corner position.
THREE.Mesh.prototype.setCorner = function(cornerNo, newCornerPosition, preserveAspectRatio){


  if (preserveAspectRatio){
    // See formulation:
    // https://s3.amazonaws.com/uploads.hipchat.com/28703/213121/yCBzmNgVxNCeqlU/scaling_box_from_corner.pdf
//    console.assert( (this.scale.x === this.scale.y) && (this.scale.y === this.scale.z) );

    var p0 = this.position,
      d = newCornerPosition,
      c = this.corners(cornerNo),
      r0 = this.scale.x;

    // test:
    d = c.clone().add(this.position);

    var q0 = p0.clone().sub(
      c.clone().multiplyScalar(r0)
    );

//    console.assert( !isNaN(q0.x) );

    // TODO: handle 0-division edge cases
    var t = - ( q0.dot(q0) - d.dot(d) + 2 * d.clone().sub(q0).dot(p0) ) /
                      (2 * ( d.clone().sub(q0).dot(c) ) );

//    console.assert( !isNaN(t) );

    var p = p0.clone().add( c.clone().multiplyScalar(t) );

    var r = q0.clone().sub(p0).length();
//    var r = q0.clone().sub(p0).divide(c).length();
//    var r = p0.clone().sub(q0).divide(c).length();


    console.log(p0, p);
    console.log(r0, r);

//    console.assert(r === r0);
//    console.assert(this.position.equals(p));

    this.position.copy(p);

    this.scale.set(r, r, r);

  }else {

    if (! (this.geometry instanceof THREE.PlaneGeometry)) {
      throw "Non planar geometries not currently supported";
      // Not that it would be too hard.  This originally supported Boxes as well, but they werent' necessary.
    }

    var c = this.geometry.corners(cornerNo);
    c = new THREE.Vector3(c.x, c.y,0.1); // hack in 0.1 to avoid divide by 0.

    // Formulation is here:
    // https://drive.google.com/file/d/0B7cqxyA6LUpUcmd5MWtfc2JULTg/view
    this.scale.copy(
      (
        (
          newCornerPosition.clone().sub(this.position).divide(c)
          ).add(this.scale)
        ).divideScalar(2)
    );

    // p'
    this.position.copy(
      newCornerPosition.clone().sub(
        this.scale.clone().multiply(c)
      )
    );

  }





};

// returns the absolute position in world space, factoring in scale, rotation, and position relative to parent.
THREE.Mesh.prototype.getWorldCorners = function(num){

  if (!isNaN(num)){

    return this.corners()[num]

  }else{

    var corners = this.geometry.corners();

    for (var i = 0; i < corners.length; i++){

      corners[i] = new THREE.Vector3( corners[i].x, corners[i].y, 0).applyMatrix4(this.matrixWorld);

    }

    return corners;

  }

};

}).call(this);


THREE.PlaneGeometry.prototype.area = function () {

  return this.parameters.height * this.parameters.width;

};

THREE.CircleGeometry.prototype.area = function () {

  return Math.pow(this.parameters.radius, 2) * Math.PI;

};

THREE.Mesh.prototype.border = function(lineMaterial){
  
  var lineGeo = new THREE.Geometry();
  lineGeo.vertices.push(
    this.geometry.corners()[0],
    this.geometry.corners()[1],
    this.geometry.corners()[2],
    this.geometry.corners()[3],
    this.geometry.corners()[0],
    this.geometry.corners()[4],
    this.geometry.corners()[5],
    this.geometry.corners()[6],
    this.geometry.corners()[7],
    this.geometry.corners()[4]
  );

  this.add(new THREE.Line(lineGeo, lineMaterial));

  lineGeo = new THREE.Geometry();
  lineGeo.vertices.push(
    this.geometry.corners()[1],
    this.geometry.corners()[5]
  );
  this.add(new THREE.Line(lineGeo, lineMaterial));

  lineGeo = new THREE.Geometry();
  lineGeo.vertices.push(
    this.geometry.corners()[2],
    this.geometry.corners()[6]
  );

  this.add(new THREE.Line(lineGeo, lineMaterial));

  lineGeo = new THREE.Geometry();
  lineGeo.vertices.push(
    this.geometry.corners()[3],
    this.geometry.corners()[7]
  );
  this.add(new THREE.Line(lineGeo, lineMaterial));
  
}