const { Gst } = imports.gi
const { EventEmitter } = imports.events
const { Timer } = imports.timer

// log('PROPS: ' + Object.getOwnPropertyNames(Gst.Format))

class Tags {
  constructor (tagList) {
    this.tagList = tagList
  }

  // isSame (otherTagList) {
  //   return ['title', 'artist', 'album', 'genre'].every(
  //     field => this.tagList.get_string(f) === otherTagList.get_string(field)
  //   )
  // }

  get title () {
    return this.tagList.get_string('title')[1]
  }

  get artist () {
    return this.tagList.get_string('artist')[1]
  }

  get album () {
    return this.tagList.get_string('album')[1]
  }

  get genre () {
    return this.tagList.get_string('genre')[1]
  }
}

const PROGRESS_INTERVAL = 500

var Player = class Player {
  constructor () {
    Timer.once(this._init.bind(this))

    this.events = new EventEmitter()

    this.timers = {
      progress: null
    }
  }

  get playing () {
    /**
     * Not completely sure of these but according to "some docs" it should be
     * like this.
     */
    const [state, pending, timeout] = this.backend.get_state(100)

    return pending === Gst.State.PLAYING
  }

  _init () {
    this.backend = Gst.parse_launch('playbin name=player sink=gtksink')

    if (this.backend) {
      this.backend.get_bus().connect('message', this._onMessage.bind(this))
      this.backend.get_bus().add_signal_watch()

      this.paused = true
    } else {
      logError(new Error('Failed to create Gst player.', 'NullPlaybinError'))
    }
  }

  play (uri = null) {
    if (uri) {
      this.stop()

      this.paused = false

      // this.backend.set_state(Gst.State.NULL)
      this.backend.get_bus().add_signal_watch()
      this.backend.set_property('uri', uri)
      this.backend.set_state(Gst.State.PLAYING)

      this.events.emit('song-changed', uri)

      this.timers.progress = Timer.run(PROGRESS_INTERVAL, () => {
        const [ok, position] = this.backend.query_position(Gst.Format.TIME)

        if (ok) {
          this.events.emit('progress-changed', Math.ceil(position / Math.pow(10, 6)))
        }
      })
    } else if (this.paused) {
      /**
       * FIXME: Unpausing like that just does not work.
       */
      this.backend.set_state(Gst.State.PLAYING)
    }
  }

  stop () {
    this.backend.get_bus().remove_signal_watch()
    this.backend.get_bus().remove_watch()
    this.backend.set_state(Gst.State.NULL)

    if (this.timers.progress) {
      Timer.stop(this.timers.progress)
    }

    this.events.emit('playback-stopped')
    this.events.emit('progress-changed', 0)
    this.events.emit('duration-changed', null)
  }

  pause () {
    if (this.playing) {
      this.paused = true
      this.backend.set_state(Gst.State.PAUSED)
    }
  }

  seekTo (value) {
    const flags = Gst.SeekFlags.FLUSH | Gst.SeekFlags.TRICKMODE
    value *= Math.pow(10, 6)

    this.backend.seek_simple(Gst.Format.TIME, flags, value)
  }

  _onMessage (sender, message) {
    if (!message) {
      return
    }

    switch (message.type) {
      case Gst.MessageType.TAG: {
        const tagList = new Tags(message.parse_tag())
        this.events.emit('metadata-changed', tagList)
        break
      }

      case Gst.MessageType.EOS:
        log('PLAYBACK STOPPED')
        this.stop()
        break

      case Gst.MessageType.WARNING: {
        const content = message.parse_warning()[0].toString()
        logError(new Error(content), 'GStreamerWarning')
        break
      }

      case Gst.MessageType.ERROR: {
        const content = message.parse_warning()[0].toString()
        logError(new Error(content), 'GStreamerError')

        this.stop()
        break
      }

      case Gst.MessageType.STREAM_START:
        this.events.emit('playback-started')
        break

      case Gst.MessageType.PROGRESS:
        log('PLAYER PROGRESS')
        break

      case Gst.MessageType.DURATION_CHANGED: {
        /**
         * Sometimes querying for the duration straight away will fail, small
         * delays seems to fix that.
         */
        Timer.once(10, () => {
          const [ok, duration] = this.backend.query_duration(Gst.Format.TIME)

          if (ok) {
            this.events.emit('duration-changed', duration / Math.pow(10, 6))
          } else {
            this.events.emit('duration-changed', null)
          }
        })
        break
      }

      case Gst.MessageType.STATE_CHANGED:
        // Filter out this message.
        break

      default: {
        const names = Object.getOwnPropertyNames(Gst.MessageType)

        for (const name of names) {
          if (Gst.MessageType[name] === message.type) {
            // log(`GST '${name}' (${message.type})`)
          }
        }
      }
    }
  }
}
