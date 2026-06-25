const { CompositeDisposable, Disposable } = require("atom");

module.exports = {
  activate() {
    this.disposables = new CompositeDisposable(
      atom.config.observe("scrollmap-search-panel.threshold", (value) => {
        this.threshold = value;
      }),
      atom.config.observe("scrollmap-search-panel.permanent", (value) => {
        this.permanent = value;
      }),
    );
    this.service = null;
  },

  deactivate() {
    this.service = null;
    this.disposables.dispose();
  },

  consumeSearchPanel(service) {
    this.service = service;
    const updateAll = throttle(() => {
      if (!atom.workspace) return;
      const activeEditor = atom.workspace.getActiveTextEditor();
      for (const editor of atom.workspace.getTextEditors()) {
        const layer = editor.scrollmap?.layers.get("find");
        if (!layer) continue;
        let markers = [];
        if (editor === activeEditor && (this.permanent || this.service.isFindVisible())) {
          const markerLayer = this.service.resultsMarkerLayerForTextEditor(editor);
          if (markerLayer) {
            markers = markerLayer.getMarkers();
          }
        }
        layer.cache.set("data", markers);
        layer.update();
      }
    }, 50);
    const subscriptions = new CompositeDisposable();
    subscriptions.add(this.service.onDidUpdate(updateAll));
    subscriptions.add(this.service.onDidChangeFindVisibility(updateAll));
    return new Disposable(() => {
      this.service = null;
      updateAll.cancel();
      subscriptions.dispose();
    });
  },

  provideScrollmap() {
    return {
      name: "find",
      description: "Search panel result markers",
      initialize: ({ disposables, update }) => {
        disposables.add(
          atom.config.onDidChange("scrollmap-search-panel.permanent", update),
          atom.config.onDidChange("scrollmap-search-panel.threshold", update),
        );
      },
      getItems: ({ cache }) => {
        const data = cache.get("data") || [];
        // getMarkers() returns markers in creation-id order, not document
        // order, so sort by row before merging adjacent ranges.
        const ranges = data
          .map((marker) => marker.getScreenRange())
          .sort((a, b) => a.start.row - b.start.row || a.start.column - b.start.column);
        const items = [];
        let lastItem = null;
        for (const range of ranges) {
          const startRow = range.start.row;
          const endRow = range.end.row;
          if (lastItem && startRow <= lastItem.end + 1) {
            lastItem.end = Math.max(lastItem.end, endRow);
          } else {
            if (lastItem) items.push(lastItem);
            lastItem = { row: startRow, end: endRow };
          }
        }
        if (lastItem) items.push(lastItem);
        if (this.threshold && items.length > this.threshold) {
          return [];
        }
        return items;
      },
    };
  },
};

function throttle(func, timeout) {
  let timer = null;
  const throttled = (...args) => {
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      func.apply(this, args);
      timer = null;
    }, timeout);
  };
  throttled.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return throttled;
}
