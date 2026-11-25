import QtQuick
import Quickshell
import qs.Ui
import qs.Commons
import qs.Commons as Commons

// Bar button + settings panel for the solar system wallpaper.
// Left click opens the panel, right click shows/hides the solar system.
Panel {
  id: root
  moduleName: "mog.solar-system"
  ipcTarget: "mog.solar-system"

  // The wallpaper service of this same plugin; looked up again whenever the
  // panel opens, since the shell may have restarted it.
  property var svc: null
  function findService() {
    var s = root.bar && root.bar.shell ? root.bar.shell : null
    svc = s && typeof s.serviceFor === "function" ? s.serviceFor("mog.solar-system") : null
  }
  Component.onCompleted: findService()
  onOpenedChanged: if (opened) findService()
  Timer { interval: 2000; running: !root.svc; repeat: true; onTriggered: root.findService() }

  readonly property bool shownNow: !!svc && svc.shown
  readonly property color fg: root.bar ? root.bar.foreground : Commons.Color.foreground
  readonly property string font: root.bar ? root.bar.fontFamily : Style.font.family


  readonly property var speeds: [
    { value: "1", label: "Live" },
    { value: "60", label: "1 min/s" },
    { value: "3600", label: "1 h/s" },
    { value: "86400", label: "1 day/s" },
    { value: "604800", label: "1 wk/s" },
    { value: "2629800", label: "1 mo/s" }
  ]
  readonly property var targets: [
    { value: "system", label: "Whole system" }, { value: "sun", label: "Sun" },
    { value: "mercury", label: "Mercury" }, { value: "venus", label: "Venus" },
    { value: "earth", label: "Earth" }, { value: "moon", label: "Moon" },
    { value: "mars", label: "Mars" }, { value: "jupiter", label: "Jupiter" },
    { value: "saturn", label: "Saturn" }, { value: "uranus", label: "Uranus" },
    { value: "neptune", label: "Neptune" }
  ]

  function speedLabel(v) {
    for (var i = 0; i < speeds.length; i++) if (Number(speeds[i].value) === v) return speeds[i].label
    return "×" + v
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    iconComponent: Component {
      SolarIcon { color: root.fg; gap: Commons.Color.bar.background; size: Style.bar.iconCanvas }
    }
    opacity: root.shownNow ? 1.0 : 0.5
    // Scroll over the icon to zoom in or out on the focused body.
    onWheelMoved: function(delta) {
      if (root.svc && root.svc.focusName !== "system") root.svc.zoomBy(delta > 0 ? -0.08 : 0.08)
    }
    onPressed: function(b) {
      if (b === Qt.RightButton) { if (root.svc) root.svc.setShown(!root.svc.shown) }
      else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: panel.loadedContent
    contentWidth: panel.fittedContentWidth(Style.space(400))
    contentHeight: panel.fittedContentHeight(panel.loadedContentHeight, Style.space(640))

    content: PanelKeyCatcher {
      anchors.fill: parent
      implicitHeight: column.implicitHeight
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: column
        width: parent.width
        spacing: Style.space(14)

        // ---- header: icon, title, simulated date, on/off ----
        Item {
          width: parent.width
          implicitHeight: Math.max(heroIcon.implicitHeight, heroText.implicitHeight, power.implicitHeight)

          SolarIcon {
            id: heroIcon
            color: root.fg
            gap: Commons.Color.popups.background
            size: Style.font.display
            opacity: root.shownNow ? 1.0 : 0.5
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
          }

          Column {
            id: heroText
            anchors.left: heroIcon.right
            anchors.leftMargin: Style.space(14)
            anchors.right: power.left
            anchors.rightMargin: Style.space(12)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(2)

            Text {
              textFormat: Text.PlainText
              text: "Solar system"
              color: root.fg
              font.family: root.font
              font.pixelSize: Style.font.subtitle
              font.bold: true
            }
            Text {
              textFormat: Text.PlainText
              width: parent.width
              elide: Text.ElideRight
              text: !root.svc ? "Starting…"
                : (root.svc.live ? "Live · " : root.speedLabel(root.svc.timeScale) + " · ")
                  + Qt.formatDateTime(new Date(root.svc.simMs), "d MMM yyyy  HH:mm")
              color: Qt.darker(root.fg, 1.4)
              font.family: root.font
              font.pixelSize: Style.font.caption
            }
          }

          ToggleSwitch {
            id: power
            checked: root.shownNow
            foreground: root.fg
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            onToggled: if (root.svc) root.svc.setShown(!root.svc.shown)
          }
        }

        PanelSeparator { width: parent.width }

        // ---- speed ----
        PanelSectionHeader { text: "Speed"; foreground: root.fg; fontFamily: root.font }

        ButtonGroup {
          width: parent.width
          options: root.speeds
          value: root.svc ? String(root.svc.timeScale) : "1"
          foreground: root.fg
          fontFamily: root.font
          fontSize: Style.font.caption
          onChanged: function(v) { if (root.svc) root.svc.setTimeScale(Number(v)) }
        }

        Button {
          visible: !!root.svc && !root.svc.live
          text: "Back to now"
          iconText: "󰃰"
          bordered: true
          onClicked: if (root.svc) { root.svc.setTimeScale(1); root.svc.resetTime() }
        }

        // ---- scale ----
        PanelSectionHeader { text: "Scale"; foreground: root.fg; fontFamily: root.font }

        ButtonGroup {
          width: parent.width
          options: [ { value: "video", label: "Enlarged planets" }, { value: "real", label: "Real size" } ]
          value: root.svc ? root.svc.scaleMode : "video"
          foreground: root.fg
          fontFamily: root.font
          fontSize: Style.font.caption
          onChanged: function(v) { if (root.svc) root.svc.setScaleMode(v) }
        }

        // ---- focus ----
        PanelSectionHeader { text: "Focus"; foreground: root.fg; fontFamily: root.font }

        Flow {
          width: parent.width
          spacing: Style.space(6)
          Repeater {
            model: root.targets
            delegate: Button {
              required property var modelData
              text: modelData.label
              selected: !!root.svc && root.svc.focusName === modelData.value
              bordered: true
              onClicked: if (root.svc) root.svc.setFocus(modelData.value)
            }
          }
        }

        // ---- zoom (for a focused body) ----
        Column {
          width: parent.width
          spacing: Style.space(6)
          visible: !!root.svc && root.svc.focusName !== "system"

          Item {
            width: parent.width
            implicitHeight: zoomHeader.implicitHeight
            PanelSectionHeader { id: zoomHeader; text: "Zoom"; foreground: root.fg; fontFamily: root.font }
            Text {
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              textFormat: Text.PlainText
              text: {
                var z = zoomSlider.dragging ? zoomSlider.liveValue : (root.svc ? root.svc.zoom : 0)
                return z < 0.05 ? "Close-up" : z > 0.95 ? "Whole system" : Math.round(z * 100) + "%"
              }
              color: root.fg
              opacity: 0.7
              font.family: root.font
              font.pixelSize: Style.font.caption
            }
          }

          PanelSlider {
            id: zoomSlider
            bar: root.bar
            width: parent.width
            minimum: 0
            maximum: 1
            step: 0.01
            value: root.svc ? root.svc.zoom : 0
            onMoved: function(v) { if (root.svc) root.svc.previewZoom(v) }
            onReleased: function(v) { if (root.svc) root.svc.setZoom(v) }
          }

          Text {
            width: parent.width
            textFormat: Text.PlainText
            wrapMode: Text.WordWrap
            text: "From close-up out to the whole system, with the focused body in the middle. Scroll over the bar icon to zoom too."
            color: root.fg
            opacity: 0.55
            font.family: root.font
            font.pixelSize: Style.font.caption
          }
        }

        PanelSeparator { width: parent.width }

        // ---- display ----
        Toggle {
          width: parent.width
          label: "Orbits"
          description: "Faint lines along each planet's path"
          checked: !!root.svc && root.svc.showOrbits
          foreground: root.fg
          fontFamily: root.font
          onClicked: if (root.svc) root.svc.setShowOrbits(!root.svc.showOrbits)
        }
        Toggle {
          width: parent.width
          label: "Asteroid belt"
          description: "Dust of small bodies between Mars and Jupiter"
          checked: !!root.svc && root.svc.showAsteroids
          foreground: root.fg
          fontFamily: root.font
          onClicked: if (root.svc) root.svc.setShowAsteroids(!root.svc.showAsteroids)
        }
        Toggle {
          width: parent.width
          label: "Moons"
          description: "The Moon and 18 moons of Mars, Jupiter, Saturn, Uranus and Neptune"
          checked: !!root.svc && root.svc.showMoons
          foreground: root.fg
          fontFamily: root.font
          onClicked: if (root.svc) root.svc.setShowMoons(!root.svc.showMoons)
        }
      }
    }
  }
}
