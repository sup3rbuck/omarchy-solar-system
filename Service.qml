import QtQuick
import QtQuick.Shapes
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "Astro.js" as Astro
import "Scene.js" as Scene

// Live solar system desktop background: Sun, corona, glow, Milky Way, stars,
// planets and moons, with every body at its real position for the simulated date.
//
// "Video" scale compresses distances (sqrt of AU) and enlarges the bodies. "Real" scale shows true distances and true sizes.
//
// Settings live in ~/.config/omarchy/mog-solar-system.json and are changed
// from the bar widget (Widget.qml), which calls the functions below.
Item {
  id: root
  property var shell: null

  // ---- user settings (saved) ------------------------------------------------
  FileView {
    id: settingsFile
    path: Quickshell.env("HOME") + "/.config/omarchy/mog-solar-system.json"
    watchChanges: true
    onFileChanged: reload()
    onAdapterUpdated: writeAdapter()
    onLoadFailed: function(error) { root.settingsReady = true; if (error === FileViewError.FileNotFound) writeAdapter() }
    onLoaded: root.settingsReady = true

    JsonAdapter {
      id: cfg
      property bool shown: true
      // 1 = real time; 3600 = an hour per second, and so on
      property real timeScale: 1
      // "system", "sun", a planet name, or "moon"
      property string focus: "system"
      // How far out a focused body is framed: 0 = close-up, 1 = the whole
      // system's scale with the body still in the middle
      property real zoom: 0
      // "video" (compressed, like the video) or "real" (true sizes and distances)
      property string scale: "video"
      property bool showOrbits: true
      property bool showAsteroids: true
      property bool showMoons: true
    }
  }

  readonly property bool shown: cfg.shown
  readonly property real timeScale: cfg.timeScale
  readonly property string focusName: cfg.focus
  readonly property string scaleMode: cfg.scale === "real" ? "real" : "video"
  readonly property bool realScale: scaleMode === "real"
  readonly property bool showOrbits: cfg.showOrbits
  readonly property bool showAsteroids: cfg.showAsteroids
  readonly property bool showMoons: cfg.showMoons
  readonly property real zoom: Math.max(0, Math.min(1, cfg.zoom))

  // The zoom the view actually uses. It glides to the setting, so the slider,
  // the bar icon's scroll wheel and edits to the settings file all move the
  // camera smoothly. zoomPreview follows the slider while it is dragged,
  // without writing the settings file on every step.
  property real zoomPreview: -1
  readonly property real zoomTarget: zoomPreview >= 0 ? zoomPreview : zoom
  property real zoomView: zoomTarget
  Behavior on zoomView { NumberAnimation { duration: 700; easing.type: Easing.OutCubic } }
  // Follow every step of the glide, even when the clock only ticks once a second.
  onZoomViewChanged: if (shown && bodies.length) updateView()

  readonly property var focusTargets: ["system", "sun", "mercury", "venus", "earth", "moon", "mars",
                                       "jupiter", "saturn", "uranus", "neptune"]

  function setShown(v) { cfg.shown = !!v }
  function setShowOrbits(v) { cfg.showOrbits = !!v }
  function setShowAsteroids(v) { cfg.showAsteroids = !!v }
  function setShowMoons(v) { cfg.showMoons = !!v }
  function setScaleMode(v) { cfg.scale = v === "real" ? "real" : "video" }
  function setTimeScale(v) { cfg.timeScale = Math.max(1, Number(v) || 1) }
  function setFocus(name) { if (focusTargets.indexOf(name) >= 0) cfg.focus = name }
  function setZoom(v) { zoomPreview = -1; cfg.zoom = Math.max(0, Math.min(1, Number(v) || 0)) }
  function previewZoom(v) { zoomPreview = Math.max(0, Math.min(1, Number(v) || 0)) }
  function zoomBy(step) { setZoom(zoom + step) }
  // From the panel or the settings file alike, fly to the new target.
  onFocusNameChanged: beginFlight()
  // Switching scale flies: the bodies shrink or grow and slide to their new
  // places over a few seconds. The setting read at start-up just snaps.
  property bool settingsReady: false
  property real scaleMix: 0          // 0 = enlarged planets, 1 = real size
  NumberAnimation {
    id: scaleAnim
    target: root; property: "scaleMix"
    duration: 4000
    easing.type: Easing.InOutCubic
  }
  onScaleMixChanged: { update(); rebuildSlow(); rebuildBelt() }
  onRealScaleChanged: {
    var to = realScale ? 1 : 0
    if (!settingsReady || !shown) {
      scaleAnim.stop(); snapView = true; scaleMix = to
    } else {
      scaleAnim.stop(); scaleAnim.from = scaleMix; scaleAnim.to = to; scaleAnim.restart()
    }
  }

  // Rebase on every speed change (panel or settings file), so the simulated
  // clock continues from where it is instead of jumping.
  property real appliedScale: 1
  onTimeScaleChanged: {
    var now = Date.now()
    simBaseSim = simBaseSim + (now - simBaseReal) * appliedScale
    simBaseReal = now
    appliedScale = timeScale
  }
  function resetTime() {
    simBaseSim = Date.now(); simBaseReal = Date.now()
    update(); rebuildSlow(); rebuildBelt()
  }

  // ---- simulated clock ------------------------------------------------------
  // Always starts at the real present, so the planets are right after a boot.
  property real simBaseReal: Date.now()
  property real simBaseSim: Date.now()
  property real simMs: Date.now()
  property real days: Astro.daysSinceJ2000(simMs)
  readonly property bool live: timeScale === 1 && Math.abs(simMs - Date.now()) < 5000
  function nowMs() { return simBaseSim + (Date.now() - simBaseReal) * appliedScale }

  // ---- scene state (video pixels) ---------------------------------------
  property var bodies: []          // Scene.layout(), one entry per Scene.BODIES
  property var orbitLines: []
  property var belt: null
  property var sunOrient: Scene.orientation("sun", 0)
  property real coronaT: 0

  // ---- view: centre (video px) and zoom; flies between goals ---------------
  // The full system view shows the video's frame as it was (Sun at CX, CY).
  property real viewX: Scene.W / 2
  property real viewY: Scene.H / 2
  property real viewZ: 1
  property bool snapView: true
  property var flightFrom: null
  property real flight: 1
  NumberAnimation {
    id: flightAnim
    target: root; property: "flight"
    from: 0; to: 1; duration: 3000
    easing.type: Easing.InOutCubic
  }
  function beginFlight() {
    flightFrom = { x: viewX, y: viewY, z: viewZ }
    flightAnim.restart()
  }

  function focusIndex(name) {
    for (var i = 0; i < Scene.BODIES.length; i++) if (Scene.BODIES[i].key === name) return i
    return -1
  }
  // Zoom out from a body's close-up towards the whole system's scale (z = 1),
  // evenly in log scale, keeping the body in the middle.
  function zoomedOut(zClose) {
    if (zClose <= 1) return zClose
    return Math.exp(Math.log(zClose) * (1 - zoomView))
  }
  function goal() {
    var n = cfg.focus, u = scaleMix
    if (n === "sun")
      return { x: Scene.CX, y: Scene.CY, z: zoomedOut(0.3 * Scene.H / (Scene.sunRadiusMix(u) * Scene.lerp(2.2, 1.4, u))) }
    var k = focusIndex(n)
    if (k < 0 || !bodies[k]) return { x: Scene.W / 2, y: Scene.H / 2, z: 1 }
    var b = bodies[k], p = Scene.planetInfo(n)
    var extent = p ? Scene.extentMix(p, u) : Scene.lerp(2.0, 1.4, u)
    return { x: b.x, y: b.y, z: zoomedOut(0.3 * Scene.H / (b.r * extent)) }
  }
  // From pose a to pose b: the target slides evenly to the centre while the
  // zoom changes evenly in log scale.
  function pose(a, b, u) {
    var z = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * u)
    if (b.z >= a.z)
      return { x: b.x - (b.x - a.x) * a.z * (1 - u) / z, y: b.y - (b.y - a.y) * a.z * (1 - u) / z, z: z }
    return { x: a.x - (a.x - b.x) * b.z * u / z, y: a.y - (a.y - b.y) * b.z * u / z, z: z }
  }
  function updateView() {
    var g = goal(), v = g
    if (!snapView && flightFrom && flight < 1) {
      var a = flightFrom
      // Between two zoomed-in targets, pull back far enough to see both on the way.
      var dx = g.x - a.x, dy = g.y - a.y, sep = Math.sqrt(dx * dx + dy * dy)
      var zMid = Math.min(a.z, g.z, 0.5 * Scene.W / Math.max(sep, 1))
      if (zMid < 0.7 * Math.min(a.z, g.z)) {
        var m = { x: (a.x + g.x) / 2, y: (a.y + g.y) / 2, z: zMid }
        v = flight < 0.5 ? pose(a, m, flight * 2) : pose(m, g, flight * 2 - 1)
      } else {
        v = pose(a, g, flight)
      }
    }
    snapView = false
    viewX = v.x; viewY = v.y; viewZ = v.z
  }

  function update() {
    simMs = nowMs()
    var d = Astro.daysSinceJ2000(simMs)
    days = d
    bodies = Scene.layoutMix(scaleMix, d)
    sunOrient = Scene.orientation("sun", d)
    coronaT = (Date.now() % 7200000) / 7200000
    updateView()
  }
  function rebuildSlow() { orbitLines = Scene.orbitsMix(scaleMix, days) }
  function rebuildBelt() { if (showAsteroids) belt = Scene.asteroidsMix(scaleMix, days) }
  onShowAsteroidsChanged: rebuildBelt()

  // ---- lifecycle --------------------------------------------------------------
  // A video wallpaper hidden under this layer would keep decoding for nothing.
  // The shell does not run teardown code when a plugin is disabled, so a small
  // guard script pauses the video while this layer is on screen and resumes it
  // once the layer is gone.
  function startVideoGuard() {
    var guard = Qt.resolvedUrl("video-guard.sh").toString().replace("file://", "")
    Quickshell.execDetached(["sh", guard])
  }
  onShownChanged: if (shown) { update(); rebuildBelt(); startVideoGuard() }

  Component.onCompleted: {
    update()
    rebuildSlow()
    rebuildBelt()
    if (shown) startVideoGuard()
  }

  // Live: once a second is plenty (the corona drifts, planets crawl).
  // Sped up or flying: 30 frames a second.
  Timer {
    interval: root.timeScale > 1 || flightAnim.running || scaleAnim.running ? 33 : 1000
    running: root.shown
    repeat: true
    onTriggered: root.update()
  }
  Timer {
    interval: root.timeScale > 1 ? 2000 : 3600000
    running: root.shown
    repeat: true
    onTriggered: root.rebuildSlow()
  }
  Timer {
    interval: root.timeScale >= 3600 ? 66 : (root.timeScale > 1 ? 5000 : 600000)
    running: root.shown && root.showAsteroids
    repeat: true
    onTriggered: root.rebuildBelt()
  }

  component Orbit: ShapePath {
    property int i
    property var view
    strokeColor: Qt.rgba(0xa8 / 255, 0xb4 / 255, 0xd0 / 255, 0.06)
    strokeWidth: 1
    fillColor: "transparent"
    PathSvg { path: Scene.orbitSvg(root.orbitLines[i], view.ox, view.oy, view.k) }
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: win
      required property var modelData
      screen: modelData
      visible: root.shown
      color: "black"
      anchors { top: true; bottom: true; left: true; right: true }
      exclusionMode: ExclusionMode.Ignore
      // Above the regular wallpaper (and video wallpapers), below every window.
      WlrLayershell.layer: WlrLayer.Bottom
      WlrLayershell.namespace: "mog-solar-system"
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

      Item {
        id: stage
        anchors.fill: parent
        // video px -> screen px.
        // s fills the screen (cropping the 3440x1440 frame on other aspect
        // ratios); the Milky Way background always uses it.
        // sFit shows the whole frame's width, so Neptune's orbit stays on narrow
        // (16:9, 16:10, 4:3, portrait) screens.
        // The solar system uses sFit at the overview zoom and moves to s as the
        // view zooms in (fully by 4x), so close-ups keep filling the screen.
        readonly property real s: Math.max(width / Scene.W, height / Scene.H)
        readonly property real sFit: Math.min(s, width / Scene.W)
        readonly property real fillMix: Math.max(0, Math.min(1, Math.log(Math.max(root.viewZ, 1)) / Math.log(4)))
        readonly property real sv: sFit + (s - sFit) * fillMix
        readonly property real k: sv * root.viewZ
        function sx(x) { return width / 2 + (x - root.viewX) * k }
        function sy(y) { return height / 2 + (y - root.viewY) * k }

        // Milky Way and stars, rendered by the video's own code
        Image {
          anchors.centerIn: parent
          width: Scene.W * stage.s
          height: Scene.H * stage.s
          source: "assets/background.png"
          smooth: true
        }

        // Orbits, faint as in the video, multisampled for smooth lines
        Shape {
          id: orbitShape
          anchors.fill: parent
          visible: root.showOrbits && opacity > 0
          // Very far in they are only straight lines
          opacity: Math.max(0, Math.min(1, (400 - root.viewZ) / 200))
          layer.enabled: visible
          layer.samples: 4
          readonly property var view: ({ ox: stage.width / 2 - root.viewX * stage.k,
                                         oy: stage.height / 2 - root.viewY * stage.k, k: stage.k })
          Orbit { i: 0; view: orbitShape.view }
          Orbit { i: 1; view: orbitShape.view }
          Orbit { i: 2; view: orbitShape.view }
          Orbit { i: 3; view: orbitShape.view }
          Orbit { i: 4; view: orbitShape.view }
          Orbit { i: 5; view: orbitShape.view }
          Orbit { i: 6; view: orbitShape.view }
          Orbit { i: 7; view: orbitShape.view }
        }

        // The asteroid belt lives in video pixels and is moved as one picture.
        Item {
          id: plane
          width: Scene.W; height: Scene.H
          transform: [
            Translate { x: -root.viewX; y: -root.viewY },
            Scale { xScale: stage.k; yScale: stage.k },
            Translate { x: stage.width / 2; y: stage.height / 2 }
          ]

          Canvas {
            id: beltCanvas
            readonly property real rad: Scene.beltRadiusMix(root.scaleMix)
            x: Scene.CX - rad
            y: Scene.CY - rad * Scene.TILT
            width: Math.ceil(rad * 2) + 2
            height: Math.ceil(rad * 2 * Scene.TILT) + 2
            visible: root.showAsteroids && opacity > 0
            // 1-px dust: only meaningful near the full-system zoom
            opacity: Math.max(0, Math.min(1, (3 - root.viewZ) / 2))
            onPaint: {
              var c = getContext("2d")
              c.reset()
              var b = root.belt
              if (!b) return
              c.globalCompositeOperation = "lighter"
              // At real scale the same belt is packed into a smaller ring
              var dim = 1 - 0.5 * root.scaleMix
              for (var i = 0; i < b.x.length; i++) {
                c.fillStyle = Qt.rgba(1, 1, 1, b.b[i] / 255 * dim)
                c.fillRect(Math.round(b.x[i] - x), Math.round(b.y[i] - y), 1, 1)
              }
            }
            Connections {
              target: root
              function onBeltChanged() { beltCanvas.requestPaint() }
            }
            onWidthChanged: requestPaint()
          }
        }

        // The Sun: disc, corona and wide glow
        ShaderEffect {
          id: sun
          anchors.fill: parent
          readonly property real rpx: Scene.sunRadiusMix(root.scaleMix) * stage.k
          property vector2d size: Qt.vector2d(width, height)
          property vector2d center: Qt.vector2d(stage.sx(Scene.CX), stage.sy(Scene.CY))
          property real rsun: Math.max(rpx, 0.6)
          // Corona scale: follows the disc, so it is the video's at enlarged size
          // and blends smoothly while flying to real size.
          property real ks: Math.max(rpx / Scene.SUN_R_VIDEO, 0.5 * stage.sv)
          // The wide glow is a camera effect: it stops growing once zoomed in.
          property real kb: Math.min(ks, 4.5 * stage.sv)
          property real t: root.coronaT
          property vector4d pole: Qt.vector4d(root.sunOrient.n[0], root.sunOrient.n[1], root.sunOrient.n[2], 0)
          property vector4d meridian: Qt.vector4d(root.sunOrient.m[0], root.sunOrient.m[1], root.sunOrient.m[2], 0)
          property vector4d east: Qt.vector4d(root.sunOrient.e[0], root.sunOrient.e[1], root.sunOrient.e[2], 0)
          property var surf: Image { source: "assets/sun_surface.png"; smooth: true; visible: false }
          property var rays: Image { source: "assets/rays.png"; smooth: false; visible: false }
          // Close up, fade into the photo of the Sun (loaded only when needed)
          property real detail: Math.max(0, Math.min(1, (rpx - 60) / 80))
          property var photo: Image { source: sun.detail > 0 ? "textures/sun.jpg" : "assets/rays.png"; smooth: true; mipmap: true; visible: false }
          fragmentShader: "shaders/sun.frag.qsb"
        }

        // Planets and moons, farthest first
        Item {
          anchors.fill: parent
          Repeater {
            model: Scene.BODIES.length
            delegate: ShaderEffect {
              id: body
              required property int index
              readonly property var info: Scene.BODIES[index]
              readonly property var st: root.bodies[index] || null
              readonly property real rpx: st ? Math.max(st.r * stage.k, info.moon ? 0.6 : 1.0) : 1
              readonly property real cxs: st ? stage.sx(st.x) : -1e6
              readonly property real cys: st ? stage.sy(st.y) : -1e6
              property real sz: 2 * Math.ceil(rpx * (info.rings ? 2.4 : 1) + 2)
              property real r: rpx
              property real rings: info.rings ? 1 : 0
              property vector4d light: st ? Qt.vector4d(st.light[0], st.light[1], st.light[2], 0) : Qt.vector4d(0, 0, 1, 0)
              property vector4d atmos: info.atmos ? Qt.vector4d(info.atmos[0], info.atmos[1], info.atmos[2], 1) : Qt.vector4d(0, 0, 0, 0)
              property var tex: Image { source: "assets/" + body.info.file + ".png"; smooth: true; visible: false }
              property var ringTex: Image { source: "assets/ring.png"; smooth: true; visible: false }
              // Close up, fade into the photo globe (loaded only when needed)
              property real detail: info.photo ? Math.max(0, Math.min(1, (rpx - 14) / 30)) : 0
              property real earth: info.earth ? 1 : 0
              // Real orientation: north pole, prime meridian and 90 degrees east, on screen
              readonly property var o: st && st.orient ? st.orient : null
              property vector4d pole: o ? Qt.vector4d(o.n[0], o.n[1], o.n[2], 0) : Qt.vector4d(0, -0.9165, 0.4, 0)
              property vector4d meridian: o ? Qt.vector4d(o.m[0], o.m[1], o.m[2], 0) : Qt.vector4d(0, 0.4, 0.9165, 0)
              property vector4d east: o ? Qt.vector4d(o.e[0], o.e[1], o.e[2], 0) : Qt.vector4d(1, 0, 0, 0)
              readonly property bool near: detail > 0
              property var photo: Image { source: body.near ? "textures/" + body.info.photo : "assets/ring.png"; smooth: true; mipmap: true; visible: false }
              property var cloudTex: Image { source: body.near && body.info.earth ? "textures/earth_clouds.jpg" : "assets/ring.png"; smooth: true; mipmap: true; visible: false }
              property var nightTex: Image { source: body.near && body.info.earth ? "textures/earth_nightmap.jpg" : "assets/ring.png"; smooth: true; mipmap: true; visible: false }
              x: cxs - sz / 2
              y: cys - sz / 2
              width: sz
              height: sz
              z: st ? -st.depth : 0
              visible: !!st && (!info.moon || root.showMoons)
                       && x < stage.width && y < stage.height && x + sz > 0 && y + sz > 0
              fragmentShader: "shaders/body.frag.qsb"
            }
          }
        }
      }

      // Swallow every click, scroll and drag so nothing on the background reacts.
      MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.AllButtons
        hoverEnabled: false
        preventStealing: true
        onPressed: function(mouse) { mouse.accepted = true }
        onWheel: function(wheel) { wheel.accepted = true }
      }
    }
  }
}
