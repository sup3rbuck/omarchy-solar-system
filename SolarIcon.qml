import QtQuick
import QtQuick.Shapes

// The bar and panel icon: the Sun and one planet on its orbit, drawn as
// vectors in the theme colour. Kept to three shapes so it still reads at the
// bar's 12-16 px.
Item {
  id: root
  property color color: "white"
  // Background colour: a thin gap around the outer planet so it reads apart
  // from its orbit
  property color gap: "transparent"
  property real size: 16
  implicitWidth: size
  implicitHeight: size

  readonly property real u: size / 16      // design grid is 16x16
  readonly property real orbitR: 6.4

  Shape {
    anchors.fill: parent
    preferredRendererType: Shape.CurveRenderer
    ShapePath {
      strokeColor: root.color; strokeWidth: Math.max(1, 1.0 * root.u); fillColor: "transparent"
      PathAngleArc { centerX: 8 * root.u; centerY: 8 * root.u; radiusX: root.orbitR * root.u; radiusY: root.orbitR * root.u; startAngle: 0; sweepAngle: 360 }
    }
  }

  // Sun
  Rectangle {
    width: 5.0 * root.u; height: width; radius: width / 2
    x: 8 * root.u - width / 2; y: 8 * root.u - height / 2
    color: root.color
  }
  // Outer planet on its orbit, top left
  Rectangle {
    width: 5.2 * root.u; height: width; radius: width / 2
    x: (8 + root.orbitR * Math.cos(3.93)) * root.u - width / 2; y: (8 + root.orbitR * Math.sin(3.93)) * root.u - height / 2
    color: root.color
    border.color: root.gap; border.width: 1.0 * root.u
  }
}
