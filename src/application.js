const { Gio, Gst, Gtk } = imports.gi
const { MainWindow } = imports.window
const { Player } = imports.player

const TEMPLATE_PATH = '/home/samu/Projects/experimental/gnome/monolake/ui/mainwindow.glade'

function openAboutDialog () {
  log('SHOW ABOUT DIALOG')
}

function openPreferencesDialog () {
  log('SHOW PREFERENCES DIALOG')
}

function main (argv) {
  Gtk.init(null)
  Gst.init_check(null)

  const application = new Gtk.Application({
    application_id: 'fi.juvonet.Monolake',
    flags: Gio.ApplicationFlags.FLAGS_NONE
  })

  const builder = new Gtk.Builder()
  builder.add_from_file(TEMPLATE_PATH)

  const appWindow = builder.get_object('mainWindow')
  const player = new Player()

  application.connect('startup', () => {
    const actionQuit = new Gio.SimpleAction({ name: 'quit' })
    actionQuit.connect('activate', () => application.quit())

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

    const window = new MainWindow(appWindow, builder, player)

    appWindow.connect('destroy', () => player.stop())
    appWindow.connect('destroy', () => application.quit())
  })

  return application.run(argv)
}
