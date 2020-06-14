#!env gjs

const { Gdk, Gio, GObject, Gtk } = imports.gi
const { Collection, CollectionMasterModel } = imports.collection
const { Queue, QueueModel } = imports.collection
const { EventEmitter } = imports.events
const { CollectionCellRenderer } = imports.renderers
const { Timer } = imports.timer
const utils = imports.utils

class PlaybackOptions {
  constructor () {
    this.repeat = false
    this.shuffle = false
  }
}

var MainWindow = class MainWindow {
  constructor (window, builder, player, settings, state) {
    if (state.get('width')) {
      window.resize(state.get('width'), state.get('height'))

      if (state.get('maximized')) {
        window.maximize()

        /**
         * When a window is maximized before being displayed, it seems that itss
         * initial size is discarded and window will therefore be restored with
         * a different size.
         *
         * This flag indicates that persisted geometry should be restored whem
         * the window is unmaximized  for the first time.
         */
        state.set('reset_size_after_unmaximize', true)
      }
    }

    this._window = window
    this._builder = builder
    this._state = state
    this._settings = settings

    this.player = player
    this.playbackOptions = new PlaybackOptions()

    this.bindSignals()

    this.bindChildren(
      'buttonAppMenu',
      'buttonPlayOrPause',
      'buttonPlayPrevious',
      'buttonPlayNext',
      'buttonRepeat',
      'buttonShuffle',
      'buttonToggleSearchBar',
      'collectionView',
      'comboSorting',
      'headerBar',
      'imageScoreOne',
      'imageScoreTwo',
      'imageScoreThree',
      'imageScoreFour',
      'imageScoreFive',
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
    // this.collectionModel = new CollectionModel({ collection: this.collection })

    this.queue = new Queue()
    this.queueModel = new QueueModel({ queue: this.queue })

    this.ui.queueView.set_model(this.queueModel)

    /**
     * BUG: Glade allows to define this but it actually has no effect.
     */
    // this.ui.collectionView.set_search_column(-1)
    this.ui.collectionView.get_selection().set_mode(Gtk.SelectionMode.MULTIPLE)
    this.ui.collectionView.set_property('enable-search', false)

    this.player.events.connect('metadata-changed', this._onMetadataChanged.bind(this))
    this.player.events.connect('playback-started', this._onPlaybackStarted.bind(this))
    this.player.events.connect('playback-stopped', this._onPlaybackStopped.bind(this))
    this.player.events.connect('duration-changed', this._onDurationChanged.bind(this))
    this.player.events.connect('progress-changed', this._onProgressChanged.bind(this))

    this._settings.connect('changed', this._onSettingsChange.bind(this))

    const menu = new Gio.Menu()
    menu.append('Preferences', 'app.preferences')
    menu.append('About Monolake', 'app.about')

    this.ui.buttonAppMenu.set_menu_model(menu)
  }

  async setup () {
    this.collectionMasterModel = new CollectionMasterModel({ collection: this.collection })

    await this.collection.load()

    const queue = new QueueProvider(this.queueModel, this.queueModel.queue)
    const collection = new CollectionProvider(this.collectionMasterModel, this.collection, this.playbackOptions)

    this.playlistManager = new PlaylistManager(this.player, queue, collection)
    this.playlistManager.events.connect('song-changed', this._onSongChanged.bind(this))

    const cellRenderer = new CollectionCellRenderer(
      this.playlistManager.collection,
      this.ui.collectionView
    )

    const cellRendererFunc = cellRenderer.render.bind(cellRenderer)

    for (const treeColumn of this.ui.collectionView.get_columns()) {
      for (const renderer of treeColumn.get_cells()) {
        treeColumn.set_cell_data_func(renderer, cellRendererFunc)
      }
    }

    this.ui.collectionView.set_model(this.collectionMasterModel)

    /**
     * Avoid garbage collection.
     */
    this.collectionCellRenderer = cellRenderer
    this.collectionCellRendererFunc = cellRendererFunc
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
    const [ok, iter] = view.model.get_iter(path)

    if (ok) {
      const sid = view.model.get_value(iter, 0)
      const song = this.collection.getSong(sid)

      this.playlistManager.play(song)
      this.playlistManager.collection.select(iter)
    }
  }

  onCollectionViewResized (view, size) {
    const genreVisible = size.width > 750
    const coverVisible = size.width > 640

    if (!('isGenreColumnVisible' in this)) {
      this.isGenreColumnVisible = true
    }

    if (!('isCoverArtColumnVisible' in this)) {
      this.isCoverArtColumnVisible = true
    }

    if (this.isGenreColumnVisible ^ genreVisible) {
      this.isGenreColumnVisible = genreVisible
      view.get_column(6).set_property('visible', genreVisible)
    }

    if (this.isCoverArtColumnVisible ^ coverVisible) {
      this.isCoverArtColumnVisible = coverVisible
      view.get_column(0).set_property('visible', coverVisible)
    }
  }

  onPlaybackOptionsChanged () {
    this.playbackOptions.repeat = this.ui.buttonRepeat.get_active()
    this.playbackOptions.shuffle = this.ui.buttonShuffle.get_active()
  }

  onQueueRowActivated (view, path, column) {
    const row = utils.mapPathToRootModel(view.model, path).to_string()
    const song = this.queue.getSong(row)

    this.playlistManager.play(song)
  }

  onClickPlayOrPause (button) {
    if (button.get_active()) {
      this.player.play()
    } else {
      this.player.pause()
    }
  }

  onClickPlayPrevious (button) {
    this.playlistManager.previous(true)
  }

  onClickPlayNext (button) {
    this.playlistManager.next(true)
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

  _onSettingsChange (sender, key) {
    log('SETTINGS CHANGED ' + this._settings.get_value(key))

    const buttons = new Map([
      ['queue-open', 'buttonToggleQueueSidebar'],
      ['repeat', 'buttonRepeat'],
      ['search-mode', 'buttonToggleSearchBar'],
      ['shuffle', 'buttonShuffle'],
    ])

    if (buttons.has(key)) {
      const buttonName = buttons.get(key)
      const button = this._builder.get_object(buttonName)

      if (button) {
        button.set_active(this._settings.get_boolean(key))
      }
    }
  }

  onSeekerAdjustBounds (seeker, value) {
    this.player.seekTo(value)
  }

  onClickToggleSearchBar (button) {
    this.ui.searchBar.set_search_mode(button.get_active())
  }

  onClickTogglePlaylistSidebar (button) {
    this.ui.revealerRightSidebar.set_reveal_child(button.get_active())
  }

  onScoreButtonClicked (button) {
    const iter = this.playlistManager.collection.getCurrentIter()

    if (iter) {
      const buttons = new WeakMap([
        [this._builder.get_object('buttonScoreOne'), 1],
        [this._builder.get_object('buttonScoreTwo'), 2],
        [this._builder.get_object('buttonScoreThree'), 3],
        [this._builder.get_object('buttonScoreFour'), 4],
        [this._builder.get_object('buttonScoreFive'), 5],
      ])

      const score = buttons.get(button) || 0

      this.updateMainScoreButtons(score)
      this.collectionMasterModel.setSongRating(iter, score)
    }
  }

  onSearchChanged (input) {
    this.collectionMasterModel.filterBy(input.text)
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

    this.collectionMasterModel.sortBy(sortMode)
  }

  onWindowResize () {
    const [width, height] = this._window.get_size()

    this._state.set('maximized', this._window.is_maximized)

    if (!this._window.is_maximized) {
      this._state.set('width', width)
      this._state.set('height', height)
    }

    if (this._window.is_maximized && this._state.has('reset_size_after_unmaximize')) {
      this._window.resize(this._state.get('width'), this._state.get('height'))
      this._state.delete('reset_size_after_unmaximize')
    }
  }

  _onSongChanged (sender, song) {
    this.ui.collectionView.queue_draw()
    this.updateMainScoreButtons(song.rating)

    this._builder.get_object('buttonLoved').set_active(song.loved)
  }

  updateMainScoreButtons (score) {
    const scoreButtons = ['imageScoreOne', 'imageScoreTwo', 'imageScoreThree', 'imageScoreFour', 'imageScoreFive']

    const [iconOff, iconOn] = ['non-starred-symbolic', 'starred-symbolic']

    for (const [i, bid] of scoreButtons.entries()) {
      this.ui[bid].set_property('icon-name', score > i ? iconOn : iconOff)
    }
  }

  addSelectedSongsToQueue () {
    const [paths, model] = this.ui.collectionView.get_selection().get_selected_rows()

    for (const path of paths) {
      const [ok, iter] = this.ui.collectionView.model.get_iter(path)

      if (ok) {
        const sid = this.ui.collectionView.model.get_value(iter, 0)
        const song = this.collection.getSong(sid)

        this.queue.add(song)
      }
    }
  }

  clearQueuedSongs () {
    this.queue.clear()
  }
}

class PlaylistManager {
  constructor (player, queue, collection) {
    Object.assign(this, { player, queue, collection })

    this.events = new EventEmitter()

    this.player.events.connect('need-next-song', this._onNeedNextSong.bind(this))
    this.player.events.connect('song-changed', this._onSongChanged.bind(this))
  }

  previous () {
    if (this.collection.hasPrevious()) {
      const iter = this.collection.select(this.collection.getPrevious())
      const song = this.collection.getSong(iter)

      if (song) {
        this.play(song)
        return
      }
    }

    this.player.stop()
  }

  next (startPlayback = false) {
    let song = null

    if (this.queue.hasNext()) {
      const iter = this.queue.select(this.queue.getNext())
      song = this.queue.getSong(iter)
    } else if (this.collection.hasNext()) {
      /**
       * Pop the previously active item in queue.
       */
      this.queue.getNext()

      const iter = this.collection.select(this.collection.getNext())
      song = this.collection.getSong(iter)
    }

    if (song) {
      if (startPlayback) {
        this.player.play(song.path)
      } else {
        this.player.setPrefetch(song.path)
      }
    } else {
      this.player.stop()
    }
  }

  play (song) {
    this.player.play(song.path)
  }

  _onNeedNextSong () {
    this.next()
  }

  _onSongChanged (sender, path) {
    const ref = this.collection.model.getRootReferenceForFile(path)
    const iter = this.collection.model.getIterFromRootReference(ref)
    const song = this.collection.model.getSongFromRootReference(ref)

    this.collection.select(iter)
    this.events.emit('song-changed', song)
  }
}

class QueueProvider {
  constructor (model, queue) {
    this.model = model
    this.queue = queue
    this.current = null
  }

  hasNext () {
    const cap = this.current ? 1 : 0
    return this.model.iter_n_children(null) > cap
  }

  getNext () {
    if (this.current) {
      this.model.remove(this.current)
    }

    const [ok, iter] =  this.model.get_iter_first()

    this.current = ok ? iter : null

    return this.current
  }

  getSong (iter) {
    const path = this.model.get_path(iter)
    const pos = utils.mapPathToRootModel(this.model, path).to_string()

    return this.queue.getSong(pos)
  }

  select (iter) {
    return iter
  }
}

class CollectionProvider {
  constructor (model, collection, playbackOptions) {
    this.model = model
    this.collection = collection
    this.playbackOptions = playbackOptions
    this.currentRoot = null
  }

  hasPrevious () {
    return true
  }

  getPrevious () {
    if (this.playbackOptions.shuffle) {
      return this.getNext()
    } else {
      if (this.currentRoot && this.currentRoot.valid()) {
        const iter = this.model.getIterFromRootReference(this.currentRoot)

        if (this.model.iter_previous(iter)) {
          return iter
        }

        if (!this.playbackOptions.repeat) {
          return null
        }
      }

      const last = this.model.iter_n_children(null) - 1
      const [ok, iter] = this.model.iter_nth_child(null, last)

      return ok ? iter : null
    }
  }

  hasNext () {
    return true
  }

  getNext () {
    if (this.playbackOptions.shuffle) {
      const max = this.model.iter_n_children(null) - 1
      const row = Math.round(Math.random() * max)

      return this.model.iter_nth_child(null, row)[1]
    } else {
      if (this.currentRoot) {
        const path = this.model.getPathFromRootReference(this.currentRoot)
        const current = parseInt(path.to_string())
        const [ok, iter] = this.model.iter_nth_child(null, current + 1)

        if (ok) {
          return iter
        } else if (this.playbackOptions.repeat) {
          return this.model.get_iter_first()[1]
        } else {
          return null
        }
      } else {
        return this.model.get_iter_first()[1]
      }
    }
  }

  getSong (iter) {
    if (iter) {
      const sid = this.model.get_value(iter, 0)
      const song = this.collection.getSong(sid)

      return song
    } else {
      return null
    }
  }

  select (iter) {
    if (iter) {
      this.currentRoot = this.model.getRootReference(iter)
    } else {
      this.currentRoot = null
    }

    return iter
  }

  getCurrentIter () {
    if (this.currentRoot) {
      return this.model.getIterFromRootReference(this.currentRoot)
    } else {
      return null
    }
  }

  getCurrentPath () {
    if (this.currentRoot) {
      return this.model.getPathFromRootReference(this.currentRoot)
    } else {
      return null
    }
  }
}
