function() {
   this.labels = 'Matrix bezier bspline hermite'.split(' ');
   this.inLabel = ['', '\u2715'];
   function rounded(x) { return floor(x * 100) / 100; }
   var c = "cos";
   var s = "sin";
   var nc = "-cos";
   var ns = "-sin";
   this.row = -1;
   this.col = -1;
   this.identityMatrix = new AT.Matrix([[1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,1]]);
   this.xyztLabel = [
      'x\u2080 y\u2080 z\u2080 t\u2080'.split(' '),
      'x\u2081 y\u2081 z\u2081 t\u2081'.split(' '),
      'x\u2082 y\u2082 z\u2082 t\u2082'.split(' '),
      'x\u2083 y\u2083 z\u2083 t\u2083'.split(' '),
   ];
   this.p = newVec3();
   this.vals = [
       [ 1 , 0 , 0 , 0,   0 , 1 , 0 , 0,    0 , 0 , 1 , 0,    0 , 0 , 0 , 1 ],
       [ 1 , 0 , 0 , 0,   0 , 1 , 0 , 0,    0 , 0 , 1 , 0,   'A','B','C', 1 ],
       [ 1 , 0 , 0 , 0,   0 ,'A','B', 0,    0 ,'C','A', 0,    0 , 0 , 0 , 1 ],
       ['A', 0 ,'C', 0,   0 , 1 , 0 , 0,   'B', 0 ,'A', 0,    0 , 0 , 0 , 1 ],
       ['A','B', 0 , 0,  'C','A', 0 , 0,    0 , 0 , 1 , 0,    0 , 0 , 0 , 1 ],
       ['A', 0 , 0 , 0,   0 ,'B', 0 , 0,    0 , 0 ,'C', 0,    0 , 0 , 0 , 1 ],
       [ 1 , 0 , 0 ,'A',  0 , 1 , 0 ,'B',   0 , 0 , 1 ,'C',   0 , 0 , 0 , 1 ],
    ];
   this.mode = 0;
   this.is_xyzt = false;
   this.onClick = ['next type', function() { this.mode = (this.mode + 1) % this.vals.length; }];
   this.cmdMode = 0;
   this.onCmdClick = function() { this.cmdMode = (this.cmdMode + 1) % 2; }
   this.onCmdSwipe[2] = ['show labels', function() { this.is_xyzt = ! this.is_xyzt; }];
   this.onCmdSwipe[6] = ['show labels', function() { this.is_xyzt = ! this.is_xyzt; }];
   this.onPress = function(p) { this.p.copy(p); }

   this.onSwipe[0] = ['select\nrow'   , function() { this.row = max(0, min(3, floor((1 - this.p.y) / 2 * 4))); }];
   this.onSwipe[2] = ['select\ncolumn', function() { this.col = max(0, min(3, floor((1 + this.p.x) / 2 * 4))); }];
   this.onSwipe[4] = ['no\nrow'       , function() { this.row = -1; }];
   this.onSwipe[6] = ['no\ncolumn'    , function() { this.col = -1; }];

   function sketchMatrix() {
      mCurve([[1,1],[1,-1],[-1,-1]]);
      lineWidth(1);
      mLine([ .5,1],[ .5,-1]);
      mLine([-1,-.5],[1,-.5]);
   }

   this.render = function(elapsed) {

      this.afterSketch(function() {
         var x, y;

         if (this.cmdMode == 1) {
            color(fadedColor(0.15, this.colorId));
            mFillRect([-1,-.5], [.5,1]);
            color(defaultPenColor);
         }

         if (this.row >= 0) {
            color(fadedColor(.33, this.colorId));
            y = 1 - 2 * (this.row / 4);
            mFillCurve([ [-1,y], [1,y], [1,y-.5], [-1,y-.5], [-1,y] ]);
            color(defaultPenColor);
         }

         if (this.col >= 0) {
            color(fadedColor(.33, this.colorId));
            x = 2 * (this.col / 4) - 1;
            mFillCurve([ [x,-1], [x,1], [x+.5,1], [x+.5,-1], [x,-1] ]);
            color(defaultPenColor);
         }

      });

      var type = this.labels[this.selection];

      switch (type) {
      case 'Matrix':
         sketchMatrix();
         break;
      case 'bezier':
         this.duringSketch(function() {
            mLine([-1, 1],[-1,-1]);
            mCurve( [[-1,1],[-.5,1]].concat(makeOval(-1,0,1,1,16,PI/2,-PI/2))
                                    .concat([[-.5,0],[-1,0]]) );
            mCurve( [[-1,0],[-.25,0]].concat(makeOval(-.75,-1,1,1,16,PI/2,-PI/2))
                                     .concat([[-.25,-1],[-1,-1]]) );
         });
         this.afterSketch(function() {
            sketchMatrix();
         });
         break;
      case 'bspline':
         this.duringSketch(function() {
            mLine([-1,-1],[-1, 1]);
            mCurve( [[-1,1],[-.5,1]].concat(makeOval(-1,0,1,1,16,PI/2,-PI/2))
                                    .concat([[-.5,0],[-1,0]]) );
            mCurve( [[-1,0],[-.25,0]].concat(makeOval(-.75,-1,1,1,16,PI/2,-PI/2))
                                     .concat([[-.25,-1],[-1,-1]]) );
         });
         this.afterSketch(function() {
            sketchMatrix();
         });
         break;
      case 'hermite':
         this.duringSketch(function() {
            mLine([-1, 1],[-1,-1]);
            mLine([-1, 0],[ 1, 0]);
            mLine([ 1, 1],[ 1,-1]);
         });
         this.afterSketch(function() {
            sketchMatrix();
         });
         break;
      }

      this.afterSketch(function() {
         var i, x, y, z, sub, val, vals, value, col, row, out;

         mLine([-1, .5],[1,  .5]);
         mLine([-1,  0],[1,   0]);
         mLine([-.5, 1],[-.5,-1]);
         mLine([  0, 1],[  0,-1]);
         lineWidth(2);
         mCurve([[-1,-1],[-1,1],[1,1]]);

         out = [];

         switch (type) {

         case 'bezier':
            out = [ -1,3,-3,1 , 3,-6,3,0 , -3,3,0,0 , 1,0,0,0 ];
            break;

         case 'bspline':
            out = [ '-1/6', ' 3/6', '-3/6', ' 1/6',
	            ' 3/6', '-6/6', '   0', ' 4/6',
		    '-3/6', ' 3/6', ' 3/6', ' 1/6',
		    ' 1/6', '   0', '   0', '   0' ];
            break;

         case 'hermite':
            out = [ 2,-3,0,1 , -2,3,0,0 , 1,-2,1,0 , 1,-1,0,0 ];
            break;

         case 'Matrix':
            let control = this.inputs.value(0);
            if (control instanceof AT.Matrix
                && control.numRows() === 4
                && control.numColumns() === 4)
            {
               for (let row = 0; row < 4; row++) {
                  for (let column = 0; column < 4; column++) {
                     out.push(roundedString(control.element(row, column)));
                  }
               }
            }
            else {
               sub = ["x","y","z"];
               switch (this.mode) {
               case 1: sub = ["tx","ty","tz"]; break;
               case 2:
               case 3:
               case 4: sub = ["cos","sin","-sin"]; break;
               case 5: sub = ["sx","sy","sz"]; break;
               case 6: sub = ["px","py","pz"]; break;
               }

               if (isDef(control)) {
                  if (control instanceof AT.Matrix) {
                     x = rounded(control.element(0, 0), 0);
                     y = rounded(control.element(0, 1), x);
                     z = rounded(control.element(0, 2), y);
                  }
                  else {
                     x = y = z = rounded(control, 0);
                  }

                  switch (this.mode) {
                  case 1:
                  case 5:
                  case 6:
                     sub[0] = x;
                     sub[1] = y;
                     sub[2] = z;
                     break;
                  case 2:
                  case 3:
                  case 4:
                     sub[0] = rounded(cos(x));
                     sub[1] = rounded(sin(y));
                     sub[2] = -sub[1];
                     break;
                  }
               }
            }

            vals = this.vals[this.mode];

            for (col = 0 ; col < 4 ; col++)
            for (row = 0 ; row < 4 ; row++) {
               val = "" + vals[row + 4 * col];
               if (val == "A") val = sub[0];
               if (val == "B") val = sub[1];
               if (val == "C") val = sub[2];
               out.push(val);
            }

            break;
         }

         for (col = 0 ; col < 4 ; col++) {
            for (row = 0 ; row < 4 ; row++) {
               x = (col - 1.5) / 2;
               y = (1.5 - row) / 2;
               val = this.is_xyzt ? this.xyztLabel[row][col] : out[row + 4 * col];
               if (isNumeric(val))
                  val = rounded(val);
               textHeight(max(this.xhi - this.xlo, this.yhi - this.ylo) / 9 / pow(("" + val).length, 0.4));
               mText(val, [x, y], .5, .5);
            }
         }

         for (let row = 0; row < 4; row++) {
            for (let column = 0; column < 4; column++) {
               value = parseFloat(out[row * 4 + column]);
               this.matrixValues.setElement(row, column, isNumeric(value) ? value : out[i]);
            }
         }
      });
   }

   this.setup = function() {
      var type = this.labels[this.selection];

      if (type === "Matrix") {
         // Generic matrices need a "control" input as their first input
         this.defineInput(AT.Float);
         this.defineAlternateInputType(AT.Matrix);
      }

      // Second input on generic matrices, and first input on bezier and so on,
      // are a second matrix to multiply this by.
      this.defineInput(AT.Matrix);
   }

   this.defineOutput(AT.Matrix, function() {
      var type = this.labels[this.selection];
      var outValue = (type !== 'Matrix' || this.inputs.hasValue(0)) ? this.matrixValues
                                                                    : this.identityMatrix;
      let multIndex = (type === "Matrix") ? 1 : 0;
      if (this.inputs.hasValue(multIndex) && this.inputs.value(multIndex).canMultiply(outValue)) {
         outValue = this.inputs.value(multIndex).times(outValue);
      }
      return outValue;
   })

   this.matrixValues = new AT.Matrix(4, 4);
}

