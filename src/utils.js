const { Gtk } = imports.gi

function formatProgressTime (stamp) {
  const minutes = stamp / 60 | 0
  const seconds = `${stamp % 60}`.padStart(2, '0')

  return `${minutes}:${seconds}`
}

function mapPathToRootModel (model, path) {
  let [, iter] = model.get_iter(path)

  while (true) {
    let childModel = null

    if (model instanceof Gtk.TreeModelSort) {
      childModel = model.model
    } else if (model instanceof Gtk.TreeModelFilter) {
      childModel = model.child_model
    }

    if (childModel) {
      iter = model.convert_iter_to_child_iter(iter)
      model = childModel
    } else {
      break
    }
  }

  const sourcePath = model.get_path(iter)

  return sourcePath
}
