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

        const queue = new QueueProvider(this.queueModel, this.queueModel.queue)
        const collection = new CollectionProvider(this.filterModel, this.collection)

        this.playlistManager = new PlaylistManager(this.player, queue, collection)
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
    const [ok, iter] = view.model.get_iter(path)

    if (ok) {
      const sid = view.model.get_value(iter, 0)
      const song = this.collection.getSong(sid)
      this.player.play(song.path)

      this.playlistManager.collection.select(iter)
    }
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

  onSeekerAdjustBounds (seeker, value) {
    this.player.seekTo(value)
  }

  onClickToggleSearchBar (button) {
    this.ui.searchBar.set_search_mode(button.get_active())
  }

  onClickTogglePlaylistSidebar (button) {
    this.ui.revealerRightSidebar.set_reveal_child(button.get_active())
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

    this.player.events.connect('need-next-song', this._onNeedNextSong.bind(this))
  }

  next (startPlayback = false) {
    let song = null

    if (this.queue.hasNext()) {
      const iter = this.queue.select(this.queue.getNext())
      song = this.queue.getSong(iter)
    } else if (this.collection.hasNext()) {
      this.queue.getNext()

      const iter = this.collection.select(this.collection.getNext())
      song = this.collection.getSong(iter)
    }

    if (startPlayback) {
      this.player.play(song.path)
    } else {
      this.player.setPrefetch(song.path)
    }
  }

  _onNeedNextSong () {
    this.next()
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
  constructor (model, collection) {
    this.model = model
    this.collection = collection
    this.current = null
  }

  hasNext () {
    return true
  }

  getNext () {
    if (this.current) {
      let [ok, iter] = this.model.get_iter_first()

      while (ok) {
        if (this.model.get_value(iter, 0) === this.current) {
          return this.model.iter_next(iter) ? iter : null
        }

        ok = this.model.iter_next(iter)
      }
    }

    return this.model.get_iter_first()[1]
  }

  getSong (iter) {
    const sid = this.model.get_value(iter, 0)
    const song = this.collection.getSong(sid)

    return song
  }

  select (iter) {
    this.current = this.model.get_value(iter, 0)

    return iter
  }
}
