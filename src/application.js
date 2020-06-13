const { Gio, GLib, GObject, Gst, Gtk } = imports.gi
const { MainWindow } = imports.window
const { Player } = imports.player

const UI_TEMPLATE_PATH = '/home/samu/Projects/experimental/gnome/monolake/ui/mainwindow.glade'
const SETTINGS_SCHEMA_PATH = '/home/samu/Projects/experimental/gnome/monolake/data/'

function openAboutDialog () {
  log('SHOW ABOUT DIALOG')
}

function openPreferencesDialog () {
  log('SHOW PREFERENCES DIALOG')
}

function saveMainWindowState (stateObject) {
  const config = new GLib.KeyFile()

  config.set_integer('MainWindow', 'Width', stateObject.get('width'))
  config.set_integer('MainWindow', 'Height', stateObject.get('height'))
  config.set_boolean('MainWindow', 'Maximized', stateObject.get('maximized'))

  config.save_to_file(GLib.build_filenamev(['tmp', 'state.ini']))
}

function restoreMainWindowState (stateObject) {
  try {
    const config = new GLib.KeyFile()
    config.load_from_file(GLib.build_filenamev(['tmp', 'state.ini']), GLib.KeyFileFlags.NONE)

    stateObject.set('width', config.get_integer('MainWindow', 'Width') || null)
    stateObject.set('height', config.get_integer('MainWindow', 'Height') || null)
    stateObject.set('maximized', config.get_boolean('MainWindow', 'Maximized') || null)
  } catch (error) {
    // State file does not exist yet, pass.
  }
}

function main (argv) {
  Gtk.init(null)
  Gst.init(null)

  const mainWindowState = new Map([
    ['width', null],
    ['height', null],
    ['maximized', null],
  ])

  const application = new Gtk.Application({
    application_id: 'fi.juvonet.monolake',
    flags: Gio.ApplicationFlags.FLAGS_NONE
  })

  const builder = new Gtk.Builder()
  builder.add_from_file(UI_TEMPLATE_PATH)

  const appWindow = builder.get_object('mainWindow')
  const player = new Player()
  // const settings = Gio.Settings.new_with_path('fi.juvonet.monolake')

  application.connect('startup', () => {
    const actionQuit = new Gio.SimpleAction({ name: 'quit' })

    actionQuit.connect('activate', () => {
      saveMainWindowState(mainWindowState)

      player.stop()
      application.quit()
    })

    const actionPreferences = new Gio.SimpleAction({ name: 'preferences' })
    actionPreferences.connect('activate', openPreferencesDialog)

    const actionAbout = new Gio.SimpleAction({ name: 'about' })
    actionAbout.connect('activate', openAboutDialog)

    application.add_action(actionPreferences)
    application.add_action(actionAbout)

    application.add_action(actionQuit)
    application.add_accelerator('<Primary>q', 'app.quit', null)
  })

  application.connect('activate', () => {
    appWindow.set_application(application)
    appWindow.present()

    restoreMainWindowState(mainWindowState)

    const window = new MainWindow(appWindow, builder, player, mainWindowState)
    window.setup()

    appWindow.connect('destroy', () => player.stop())
    appWindow.connect('destroy', () => application.quit())

    // Prevents garbage collection from destroying our app ;)
    application.antiGcWindowRef = window
  })

  appWindow.connect('destroy', () => {
    saveMainWindowState(mainWindowState)
  })

  return application.run(argv)
}
