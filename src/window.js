#!env gjs

const { Gio, GObject, Gtk } = imports.gi
const { Collection, CollectionFilterModel, CollectionModel, CollectionSortModel } = imports.collection
const { Queue, QueueModel } = imports.collection
const { Timer } = imports.timer
const utils = imports.utils

var MainWindow = class MainWindow {
  constructor (window, builder, player) {
    this._window = window
    this._builder = builder
    this.player = player

    this.bindSignals()

    this.bindChildren(
      'buttonAppMenu',
      'buttonPlayOrPause',
      'buttonPlayPrevious',
      'buttonPlayNext',
      'buttonToggleSearchBar',
      'collectionView',
      'comboSorting',
      'headerBar',
      'labelFirstProgress',
      'labelSecondProgress',
      'modelSortingOptions',
      'queueView',
      'revealerRightSidebar',
      'scaleSeeker',
      'scrollerInsideRightSidebar',
      'searchBar',
      'searchBarEntry',
    )

    this.collection = new Collection()
    this.collectionModel = new CollectionModel({ collection: this.collection })

    this.queue = new Queue()
    this.queueModel = new QueueModel({ queue: this.queue })

    this.ui.queueView.set_model(null)
    this.ui.queueView.set_model(this.queueModel)

    this.queueWatcher = new SongQueueWatcher(this.player, this.queueModel, this.collectionModel)

    /**
     * BUG: Glade allows to define this but it actually has no effect.
     */
    this.ui.collectionView.set_search_column(-1)
    this.ui.collectionView.get_selection().set_mode(Gtk.SelectionMode.MULTIPLE)

    this.player.events.connect('metadata-changed', this._onMetadataChanged.bind(this))
    this.player.events.connect('playback-started', this._onPlaybackStarted.bind(this))
    this.player.events.connect('playback-stopped', this._onPlaybackStopped.bind(this))
    this.player.events.connect('duration-changed', this._onDurationChanged.bind(this))
    this.player.events.connect('progress-changed', this._onProgressChanged.bind(this))

    const menu = new Gio.Menu()
    menu.append('Preferences', 'app.preferences')
    menu.append('About Monolake', 'app.about')

    this.ui.buttonAppMenu.set_menu_model(menu)
  }

  setup () {
    this.collection.load().then(
      () => {
        this.sortModel = new CollectionSortModel({
          model: this.collectionModel
        })

        this.filterModel = new CollectionFilterModel({
          child_model: this.sortModel
        })

        this.ui.collectionView.set_model(this.filterModel)
      },
      () => log('NOOOOOO')
    )

    this.collection.events.connect('ready', () => {
      log('Got ready event')
    //   this.sortModel = new CollectionSortModel({
    //     model: this.collectionModel
    //   })
    //
    //   this.filterModel = new CollectionFilterModel({
    //     child_model: this.sortModel
    //   })
    //
    //   this.ui.collectionView.set_model(this.filterModel)
    })
  }

  bindSignals () {
    const binder = (builder, object, signal, handler) => {
      object.connect(signal, this[handler].bind(this))
    }

    this._builder.connect_signals_full(binder)
  }

  bindChildren (...widgetNames) {
    this.ui = Object.create(null)

    for (const name of widgetNames) {
      this.ui[name] = this._builder.get_object(name)

      if (!this.ui[name]) {
        throw new Error(`Widget '${name}' does not exist in the UI.`)
      }
    }
  }

  onCollectionRowActivated (view, path, column) {
    const row = utils.mapPathToRootModel(view.model, path).to_string()
    const song = this.collection.getSong(row)

    this.player.play(song.path)
  }

  onQueueRowActivated (view, path, column) {
    const row = utils.mapPathToRootModel(view.model, path).to_string()
    const song = this.queue.getSong(row)

    this.player.play(song.path)
  }

  onClickPlayOrPause (button) {
    if (button.get_active()) {
      this.player.play()
    } else {
      this.player.pause()
    }
  }

  onClickPlayPrevious (button) {
    log('PLAY PREVIOUS')
  }

  onClickPlayNext (button) {
    this.queueWatcher.next(true)
  }

  _onPlaybackStarted () {
    this.ui.buttonPlayOrPause.set_active(true)
  }

  _onPlaybackStopped () {
    this.ui.buttonPlayOrPause.set_active(false)
  }

  _onMetadataChanged (sender, tags) {
    this.ui.headerBar.set_title(tags.title)
    this.ui.headerBar.set_subtitle(`${tags.artist} • ${tags.album}`)
  }

  _onDurationChanged (sender, value) {
    this.ui.scaleSeeker.set_range(0, value)
  }

  _onProgressChanged (sender, value) {
    /**
     * Use full seconds to make both UI labels update at the same time for finer
     * aesthetics.
     */
    const duration = Math.round(this.player.lastCachedDuration() / 1000)
    const timeGone = Math.round(value / 1000)
    const timeLeft = duration - timeGone

    this.ui.scaleSeeker.set_value(value)
    this.ui.scaleSeeker.set_fill_level(value)

    this.ui.labelFirstProgress.set_text(utils.formatProgressTime(timeGone))
    this.ui.labelSecondProgress.set_text('-' + utils.formatProgressTime(timeLeft))
  }

  onSeekerAdjustBounds (seeker, value) {
    this.player.seekTo(value)
  }

  onClickToggleSearchBar (button) {
    this.ui.searchBar.set_search_mode(button.get_active())
  }

  onClickTogglePlaylistSidebar (button) {
    this.ui.revealerRightSidebar.set_reveal_child(button.get_active())

    /**
     * This hack is to avoid "Negative content width" warnings from GtkScrolledWindow
     * in console whenever the widget is hidden. This hack leaks one complaint
     * when the sidebar is being folded, but without it the widget would trigger
     * errors repeatedly.
     *
     * https://gitlab.gnome.org/GNOME/gtk/issues/1057
     *
     * NOTE: Seems to occur only when the revealer is not using any effect for
     * transitioning between states.
     */
    // if (button.get_active()) {
    //   this.ui.scrollerInsideRightSidebar.set_visible(true)
    // } else {
    //   Timer.once(this.ui.revealerRightSidebar.get_transition_duration(), () => {
    //     this.ui.scrollerInsideRightSidebar.set_visible(false)
    //   })
    // }
  }

  onSearchChanged (input) {
    this.filterModel.filterBy(input.text)
  }

  onStartSearch () {
    this.ui.buttonToggleSearchBar.set_active(true)
    this.ui.searchBar.set_search_mode(true)
  }

  onStopSearch () {
    this.ui.buttonToggleSearchBar.set_active(false)
    this.ui.searchBar.set_search_mode(false)
  }

  onSortingChanged (sender, value) {
    const [, iter] = this.ui.comboSorting.get_active_iter()
    const sortMode = this.ui.modelSortingOptions.get_value(iter, 0)

    this.sortModel.sortBy(sortMode)
  }

  addSelectedSongsToQueue () {
    const [paths, model] = this.ui.collectionView.get_selection().get_selected_rows()

    for (const path of paths) {
      const pos = utils.mapPathToRootModel(model, path).to_string()
      const song = this.collection.getSong(pos)

      this.queue.add(song)
    }
  }

  clearQueuedSongs () {
    this.queue.clear()
  }
}

class SongQueueWatcher {
  /**
   * @param queue QueueModel
   * @param collection CollectionModel
   */
  constructor (player, queueModel, collectionModel) {
    Object.assign(this, { player, queueModel, collectionModel })

    this.player.events.connect('need-next-song', this._onNeedNextSong.bind(this))
  }

  next (startPlayback = false) {
    if (this.queueModel.iter_n_children(null)) {
      const [ok, iter] = this.queueModel.get_iter_first()
      const path = this.queueModel.get_path(iter)
      const pos = utils.mapPathToRootModel(this.queueModel, path).to_string()
      const song = this.queueModel.queue.getSong(pos)

      this.queueModel.remove(iter)

      if (startPlayback) {
        this.player.play(song.path)
      } else {
        this.player.setPrefetch(song.path)
      }
    } else {
      log('FETCH FROM COLLECTION')
    }
  }

  _onNeedNextSong () {
    this.next()
  }
}
