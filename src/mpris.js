const { Gio, GLib } = imports.gi

const SCHEMA = `
  <!DOCTYPE node PUBLIC
    "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
    "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
  <node>
      <interface name="org.freedesktop.DBus.Introspectable">
          <method name="Introspect">
              <arg name="data" direction="out" type="s"/>
          </method>
      </interface>
      <interface name="org.freedesktop.DBus.Properties">
          <method name="Get">
              <arg name="interface" direction="in" type="s"/>
              <arg name="property" direction="in" type="s"/>
              <arg name="value" direction="out" type="v"/>
          </method>
          <method name="Set">
              <arg name="interface_name" direction="in" type="s"/>
              <arg name="property_name" direction="in" type="s"/>
              <arg name="value" direction="in" type="v"/>
          </method>
          <method name="GetAll">
              <arg name="interface" direction="in" type="s"/>
              <arg name="properties" direction="out" type="a{sv}"/>
          </method>
          <signal name="PropertiesChanged">
              <arg name="interface_name" type="s" />
              <arg name="changed_properties" type="a{sv}" />
              <arg name="invalidated_properties" type="as" />
          </signal>
      </interface>
      <interface name="org.mpris.MediaPlayer2">
          <method name="Raise">
          </method>
          <method name="Quit">
          </method>
          <property name="CanQuit" type="b" access="read" />
          <property name="Fullscreen" type="b" access="readwrite" />
          <property name="CanRaise" type="b" access="read" />
          <property name="HasTrackList" type="b" access="read"/>
          <property name="Identity" type="s" access="read"/>
          <property name="DesktopEntry" type="s" access="read"/>
          <property name="SupportedUriSchemes" type="as" access="read"/>
          <property name="SupportedMimeTypes" type="as" access="read"/>
      </interface>
      <interface name="org.mpris.MediaPlayer2.Player">
          <method name="Next"/>
          <method name="Previous"/>
          <method name="Pause"/>
          <method name="PlayPause"/>
          <method name="Stop"/>
          <method name="Play"/>
          <method name="Seek">
              <arg direction="in" name="Offset" type="x"/>
          </method>
          <method name="SetPosition">
              <arg direction="in" name="TrackId" type="o"/>
              <arg direction="in" name="Position" type="x"/>
          </method>
          <method name="OpenUri">
              <arg direction="in" name="Uri" type="s"/>
          </method>
          <signal name="Seeked">
              <arg name="Position" type="x"/>
          </signal>
          <property name="PlaybackStatus" type="s" access="read"/>
          <property name="LoopStatus" type="s" access="readwrite"/>
          <property name="Rate" type="d" access="readwrite"/>
          <property name="Shuffle" type="b" access="readwrite"/>
          <property name="Metadata" type="a{sv}" access="read">
          </property>
          <property name="Position" type="x" access="read"/>
          <property name="MinimumRate" type="d" access="read"/>
          <property name="MaximumRate" type="d" access="read"/>
          <property name="CanGoNext" type="b" access="read"/>
          <property name="CanGoPrevious" type="b" access="read"/>
          <property name="CanPlay" type="b" access="read"/>
          <property name="CanPause" type="b" access="read"/>
          <property name="CanSeek" type="b" access="read"/>
          <property name="CanControl" type="b" access="read"/>
      </interface>
      <interface name="org.mpris.MediaPlayer2.TrackList">
          <method name="GetTracksMetadata">
              <arg direction="in" name="TrackIds" type="ao"/>
              <arg direction="out" name="Metadata" type="aa{sv}">
              </arg>
          </method>
          <method name="AddTrack">
              <arg direction="in" name="Uri" type="s"/>
              <arg direction="in" name="AfterTrack" type="o"/>
              <arg direction="in" name="SetAsCurrent" type="b"/>
          </method>
          <method name="RemoveTrack">
              <arg direction="in" name="TrackId" type="o"/>
          </method>
          <method name="GoTo">
              <arg direction="in" name="TrackId" type="o"/>
          </method>
          <signal name="TrackListReplaced">
              <arg name="Tracks" type="ao"/>
              <arg name="CurrentTrack" type="o"/>
          </signal>
          <property name="Tracks" type="ao" access="read"/>
          <property name="CanEditTracks" type="b" access="read"/>
      </interface>
      <interface name="org.mpris.MediaPlayer2.Playlists">
          <method name="ActivatePlaylist">
              <arg direction="in" name="PlaylistId" type="o" />
          </method>
          <method name="GetPlaylists">
              <arg direction="in" name="Index" type="u" />
              <arg direction="in" name="MaxCount" type="u" />
              <arg direction="in" name="Order" type="s" />
              <arg direction="in" name="ReverseOrder" type="b" />
              <arg direction="out" name="Playlists" type="a(oss)" />
          </method>
          <property name="PlaylistCount" type="u" access="read" />
          <property name="Orderings" type="as" access="read" />
          <property name="ActivePlaylist" type="(b(oss))" access="read" />
          <signal name="PlaylistChanged">
              <arg name="Playlist" type="(oss)" />
          </signal>
      </interface>
  </node>
`

