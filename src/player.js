const { Gst } = imports.gi
const { EventEmitter } = imports.events
const { Timer } = imports.timer

class Tags {
  constructor (tagList) {
    this.tagList = tagList
  }

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

const PROGRESS_REPORT_INTERVAL = 550

var Player = class Player {
  constructor () {
    Timer.once(this._init.bind(this))

    this.events = new EventEmitter()

    this.timers = {
      progress: null
    }

    this._cachedLastDuration = null
    this._queuedPath = null
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
    this.backend = Gst.parse_launch('playbin name=player sink=dconfaudiosink')
    // this.backend = Gst.ElementFactory.make('playbin', null)

    if (this.backend) {
      this.backend.get_bus().connect('message', this._onMessage.bind(this))
      this.backend.get_bus().add_signal_watch()
    } else {
      logError(new Error('Failed to create Gst player.', 'NullPlaybinError'))
    }
  }

  lastCachedDuration () {
    return this._cachedLastDuration
  }

  play (uri = null) {
    this._queuedPath = null

    if (uri) {
      this.stop()

      this.backend.set_property('uri', uri)
      this.backend.set_state(Gst.State.PLAYING)

      this.events.emit('song-changed', uri)

      /**
       * For some media types, as well as the first song after boot, native event
       * Gst.MessageType.DURATION_CHANGED is not emitted, so this is our simple
       * fallback method.
       */
      Timer.once(100, () => {
        const [ok, duration] = this.backend.query_duration(Gst.Format.TIME)

        if (ok) {
          this._cachedLastDuration = Math.ceil(duration / Math.pow(10, 6))
          this.events.emit('duration-changed', duration / Math.pow(10, 6))
        } else {
          this._cachedLastDuration = null
          this.events.emit('duration-changed', null)
        }
      })

      this.timers.progress = Timer.run(PROGRESS_REPORT_INTERVAL, () => {
        const [ok, position] = this.backend.query_position(Gst.Format.TIME)

        if (ok) {
          const msPos = Math.ceil(position / Math.pow(10, 6))
          this.events.emit('progress-changed', msPos)

          /**
           * FIXME: Connecting to playbin::about-to-finish crashes the whole app,
           * so we need our own workaround.
           */
          if (this.lastCachedDuration() - msPos < PROGRESS_REPORT_INTERVAL) {
            this.events.emit('need-next-song')
          }
        }
      })
    } else if (!this.playing) {
      /**
       * FIXME: Unpausing like that just does not work.
       */
      this.backend.set_state(Gst.State.PLAYING)
    }
  }

  /**
   * Prefetch for playing next song after the current one finishes.
   */
  setPrefetch (uri) {
    /**
     * Recommended way of calling playbin.set_uri() does not do anything, hence
     * using our own fallback solution.
     */
    this._queuedPath = uri
  }

  stop () {
    this._cachedLastDuration = null
    this.backend.set_state(Gst.State.NULL)

    if (this.timers.progress) {
      Timer.stop(this.timers.progress)
      this.timers.progress = null
    }

    this.events.emit('playback-stopped')
    this.events.emit('progress-changed', 0)
    this.events.emit('duration-changed', null)
  }

  pause () {
    if (this.playing) {
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
        if (this._queuedPath) {
          // this.stop()
          this.play(this._queuedPath)
        } else {
          this.stop()
        }
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
            this._cachedLastDuration = duration / Math.pow(10, 6)
            this.events.emit('duration-changed', this._cachedLastDuration)
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
        // const names = Object.getOwnPropertyNames(Gst.MessageType)
        //
        // for (const name of names) {
        //   if (Gst.MessageType[name] === message.type) {
        //     log(`GST '${name}' (${message.type})`)
        //   }
        // }
      }
    }
  }
}
