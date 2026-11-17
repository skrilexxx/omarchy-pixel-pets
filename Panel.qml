import QtQuick
import qs.Commons
import qs.Ui
import "Brain.js" as Brain

// Bar button + settings panel. Settings live on the pet service (Service.qml),
// which saves them; this file only reads and writes them.
Panel {
  id: root
  moduleName: "skrilexxx.pixel-pets"

  // Per species: the settings that hold its name and coat, its coats (sheets in sprites/) and toy.
  readonly property var species: ({
    cat: {
      label: "Cat", nameKey: "name", coatKey: "coat", toy: "Give yarn ball",
      coats: [
        { value: "orange", label: "Orange" },
        { value: "grey", label: "Grey" },
        { value: "black", label: "Tuxedo" },
        { value: "white", label: "White" },
        { value: "cream", label: "Cream" }
      ]
    },
    dog: {
      label: "Dog", nameKey: "dogName", coatKey: "dogCoat", toy: "Throw tennis ball",
      coats: [
        { value: "golden", label: "Golden" },
        { value: "shiba", label: "Shiba" },
        { value: "husky", label: "Husky" },
        { value: "dalmatian", label: "Dalmatian" },
        { value: "chocolate", label: "Choco" }
      ]
    }
  })
  // The species that are out: one of them, or both.
  readonly property var out: Object.keys(species).filter(function(k) {
    return store && (store.species === k || store.species === "both")
  })
  // nf-md-cat, nf-md-dog, or nf-md-paw for both
  readonly property int icon: out.length > 1 ? 0xF03E9 : out[0] === "dog" ? 0xF0A43 : 0xF011B

  // What each control does, shown in the help line while the pointer is on it.
  readonly property var helpTexts: ({
    species: ["Pets", "A cat, a dog, or both. With both out they visit each other, play, nap side by side, and the dog sometimes chases the cat."],
    shown: ["Show pets", "Hides or shows whoever is picked here. Right-clicking the bar icon does the same."],
    cat: ["Cat", "Her name pops up when you pet her. A new coat shows on the desktop right away."],
    dog: ["Dog", "His name pops up when you pet him. A new coat shows on the desktop right away."],
    size: ["Size", "Sets both. The dog is always one step bigger than the cat."],
    energy: ["Energy", "More walking and play, less sleep, and more things done on their own: visits, the dog chasing the cat (not when lazy), zoomies (only near playful). Toys they bring unasked (dog four times a day, cat once) and trips off screen don't depend on it."],
    dayCycle: ["Follow time of day", "Off: energy stays where the slider is, all day. On: lively mornings, sleepy evenings and nights around it. The phase right now shows next to ENERGY."],
    cameraShy: ["Camera shy", "They run off screen once the screen or a window has been shared for a few seconds, and come back about 15 seconds after it stops. A screenshot or a quick thumbnail doesn't count."],
    wander: ["Wander off", "Each leaves the screen now and then on its own clock and comes back a few minutes later: the cat is away about half the time, the dog about a fifth. A toy or a due reminder calls them back. Off: they stay on screen, and whoever is away comes back."],
    chaseMouse: ["Stalk the pointer", "They crouch and pounce at the pointer when it moves near the bottom edge. Off: they ignore it, and a toy they bring is dropped anywhere, not below the pointer."],
    hangOnWindows: ["Cat climbs windows", "She climbs windows, on her own and to escape the dog: onto the top to walk, sit and nap if there is room above. Right under the bar a small cat prowls and naps in front of it (a click shoos her down, claws out); a bigger one peeks over. Off: she stays on the floor."],
    reminders: ["Care reminders", "On a timer a pet sits with a speech bubble asking for water, food or a break; with both out they take turns. Click it to serve: it drinks, eats, or gets its toy. Ignored for five minutes, it comes over to the pointer."],
    intervals: ["How often", "How long after the last water, food or break the next reminder comes. Being away from the desk for five minutes starts all three again."],
    catToy: ["Give yarn ball", "Double-clicking her does the same. She chases and bats it around; you can drag and throw it. Hold it up high for five seconds and she gets the zoomies. Giving it calls her back if she is off screen."],
    dogToy: ["Throw tennis ball", "Double-clicking him does the same. He fetches it back to where it was thrown from and barks for more. Hold it up high for five seconds and he gets the zoomies. Throwing it calls him back if he is off screen."]
  })
  property string helpKey: ""
  function over(key, isHovered) {
    if (isHovered) helpKey = key
    else if (helpKey === key) helpKey = ""
  }
  readonly property string helpText: {
    var entry = helpTexts[helpKey]
    if (!entry) return "Point at a setting to read what it does here. Click a pet to pet it, drag it to pick it up, right-click the bar icon to hide or show them."
    return "<font color=\"" + root.bar.foreground + "\"><b>" + entry[0] + ".</b></font> " + entry[1]
  }

  // The service is created independently of the bar, so look it up when needed.
  property var pet: null
  function findPet() {
    var shell = root.bar ? root.bar.shell : null
    pet = shell && typeof shell.serviceFor === "function" ? shell.serviceFor(root.moduleName) : null
  }
  readonly property var store: pet ? pet.settings : null
  function set(key, value) { if (store) store[key] = value }

  onOpenedChanged: if (opened) findPet()
  Component.onCompleted: findPet()

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: String.fromCodePoint(root.icon)
    tooltipText: ""
    dimmed: root.store ? !root.store.shown : false
    onPressed: function(b) {
      if (b === Qt.RightButton) {
        root.findPet()
        root.set("shown", !(root.store && root.store.shown))
      } else root.toggle()
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(380))
    contentHeight: panel.fittedContentHeight(column.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Column {
        id: column
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        spacing: Style.space(14)

        Text {
          visible: !root.store
          width: parent.width
          wrapMode: Text.WordWrap
          text: "The pet isn't running. Enable it with: omarchy plugin enable skrilexxx.pixel-pets"
          color: root.bar.foreground
          font.family: root.bar.fontFamily
          font.pixelSize: Style.font.body
        }

        // ---------- Which pets, and whether they show ----------
        Section {
          Item {
            width: parent.width
            implicitHeight: petsHeader.implicitHeight

            PanelSectionHeader {
              id: petsHeader
              text: "PETS"
              foreground: root.bar.foreground
              fontFamily: root.bar.fontFamily
            }

            Row {
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              spacing: Style.space(6)

              PanelSectionHeader {
                id: showLabel
                text: "SHOW"
                foreground: root.bar.foreground
                fontFamily: root.bar.fontFamily
                anchors.verticalCenter: parent.verticalCenter
              }

              // Sized off the label so it reads as part of the header; the offset centres it on
              // the label's glyphs, which sit below the box centre because of its top padding.
              ToggleSwitch {
                trackHeight: Math.round(showLabel.font.pixelSize * 1.2)
                cursorPad: Style.space(3)
                anchors.verticalCenter: showLabel.verticalCenter
                anchors.verticalCenterOffset: Math.round(showLabel.topPadding / 2)
                checked: root.store ? root.store.shown : false
                foreground: root.bar.foreground
                onToggled: root.set("shown", !(root.store && root.store.shown))
                onHovered: function(isHovered) { root.over("shown", isHovered) }
              }
            }
          }

          ButtonGroup {
            width: parent.width
            options: [
              { value: "cat", label: "Cat" },
              { value: "dog", label: "Dog" },
              { value: "both", label: "Both" }
            ]
            value: root.store ? root.store.species : ""
            foreground: root.bar.foreground
            fontFamily: root.bar.fontFamily
            fontSize: Style.font.bodySmall
            onChanged: function(v) { root.set("species", v) }
            onHovered: function(index, isHovered) { root.over("species", isHovered) }
          }
        }

        // ---------- Per pet, side by side: live preview · name · coat ----------
        Row {
          id: cells
          visible: !!root.store
          width: parent.width
          spacing: Style.space(6)
          // One pet takes the full width, two share it.
          readonly property real cellWidth: (width - spacing * (root.out.length - 1)) / Math.max(1, root.out.length)

          Repeater {
            model: root.out

            Item {
              id: cell
              required property string modelData
              readonly property var kind: root.species[modelData]

              width: cells.cellWidth
              implicitHeight: preview.height

              HoverHandler { onHoveredChanged: root.over(cell.modelData, hovered) }

              AnimatedSprite {
                id: preview
                width: 64
                height: 64
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                source: root.pet ? root.pet.spriteUrlOf(cell.modelData) : ""
                frameWidth: 32
                frameHeight: 32
                frameY: Brain.ANIMS.idle.row * 32
                frameCount: Brain.ANIMS.idle.frames
                frameRate: Brain.ANIMS.idle.fps
                running: root.opened
                interpolate: false
                smooth: false
              }

              Column {
                anchors.left: preview.right
                anchors.leftMargin: Style.space(10)
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(4)

                TextField {
                  width: parent.width
                  text: root.store ? root.store[cell.kind.nameKey] : ""
                  maximumLength: 24
                  placeholderText: "Name"
                  foreground: root.bar.foreground
                  font.family: root.bar.fontFamily
                  onEditingFinished: root.set(cell.kind.nameKey, text.trim())
                }

                Dropdown {
                  width: parent.width
                  showLabel: false
                  options: cell.kind.coats
                  value: root.pet ? root.pet.coatOf(cell.modelData) : ""
                  foreground: root.bar.foreground
                  fontFamily: root.bar.fontFamily
                  onChanged: function(v) { root.set(cell.kind.coatKey, v) }
                }
              }
            }
          }
        }

        PanelSeparator { visible: !!root.store; foreground: root.bar.foreground }

        Section {
          title: "SIZE"
          ButtonGroup {
            width: parent.width
            options: [
              { value: "small", label: "Small" },
              { value: "medium", label: "Medium" },
              { value: "large", label: "Large" }
            ]
            value: root.store ? root.store.size : ""
            foreground: root.bar.foreground
            fontFamily: root.bar.fontFamily
            fontSize: Style.font.bodySmall
            onChanged: function(v) { root.set("size", v) }
            onHovered: function(index, isHovered) { root.over("size", isHovered) }
          }
        }

        Section {
          // The header carries what the time of day is doing to the energy right now.
          Item {
            width: parent.width
            implicitHeight: energyHeader.implicitHeight

            PanelSectionHeader {
              id: energyHeader
              text: "ENERGY"
              foreground: root.bar.foreground
              fontFamily: root.bar.fontFamily
            }
            Text {
              visible: root.store ? root.store.dayCycle : false
              anchors.right: parent.right
              anchors.rightMargin: Style.space(6)
              anchors.verticalCenter: parent.verticalCenter
              text: root.pet ? Brain.dayPhase(root.pet.hour) : ""
              color: Qt.darker(root.bar.foreground, 1.4)
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.caption
              font.bold: true
            }
          }

          Item {
            width: parent.width
            implicitHeight: energySlider.implicitHeight

            HoverHandler { onHoveredChanged: root.over("energy", hovered) }

            Text {
              id: lazyLabel
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              text: "Lazy"
              color: Qt.darker(root.bar.foreground, 1.4)
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.caption
            }
            Text {
              id: playfulLabel
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              text: "Playful"
              color: Qt.darker(root.bar.foreground, 1.4)
              font.family: root.bar.fontFamily
              font.pixelSize: Style.font.caption
            }
            PanelSlider {
              id: energySlider
              anchors.left: lazyLabel.right
              anchors.leftMargin: Style.space(8)
              anchors.right: playfulLabel.left
              anchors.rightMargin: Style.space(8)
              anchors.verticalCenter: parent.verticalCenter
              bar: root.bar
              value: root.store ? root.store.energy : 0.5
              minimum: 0
              maximum: 1
              step: 0.1
              onReleased: function(v) { root.set("energy", v) }
            }
          }
        }

        PanelSeparator { visible: !!root.store; foreground: root.bar.foreground }

        // ---------- Switches, two by two ----------
        Grid {
          id: switches
          visible: !!root.store
          width: parent.width
          columns: 2
          rowSpacing: Style.space(6)
          columnSpacing: Style.space(6)
          readonly property real cellWidth: (width - columnSpacing) / 2

          Toggle {
            width: switches.cellWidth
            label: "Time of day"
            checked: root.store ? root.store.dayCycle : false
            foreground: root.bar.foreground
            fontFamily: root.bar.fontFamily
            onClicked: root.set("dayCycle", !checked)
            onHovered: function(isHovered) { root.over("dayCycle", isHovered) }
          }
          Toggle {
            width: switches.cellWidth
            label: "Camera shy"
            checked: root.store ? root.store.cameraShy : false
            foreground: root.bar.foreground
            fontFamily: root.bar.fontFamily
            onClicked: root.set("cameraShy", !checked)
            onHovered: function(isHovered) { root.over("cameraShy", isHovered) }
          }
          Toggle {
            width: switches.cellWidth
            label: "Wander off"
            checked: root.store ? root.store.wander : false
            foreground: root.bar.foreground
            fontFamily: root.bar.fontFamily
            onClicked: root.set("wander", !checked)
            onHovered: function(isHovered) { root.over("wander", isHovered) }
          }
          Toggle {
            width: switches.cellWidth
            label: "Stalk pointer"
            checked: root.store ? root.store.chaseMouse : false
            foreground: root.bar.foreground
            fontFamily: root.bar.fontFamily
            onClicked: root.set("chaseMouse", !checked)
            onHovered: function(isHovered) { root.over("chaseMouse", isHovered) }
          }
          Toggle {
            visible: root.out.some(function(k) { return Brain.traits({ species: k }).climbs })
            width: switches.cellWidth
            label: "Climb windows"
            checked: root.store ? root.store.hangOnWindows : false
            foreground: root.bar.foreground
            fontFamily: root.bar.fontFamily
            onClicked: root.set("hangOnWindows", !checked)
            onHovered: function(isHovered) { root.over("hangOnWindows", isHovered) }
          }
          Toggle {
            width: switches.cellWidth
            label: "Reminders"
            checked: root.store ? root.store.reminders : false
            foreground: root.bar.foreground
            fontFamily: root.bar.fontFamily
            onClicked: root.set("reminders", !checked)
            onHovered: function(isHovered) { root.over("reminders", isHovered) }
          }
        }

        // ---------- How often each reminder comes; shown while reminders are on ----------
        Row {
          id: intervals
          visible: !!root.store && root.store.reminders
          width: parent.width
          spacing: Style.space(6)

          Interval { title: "Water"; key: "waterMinutes"; choices: [30, 45, 60] }
          Interval { title: "Food"; key: "foodMinutes"; choices: [180, 240, 300] }
          Interval { title: "Break"; key: "breakMinutes"; choices: [45, 60, 90] }
        }

        // ---------- Toys: each under its pet ----------
        Row {
          visible: !!root.store
          width: parent.width
          spacing: cells.spacing

          Repeater {
            model: root.out

            Button {
              required property string modelData
              width: cells.cellWidth
              iconText: String.fromCodePoint(0xF03E9)   // nf-md-paw
              text: root.species[modelData].toy
              bordered: true
              enabled: root.store ? root.store.shown : false
              foreground: root.bar.foreground
              fontFamily: root.bar.fontFamily
              onClicked: if (root.pet) root.pet.giveBall(modelData)
              onHovered: function(isHovered) { root.over(modelData + "Toy", isHovered) }
            }
          }
        }

        PanelSeparator { visible: !!root.store; foreground: root.bar.foreground }

        // ---------- What the thing under the pointer does ----------
        // A fixed five lines, so the panel never changes height as the pointer moves.
        Text {
          id: helpLine
          visible: !!root.store
          width: parent.width
          height: Math.ceil(helpMetrics.lineSpacing * 5)
          wrapMode: Text.WordWrap
          maximumLineCount: 5
          elide: Text.ElideRight
          textFormat: Text.StyledText
          text: root.helpText
          color: Qt.darker(root.bar.foreground, 1.4)
          font.family: root.bar.fontFamily
          font.pixelSize: Style.font.caption

          FontMetrics {
            id: helpMetrics
            font: helpLine.font
          }
        }
      }
    }
  }

  // How often one reminder comes, in minutes: a third of the row.
  component Interval: Dropdown {
    property string title: ""
    property string key: ""
    property var choices: []
    width: (intervals.width - 2 * intervals.spacing) / 3
    label: title
    options: choices.map(m => ({ value: String(m), label: m % 60 ? m + " min" : m / 60 + " h" }))
    value: root.store ? String(root.store[key]) : ""
    foreground: root.bar.foreground
    fontFamily: root.bar.fontFamily
    onChanged: function(v) { root.set(key, Number(v)) }
    onHovered: function(isHovered) { root.over("intervals", isHovered) }
  }

  component Section: Column {
    property string title: ""
    visible: !!root.store
    width: parent.width
    spacing: Style.space(8)

    PanelSectionHeader {
      visible: parent.title !== ""
      text: parent.title
      foreground: root.bar.foreground
      fontFamily: root.bar.fontFamily
    }
  }
}
