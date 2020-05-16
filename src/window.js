#!env gjs

const { Gio, GObject, Gtk } = imports.gi
const { Collection, CollectionFilterModel, CollectionModel, CollectionSortModel } = imports.collection
const { Queue, QueueModel } = imports.collection
const { mapRowToRootModel, mapPathToRootModel } = imports.collection
const utils = imports.utils
const { Timer } = imports.timer

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
      'modelSortingOptions',
      'queueView',
      'revealerRightSidebar',
      'scaleSeeker',
      'scrollerInsideRightSidebar',
      'searchBar',
      'searchBarEntry',
    )

    this.createActions()

    this.collection = new Collection()
    this.collectionModel = new CollectionModel({ collection: this.collection })

    this.queue = new Queue()
    this.queueModel = new QueueModel({ queue: this.queue })
    this.ui.queueView.set_model(null)
    this.ui.queueView.set_model(this.queueModel)

    this.collection.events.connect('ready', () => {
      this.sortModel = new CollectionSortModel({
        model: this.collectionModel
      })

      this.filterModel = new CollectionFilterModel({
        child_model: this.sortModel
      })

      this.ui.collectionView.set_model(this.filterModel)
    })

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
    menu.append(_('Preferences'), 'app.preferences')
    menu.append(_('About Monolake'), 'app.about')

    this.ui.buttonAppMenu.set_menu_model(menu)
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

  createActions () {
    const addToQueue = new Gio.SimpleAction({ name: 'win.add-to-queue' })
    this._window.add_action(addToQueue)

    addToQueue.connect('activate', () => {
      log('ADD TO QUEUE!!!')
    })
  }

  onRowActivated (view, path, column) {
    const row = mapRowToRootModel(view.model, parseInt(path.to_string()))
    const song = this.collectionModel.getSong(row)

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
    log('PLAY NEXT')
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
    this.ui.scaleSeeker.set_value(value)
    this.ui.scaleSeeker.set_fill_level(value)

    this.ui.labelFirstProgress.set_text(utils.formatProgressTime(value))
  }

  onSeekerAdjustBounds (seeker, value) {
    // log(`ADJUST BOUNDS FOR ${value}`)
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
      const pos = mapPathToRootModel(model, path).to_string()
      const song = this.collection.getSong(pos)
      log('ADAD ' + pos + song)

      this.queue.add(song)
    }

    log('ADD SONGS TO QUEUE')
  }

  clearQueuedSongs () {
    log('CLEAR WHOLE QUEUE')
  }
}

class ViewModelManager {
  constructor (collection, viewModel) {
    this._collection = collection
    this._model = viewModel

    collection.events.connect('song-added', this._onItemAdded.bind(this))
  }

  _onItemAdded(emitter, track) {
    log('ADDED TRACK ' + track.title)
  }
}