var DbusListener = class DbusListener {
  constructor (app, controllers) {
    log('INIT D-BUS: ' + app)

    this._id = app
    this._dbus = null
    this._controllers = controllers

    Gio.bus_get(Gio.BusType.SESSION, null, this._onConnection.bind(this))
  }

  _onConnection (source, result, name) {
    const sessionName = `org.mpris.MediaPlayer2.${this._id}`
    const path = '/org/mpris/MediaPlayer2'

    this._methods = new Map()

    this._dbus = Gio.bus_get_finish(result)

    Gio.bus_own_name_on_connection(this._dbus, sessionName, Gio.BusNameOwnerFlags.NONE, null, null)

    const definition = Gio.DBusNodeInfo.new_for_xml(SCHEMA)

    for (const interfaceInfo of definition.interfaces) {
      const id = this._dbus.register_object(path, interfaceInfo, this._onMethodCall.bind(this), null, null)

      for (const methodInfo of interfaceInfo.methods) {
        const output = methodInfo.out_args.map(arg => arg.signature).join('')
        const input = methodInfo.in_args.map(arg => arg.signature)

        this._methods.set(`${interfaceInfo.name}:${methodInfo.name}`, { input, output })
      }
    }

    log('D-BUS OK!')
  }

  _onMethodCall (dbus, busName, objectPath, interfaceName, methodName, args, invocation) {
    if (this._controllers.has(interfaceName)) {
      args = args.unpack().map(a => {
        switch (a.get_type_string()) {
          case 's':
            return a.get_string()[0]

          default:
            return null
        }
      })

      const controller = this._controllers.get(interfaceName)
      const func = methodName.replace(/^[A-Z]/, c => c.toLowerCase())

      const result = controller[func](...args)
      const methodInfo = this._methods.get(`${interfaceName}:${methodName}`)

      if (methodInfo.output) {
        invocation.return_value(new GLib.Variant(`(${methodInfo.output})`, [result]))
      } else {
        invocation.return_value(null)
      }
    } else {
      log(`GOT unsupported method call ${interfaceName}::${methodName}.`)
    }
  }
}

var RemoteControls = class RemoteControls {
  constructor (application, controls) {
    const app = application.application_id

    const controllers = new Map([
      ['org.freedesktop.DBus.Properties', new DbusProperties(app, controls)],
      ['org.mpris.MediaPlayer2.Player', new MprisPlayer(controls)],
      ['org.mpris.MediaPlayer2.Playlists', new MprisPlaylists()],
    ])

    this.listener = new DbusListener(app, controllers)
  }
}

var DbusProperties = class DbusProperties {
  constructor (app, controls) {
    this._app = app
    this._controls = controls
  }

  getAll (interfaceName) {
    switch (interfaceName) {
      case 'org.mpris.MediaPlayer2':
        return {
          CanQuit: new GLib.Variant('b', true),
          CanSetFullscreen: new GLib.Variant('b', false),
          Fullscreen: new GLib.Variant('b', false),
          HasTracklist: new GLib.Variant('b', false),
          Identity: new GLib.Variant('s', 'Monolake'),
          DesktopEntry: new GLib.Variant('s', this._app),
          SupportedUriSchemes: new GLib.Variant('as', [
            'file'
          ]),
          SupportedMimeTypes: new GLib.Variant('as', [
            'application/ogg',
            'audio/x-flac',
            'audio/mpeg'
          ])
        }
        break

      case 'org.mpris.MediaPlayer2.Playlists':
        return {
          ActivePlaylist: GLib.Variant.new_tuple(
            [new GLib.Variant('b', false),
            new GLib.Variant('as', ['', '', ''])]
          ),
          // ActivePlaylist: GLib.Variant.new_tuple('b', 'oss'),
          Orderings: new GLib.Variant('as', ['Alphabetical']),
          PlaylistCount: new GLib.Variant('u', 0),
        }
        break

      case 'org.mpris.MediaPlayer2.Player': {
        const playing = this._controls.player.playing

        return {
          CanControl: new GLib.Variant('b', true),
          CanGoNext: new GLib.Variant('b', true),
          CanGoPrevious: new GLib.Variant('b', true),
          CanPause: new GLib.Variant('b', true),
          CanPlay: new GLib.Variant('b', true),
          CanSeek: new GLib.Variant('b', true),
          LoopStatus: new GLib.Variant('s', 'None'),
          MaximumRate: new GLib.Variant('d', 1.0),
          MinimumRate: new GLib.Variant('d', 1.0),
          PlaybackStatus: new GLib.Variant('s', playing ? 'Playing' : 'Paused'),
          Rate: new GLib.Variant('d', 1.0),
        }
        break
      }

      default:
        logError(new Error(`Unsupported interface '${interfaceName}'.`, 'UnsupportedDBusInterfaceError'))
    }
  }

  set (...args) {
    log('D-BUS SET ' + args)
  }
}

class MprisPlaylists {

}

class MprisPlayer {
  constructor (controls) {
    this.controls = controls
  }

  next () {
    this.controls.next()
  }

  previous () {
    this.controls.previous()
  }

  playPause () {
    this.controls.playOrPause()
  }
}
