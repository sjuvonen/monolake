const { Gtk } = imports.gi

var CollectionCellRenderer = class CollectionCellRenderer {
  constructor (provider, view) {
    this.provider = provider
    this.view = view
    this.cells = new Set()
    this.needsUpdating = false

    const styleContext = this.view.get_style_context()

    this.theme = {
      bg: {
        normal: styleContext.get_background_color(Gtk.StateFlags.NORMAL),
        active: styleContext.get_background_color(Gtk.StateFlags.SELECTED)
      }
    }

    this.theme.bg.active.alpha = 0.4

    this.view.connect('draw', this.onViewChanged.bind(this))
  }

  render (column, cell, model, iter) {
    if (!this.needsUpdating) {
      return
    }

    const path = model.get_path(iter)
    const delta = path.compare(this.activePath)

    if (delta === 0) {
      const hasFontWeight = cell instanceof Gtk.CellRendererText
      cell.set_property('cell-background-rgba', this.theme.bg.active)

      if (hasFontWeight) {
        cell.set_property('weight', 900)
      }

      this.cells.add(cell)
    } else if (this.cells.size) {
      for (const cell of this.cells) {
        const hasFontWeight = cell instanceof Gtk.CellRendererText

        cell.set_property('cell-background-rgba', this.theme.bg.normal)

        if (hasFontWeight) {
          cell.set_property('weight', 400)
        }
      }

      this.cells.clear()
    }
  }

  onViewChanged () {
    /**
     * Reading model values and setting renderer properties is really expensive,
     * so we want to minimize calling those methods.
     */

    if (this.cells.size) {
      this.needsUpdating = true
      return
    }

    try {
      const [ok, start, end] = this.view.get_visible_range()

      if (ok) {
        this.activePath = this.provider.getCurrentPath()

        const a = this.activePath.compare(start)
        const b = this.activePath.compare(end)

        this.needsUpdating = a !== b
      }
    } catch (error) {
      this.activePath = null
      this.needsUpdating = false
    }
  }
}
